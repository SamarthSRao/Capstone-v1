package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const browserUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
const browserAccept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

func page(ip, ua string) visit {
	return visit{Method: "GET", URI: "/", Accept: browserAccept, UserAgent: ua, ClientIP: ip}
}

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (f *fakeClock) Now() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.t
}

func (f *fakeClock) Advance(d time.Duration) {
	f.mu.Lock()
	f.t = f.t.Add(d)
	f.mu.Unlock()
}

func newTestCounter() (*visitorCounter, *fakeClock) {
	clk := &fakeClock{t: time.Date(2026, 10, 14, 20, 0, 30, 0, time.UTC)}
	return newVisitorCounterWithClock(clk.Now), clk
}

func TestCountReasonExclusions(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(v *visit)
		want   string
	}{
		{"browser page load", func(v *visit) {}, ""},
		{"root with query string", func(v *visit) { v.URI = "/?utm_source=wa" }, ""},
		{"POST to root", func(v *visit) { v.Method = "POST" }, "not-get"},
		{"api call", func(v *visit) { v.URI = "/api/products" }, "not-root"},
		{"health check", func(v *visit) { v.URI = "/health" }, "not-root"},
		{"asset", func(v *visit) { v.URI = "/assets/index-abc.js" }, "not-root"},
		{"dashboard poll path", func(v *visit) { v.URI = "/api/orchestrator/api/target/status" }, "not-root"},
		{"fetch with json accept", func(v *visit) { v.Accept = "application/json" }, "not-html"},
		{"default curl accept", func(v *visit) { v.Accept = "*/*" }, "not-html"},
		{"no accept header", func(v *visit) { v.Accept = "" }, "not-html"},
		{"replay job header", func(v *visit) { v.LoadTest = "1" }, "load-test"},
		{"replay header even with html accept", func(v *visit) { v.LoadTest = "true" }, "load-test"},
		{"explicit zero is not a load test", func(v *visit) { v.LoadTest = "0" }, ""},
		{"kubelet probe", func(v *visit) { v.UserAgent = "kube-probe/1.30" }, "automation"},
		{"curl with html accept", func(v *visit) { v.UserAgent = "curl/8.5.0" }, "automation"},
		{"python requests", func(v *visit) { v.UserAgent = "python-requests/2.32" }, "automation"},
		{"locust", func(v *visit) { v.UserAgent = "locust/2.29" }, "automation"},
		{"search bot", func(v *visit) { v.UserAgent = "Mozilla/5.0 (compatible; Googlebot/2.1)" }, "automation"},
		{"empty user agent", func(v *visit) { v.UserAgent = "" }, "no-user-agent"},
		{"missing client ip", func(v *visit) { v.ClientIP = "" }, "no-client-ip"},
		{"garbage client ip", func(v *visit) { v.ClientIP = "not-an-ip" }, "no-client-ip"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			v := page("203.0.113.7", browserUA)
			tc.mutate(&v)
			if got := countReason(v); got != tc.want {
				t.Fatalf("countReason = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestRecordCountsUniqueAndPageviews(t *testing.T) {
	c, _ := newTestCounter()
	for _, v := range []visit{
		page("203.0.113.7", browserUA),
		page("203.0.113.7", browserUA),                     // same person refreshes
		page("203.0.113.8", browserUA),                     // different address
		page("203.0.113.7", "Mozilla/5.0 (iPhone) Safari"), // same address, other device
	} {
		if ok, why := c.Record(v); !ok {
			t.Fatalf("expected to count, skipped: %s", why)
		}
	}
	s := c.Summary()
	if s.TotalPageviews != 4 || s.TotalUnique != 3 {
		t.Fatalf("pageviews=%d unique=%d, want 4 and 3", s.TotalPageviews, s.TotalUnique)
	}
	last := s.PerMinute[len(s.PerMinute)-1]
	if last.Pageviews != 4 || last.NewUnique != 3 {
		t.Fatalf("current minute = %+v, want 4 pageviews and 3 new", last)
	}
}

func TestExcludedTrafficNeverChangesTheCounts(t *testing.T) {
	c, _ := newTestCounter()
	replay := page("10.244.0.9", "python-urllib3/2.0")
	replay.LoadTest = "1"
	api := visit{Method: "GET", URI: "/api/products", Accept: "application/json", UserAgent: browserUA, ClientIP: "203.0.113.7"}
	probe := visit{Method: "GET", URI: "/", Accept: "*/*", UserAgent: "kube-probe/1.30", ClientIP: "10.244.0.1"}
	for i := 0; i < 5000; i++ {
		for _, v := range []visit{replay, api, probe} {
			if ok, _ := c.Record(v); ok {
				t.Fatalf("excluded request was counted: %+v", v)
			}
		}
	}
	s := c.Summary()
	if s.TotalPageviews != 0 || s.TotalUnique != 0 {
		t.Fatalf("counts changed: %+v", s)
	}
	if ok, _ := c.Record(page("203.0.113.7", browserUA)); !ok {
		t.Fatal("a real page load after the noise was not counted")
	}
	if got := c.Summary().TotalUnique; got != 1 {
		t.Fatalf("unique = %d, want 1", got)
	}
}

func TestSaltRotatesDailyAndNothingRawIsKept(t *testing.T) {
	c, clk := newTestCounter() // 2026-10-14 20:00:30 UTC
	c.Record(page("203.0.113.7", browserUA))
	c.Record(page("203.0.113.7", browserUA))
	if got := c.Summary().TotalUnique; got != 1 {
		t.Fatalf("day 1 unique = %d, want 1", got)
	}
	firstSalt := string(c.salt)
	clk.Advance(5 * time.Hour) // 01:00 UTC next day
	c.Record(page("203.0.113.7", browserUA))
	s := c.Summary()
	if string(c.salt) == firstSalt {
		t.Fatal("salt was not replaced on the new day")
	}
	if s.TotalUnique != 2 || s.TotalPageviews != 3 {
		t.Fatalf("unique=%d pageviews=%d, want 2 and 3 (same visitor, new day)", s.TotalUnique, s.TotalPageviews)
	}
	if len(c.seen) != 1 {
		t.Fatalf("seen set holds %d entries after rollover, want 1", len(c.seen))
	}
	// The seen set is keyed by a 16 byte hash, never by the address or agent.
	for k := range c.seen {
		if strings.Contains(string(k[:]), "203.0.113") {
			t.Fatal("raw address found in a stored key")
		}
	}
	// The JSON must not carry the address or the agent either.
	body, _ := json.Marshal(c.Summary())
	if strings.Contains(string(body), "203.0.113") || strings.Contains(string(body), "Mozilla") {
		t.Fatalf("summary leaks request data: %s", body)
	}
}

func TestSameVisitorSameDayHashesEqualDifferentSaltDiffer(t *testing.T) {
	c, _ := newTestCounter()
	c.Record(page("203.0.113.7", browserUA))
	a := c.hash("203.0.113.7", browserUA)
	if a != c.hash("203.0.113.7", browserUA) {
		t.Fatal("hash is not stable within a day")
	}
	c.rotateSalt("2026-10-15")
	if a == c.hash("203.0.113.7", browserUA) {
		t.Fatal("hash did not change with the salt")
	}
}

func TestPerMinuteSeriesIs60MinutesOldestFirstAndPrunes(t *testing.T) {
	c, clk := newTestCounter()
	c.Record(page("203.0.113.1", browserUA))
	clk.Advance(3 * time.Minute)
	c.Record(page("203.0.113.2", browserUA))
	c.Record(page("203.0.113.3", browserUA))

	s := c.Summary()
	if len(s.PerMinute) != 60 || s.WindowMinutes != 60 {
		t.Fatalf("series has %d rows", len(s.PerMinute))
	}
	for i := 1; i < len(s.PerMinute); i++ {
		a, _ := time.Parse(time.RFC3339, s.PerMinute[i-1].Time)
		b, _ := time.Parse(time.RFC3339, s.PerMinute[i].Time)
		if b.Sub(a) != time.Minute {
			t.Fatalf("rows %d and %d are not one minute apart", i-1, i)
		}
	}
	if got := s.PerMinute[59]; got.Pageviews != 2 || got.NewUnique != 2 {
		t.Fatalf("last minute = %+v", got)
	}
	if got := s.PerMinute[56]; got.Pageviews != 1 || got.NewUnique != 1 {
		t.Fatalf("three minutes earlier = %+v", got)
	}
	if got := s.PerMinute[58]; got.Pageviews != 0 {
		t.Fatalf("an empty minute should be zero, got %+v", got)
	}

	clk.Advance(61 * time.Minute) // everything above is now older than 60 min
	s = c.Summary()
	for _, row := range s.PerMinute {
		if row.Pageviews != 0 {
			t.Fatalf("old minute still in window: %+v", row)
		}
	}
	// Totals are not a window: they keep the earlier visitors.
	if s.TotalPageviews != 3 || s.TotalUnique != 3 {
		t.Fatalf("totals = %d / %d, want 3 / 3", s.TotalPageviews, s.TotalUnique)
	}
}

func TestSeenSetIsBounded(t *testing.T) {
	c, _ := newTestCounter()
	c.Record(page("203.0.113.1", browserUA))
	// Fill the set directly, then check that more visitors still count as
	// page loads but stop adding to the set.
	for i := 0; len(c.seen) < maxSeenVisitors; i++ {
		var k [16]byte
		k[0], k[1], k[2], k[3] = byte(i), byte(i>>8), byte(i>>16), 0xEE
		c.seen[k] = struct{}{}
	}
	before := c.Summary()
	c.Record(page("198.51.100.77", browserUA))
	after := c.Summary()
	if after.TotalPageviews != before.TotalPageviews+1 {
		t.Fatal("page load past the cap was dropped")
	}
	if len(c.seen) != maxSeenVisitors {
		t.Fatalf("seen grew past the cap: %d", len(c.seen))
	}
}

func TestConcurrentRecord(t *testing.T) {
	c, _ := newTestCounter()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				c.Record(page("203.0.113.9", browserUA))
				c.Summary()
			}
		}(i)
	}
	wg.Wait()
	s := c.Summary()
	if s.TotalPageviews != 5000 || s.TotalUnique != 1 {
		t.Fatalf("pageviews=%d unique=%d, want 5000 and 1", s.TotalPageviews, s.TotalUnique)
	}
}

func serve(c *visitorCounter) *http.ServeMux {
	mux := http.NewServeMux()
	registerVisitorRoutes(mux, c)
	return mux
}

func postVisit(mux *http.ServeMux, h map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/target/visit", nil)
	for k, v := range h {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestHTTPRecordAndSummary(t *testing.T) {
	c, _ := newTestCounter()
	mux := serve(c)

	real := map[string]string{
		"X-Orig-Method": "GET", "X-Orig-URI": "/", "Accept": browserAccept,
		"User-Agent": browserUA, "X-Visitor-IP": "203.0.113.7",
	}
	if rec := postVisit(mux, real); rec.Code != http.StatusNoContent || rec.Header().Get("X-Visit-Counted") != "1" {
		t.Fatalf("real visit: %d counted=%q", rec.Code, rec.Header().Get("X-Visit-Counted"))
	}
	replay := map[string]string{
		"X-Orig-Method": "GET", "X-Orig-URI": "/", "Accept": browserAccept,
		"User-Agent": "python-urllib3", "X-Visitor-IP": "10.244.0.9", "X-Load-Test": "1",
	}
	rec := postVisit(mux, replay)
	if rec.Header().Get("X-Visit-Counted") != "0" || rec.Header().Get("X-Visit-Skipped") != "load-test" {
		t.Fatalf("replay visit headers: %v", rec.Header())
	}

	get := httptest.NewRecorder()
	mux.ServeHTTP(get, httptest.NewRequest(http.MethodGet, "/api/target/visitors", nil))
	if get.Code != 200 || !strings.HasPrefix(get.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("summary: %d %q", get.Code, get.Header().Get("Content-Type"))
	}
	var s visitorSummary
	if err := json.Unmarshal(get.Body.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	if s.TotalUnique != 1 || s.TotalPageviews != 1 || len(s.PerMinute) != 60 {
		t.Fatalf("summary = %+v", s)
	}
}

func TestHTTPMethods(t *testing.T) {
	c, _ := newTestCounter()
	mux := serve(c)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/target/visit", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET /visit = %d, want 405", rec.Code)
	}
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(m, "/api/target/visitors", nil))
		if rec.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s /visitors = %d, want 405", m, rec.Code)
		}
	}
	if c.Summary().TotalPageviews != 0 {
		t.Fatal("a rejected method changed the counts")
	}
}
