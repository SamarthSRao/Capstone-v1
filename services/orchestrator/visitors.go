package main

// Real-visitor counter for the storefront.
//
// nginx-lb mirrors browser page loads of "/" to POST /api/target/visit
// (see k8s/02-target-app.yaml). This file decides whether a mirrored request
// really is a person opening the page, counts it, and serves the read-only
// summary at GET /api/target/visitors.
//
// Privacy: no cookies, no raw IP addresses and no user agents are stored.
// A visitor is sha256(daily salt | client IP | user agent), truncated to 16
// bytes. The salt is random, lives in memory only and is replaced every UTC
// day, so a hash cannot be linked across days and cannot be reversed after
// the salt is gone. Everything is in memory. A restart of the orchestrator
// starts the counters again from zero.

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	// visitorWindowMinutes is how many per-minute buckets are served.
	visitorWindowMinutes = 60
	// maxSeenVisitors bounds memory for the "seen today" set. Past it a new
	// visitor is still counted as a page load but not as a new unique.
	maxSeenVisitors = 200000
)

// visit is the part of a mirrored request that the counting rule looks at.
type visit struct {
	Method    string // original method, from X-Orig-Method
	URI       string // original request URI, from X-Orig-URI
	Accept    string
	UserAgent string
	LoadTest  string // X-Load-Test header; set by the replay and load generators
	ClientIP  string // X-Visitor-IP, the address nginx-lb saw
}

// automationAgents are user-agent fragments (lower case) of tools and bots
// that are not a person with a browser. Load generators are also excluded by
// X-Load-Test; this list covers probes and scripts that do not send it.
var automationAgents = []string{
	"kube-probe", "curl/", "wget/", "python-requests", "python-urllib",
	"go-http-client", "locust", "k6/", "apachebench", "wrk/", "hey/",
	"httpclient", "okhttp", "libwww", "bot", "crawler", "spider", "slurp",
	"headlesschrome", "prometheus", "uptime",
}

// countReason is "" when the visit counts, otherwise why it was left out.
func countReason(v visit) string {
	if strings.ToUpper(v.Method) != http.MethodGet {
		return "not-get"
	}
	path := v.URI
	if u, err := url.ParseRequestURI(v.URI); err == nil {
		path = u.Path
	} else if i := strings.IndexByte(path, '?'); i >= 0 {
		path = path[:i]
	}
	if path != "/" {
		return "not-root"
	}
	if !strings.Contains(strings.ToLower(v.Accept), "text/html") {
		return "not-html"
	}
	if lt := strings.TrimSpace(v.LoadTest); lt != "" && lt != "0" {
		return "load-test"
	}
	ua := strings.ToLower(strings.TrimSpace(v.UserAgent))
	if ua == "" {
		return "no-user-agent"
	}
	for _, frag := range automationAgents {
		if strings.Contains(ua, frag) {
			return "automation"
		}
	}
	if net.ParseIP(strings.TrimSpace(v.ClientIP)) == nil {
		return "no-client-ip"
	}
	return ""
}

type minuteBucket struct {
	pageviews int
	newUnique int
}

type visitorCounter struct {
	mu          sync.Mutex
	now         func() time.Time
	startedAt   time.Time
	salt        []byte
	saltDay     string
	seen        map[[16]byte]struct{}
	uniqueTotal int
	pageviews   int
	minutes     map[int64]*minuteBucket // unix minute -> bucket
}

func newVisitorCounter() *visitorCounter {
	return newVisitorCounterWithClock(time.Now)
}

func newVisitorCounterWithClock(now func() time.Time) *visitorCounter {
	return &visitorCounter{
		now:       now,
		startedAt: now().UTC(),
		seen:      make(map[[16]byte]struct{}),
		minutes:   make(map[int64]*minuteBucket),
	}
}

// rotateSalt starts a new day: new random salt, empty seen set. It must be
// called with c.mu held.
func (c *visitorCounter) rotateSalt(day string) {
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		// crypto/rand does not fail on supported platforms. Failing closed
		// (a fixed salt would make hashes linkable) is not possible here,
		// so fall back to the time, which is still unknown to a client.
		copy(salt, []byte(c.now().UTC().Format(time.RFC3339Nano)))
	}
	c.salt = salt
	c.saltDay = day
	c.seen = make(map[[16]byte]struct{})
}

func (c *visitorCounter) hash(ip, ua string) [16]byte {
	h := sha256.New()
	h.Write(c.salt)
	h.Write([]byte{0})
	h.Write([]byte(ip))
	h.Write([]byte{0})
	h.Write([]byte(ua))
	var out [16]byte
	copy(out[:], h.Sum(nil))
	return out
}

func (c *visitorCounter) pruneLocked(nowMinute int64) {
	cutoff := nowMinute - visitorWindowMinutes + 1
	for m := range c.minutes {
		if m < cutoff {
			delete(c.minutes, m)
		}
	}
}

// Record counts v if it is a real page load. It returns whether it counted
// and, if not, the reason.
func (c *visitorCounter) Record(v visit) (bool, string) {
	if reason := countReason(v); reason != "" {
		return false, reason
	}
	t := c.now().UTC()
	day := t.Format("2006-01-02")
	minute := t.Unix() / 60

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.saltDay != day {
		c.rotateSalt(day)
	}
	c.pruneLocked(minute)
	b := c.minutes[minute]
	if b == nil {
		b = &minuteBucket{}
		c.minutes[minute] = b
	}
	b.pageviews++
	c.pageviews++

	key := c.hash(strings.TrimSpace(v.ClientIP), v.UserAgent)
	if _, ok := c.seen[key]; !ok && len(c.seen) < maxSeenVisitors {
		c.seen[key] = struct{}{}
		c.uniqueTotal++
		b.newUnique++
	}
	return true, ""
}

type visitorMinute struct {
	Time      string `json:"t"`
	Pageviews int    `json:"pageviews"`
	NewUnique int    `json:"new_unique"`
}

type visitorSummary struct {
	TotalUnique    int             `json:"total_unique"`
	TotalPageviews int             `json:"total_pageviews"`
	WindowMinutes  int             `json:"window_minutes"`
	PerMinute      []visitorMinute `json:"per_minute"`
	Since          string          `json:"since"`
	Counts         string          `json:"counts"`
}

// Summary returns the totals and the last visitorWindowMinutes minutes,
// oldest first, with empty minutes filled in as zero.
func (c *visitorCounter) Summary() visitorSummary {
	t := c.now().UTC()
	nowMinute := t.Unix() / 60
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pruneLocked(nowMinute)
	series := make([]visitorMinute, 0, visitorWindowMinutes)
	for i := int64(visitorWindowMinutes - 1); i >= 0; i-- {
		m := nowMinute - i
		row := visitorMinute{Time: time.Unix(m*60, 0).UTC().Format(time.RFC3339)}
		if b := c.minutes[m]; b != nil {
			row.Pageviews = b.pageviews
			row.NewUnique = b.newUnique
		}
		series = append(series, row)
	}
	return visitorSummary{
		TotalUnique:    c.uniqueTotal,
		TotalPageviews: c.pageviews,
		WindowMinutes:  visitorWindowMinutes,
		PerMinute:      series,
		Since:          c.startedAt.Format(time.RFC3339),
		Counts:         "page loads of / with Accept: text/html; excludes replay and load-test traffic, API calls, health checks and known bots; unique = daily salted hash of client address and user agent",
	}
}

// recordHandler is POST /api/target/visit. Only nginx-lb calls it, from
// inside the cluster; the dashboard nginx does not proxy this path.
func (c *visitorCounter) recordHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
		return
	}
	counted, reason := c.Record(visit{
		Method:    r.Header.Get("X-Orig-Method"),
		URI:       r.Header.Get("X-Orig-URI"),
		Accept:    r.Header.Get("Accept"),
		UserAgent: r.Header.Get("User-Agent"),
		LoadTest:  r.Header.Get("X-Load-Test"),
		ClientIP:  r.Header.Get("X-Visitor-IP"),
	})
	if counted {
		w.Header().Set("X-Visit-Counted", "1")
	} else {
		w.Header().Set("X-Visit-Counted", "0")
		w.Header().Set("X-Visit-Skipped", reason)
	}
	w.WriteHeader(http.StatusNoContent)
}

// summaryHandler is GET /api/target/visitors, read only.
func (c *visitorCounter) summaryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Only GET allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(c.Summary())
}

func registerVisitorRoutes(mux *http.ServeMux, c *visitorCounter) {
	mux.HandleFunc("/api/target/visit", c.recordHandler)
	mux.HandleFunc("/api/target/visitors", c.summaryHandler)
}
