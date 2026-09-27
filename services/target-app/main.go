package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

type Product struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Category    string  `json:"category"`
	Price       float64 `json:"price"`
	Image       string  `json:"image"`
	Description string  `json:"description"`
}

var catalog = []Product{
	{ID: 1, Name: "Vintage Leather Backpack", Category: "Accessories", Price: 89.99, Image: "🎒", Description: "Handcrafted full-grain leather backpack with laptop compartment."},
	{ID: 2, Name: "Wireless Noise-Cancelling Headphones", Category: "Electronics", Price: 199.99, Image: "🎧", Description: "Active noise cancellation with 40-hour battery life."},
	{ID: 3, Name: "Mechanical Gaming Keyboard", Category: "Electronics", Price: 129.50, Image: "⌨️", Description: "RGB backlit mechanical keyboard with hot-swappable switches."},
	{ID: 4, Name: "Stainless Steel Thermal Flask", Category: "Home", Price: 34.99, Image: "🍶", Description: "Double-walled vacuum insulated bottle keeps drinks cold for 24 hours."},
	{ID: 5, Name: "Ultra-Lightweight Running Shoes", Category: "Footwear", Price: 119.00, Image: "👟", Description: "Responsive cushioning for maximum speed and shock absorption."},
	{ID: 6, Name: "Classic Chronograph Watch", Category: "Accessories", Price: 249.00, Image: "⌚", Description: "Sapphire crystal glass with precision quartz movement."},
}

var (
	hostname       string
	totalRequests  uint64
	totalCheckouts uint64
	cartMu         sync.Mutex
	cartItems      = make(map[string][]int) // sessionID -> productIDs
)

const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Online Boutique — Cloud Store</title>
    <style>
        :root {
            --primary: #2563eb;
            --primary-hover: #1d4ed8;
            --bg: #0f172a;
            --card-bg: #1e293b;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --accent: #10b981;
            --border: #334155;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: var(--bg); color: var(--text); padding-bottom: 60px; }
        header { background: #1e293b88; backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 20px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; }
        .logo span { color: var(--primary); }
        .badge-replica { background: #0284c722; color: #38bdf8; border: 1px solid #0284c744; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .pulse-dot { width: 8px; height: 8px; background: #38bdf8; border-radius: 50%; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .container { max-width: 1200px; margin: 32px auto; padding: 0 24px; }
        .hero { text-align: center; margin-bottom: 40px; }
        .hero h1 { font-size: 36px; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.5px; }
        .hero p { color: var(--text-muted); font-size: 16px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 24px; transition: transform 0.2s, border-color 0.2s; display: flex; flex-direction: column; justify-content: space-between; }
        .card:hover { transform: translateY(-4px); border-color: var(--primary); }
        .card-icon { font-size: 56px; text-align: center; margin-bottom: 16px; }
        .card-cat { color: var(--primary); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
        .card-title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
        .card-desc { color: var(--text-muted); font-size: 14px; margin-bottom: 20px; line-height: 1.4; flex-grow: 1; }
        .card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 16px; }
        .card-price { font-size: 22px; font-weight: 800; color: var(--accent); }
        .btn-buy { background: var(--primary); color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
        .btn-buy:hover { background: var(--primary-hover); }
        .toast { position: fixed; bottom: 24px; right: 24px; background: #065f46; color: #a7f3d0; border: 1px solid #059669; padding: 16px 24px; border-radius: 12px; display: none; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); z-index: 999; font-weight: 600; }
    </style>
</head>
<body>
    <header>
        <div class="logo">🛒 Online Boutique <span>Cloud</span></div>
        <div class="badge-replica"><div class="pulse-dot"></div> Served by: <span id="replica-name">{{.Hostname}}</span></div>
    </header>

    <div class="container">
        <div class="hero">
            <h1>High-Performance Cloud Store</h1>
            <p>Autonomously protected by HybridTimeNet Predictive Autoscaler. Zero downtime, zero dropped carts.</p>
        </div>

        <div class="grid">
            {{range .Products}}
            <div class="card">
                <div>
                    <div class="card-icon">{{.Image}}</div>
                    <div class="card-cat">{{.Category}}</div>
                    <div class="card-title">{{.Name}}</div>
                    <div class="card-desc">{{.Description}}</div>
                </div>
                <div class="card-footer">
                    <div class="card-price">${{printf "%.2f" .Price}}</div>
                    <button class="btn-buy" onclick="checkout({{.ID}}, '{{.Name}}')">Buy Now</button>
                </div>
            </div>
            {{end}}
        </div>
    </div>

    <div id="toast" class="toast"></div>

    <script>
        async function checkout(id, name) {
            const btn = event.target;
            btn.disabled = true;
            btn.innerText = "Processing...";
            try {
                const res = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_id: id, quantity: 1, session_id: 'user-' + Math.random().toString(36).substr(2, 9) })
                });
                const data = await res.json();
                const servedBy = res.headers.get('X-Served-By') || data.served_by;
                showToast("✅ Order Confirmed: " + name + " (Served by " + servedBy + ")");
            } catch (e) {
                showToast("❌ Checkout error: " + e.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Buy Now";
            }
        }

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.innerText = msg;
            t.style.display = 'block';
            setTimeout(() => { t.style.display = 'none'; }, 3500);
        }
    </script>
</body>
</html>`

func main() {
	var err error
	hostname, err = os.Hostname()
	if err != nil {
		hostname = "target-app-instance"
	}

	tmpl := template.Must(template.New("index").Parse(indexHTML))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddUint64(&totalRequests, 1)
		w.Header().Set("X-Served-By", hostname)
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		data := struct {
			Hostname string
			Products []Product
		}{
			Hostname: hostname,
			Products: catalog,
		}
		tmpl.Execute(w, data)
	})

	http.HandleFunc("/api/products", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddUint64(&totalRequests, 1)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Served-By", hostname)
		json.NewEncoder(w).Encode(catalog)
	})

	http.HandleFunc("/api/checkout", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddUint64(&totalRequests, 1)
		atomic.AddUint64(&totalCheckouts, 1)
		
		// Simulate 10-35ms database transaction
		time.Sleep(time.Duration(10+rand.Intn(25)) * time.Millisecond)

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Served-By", hostname)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"order_id":  rand.Intn(900000) + 100000,
			"status":    "confirmed",
			"served_by": hostname,
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Served-By", hostname)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy","hostname":"` + hostname + `"}`))
	})

	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"hostname":        hostname,
			"total_requests":  atomic.LoadUint64(&totalRequests),
			"total_checkouts": atomic.LoadUint64(&totalCheckouts),
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("[Target-App] Open-Source Online Boutique starting on :%s (Host: %s)\n", port, hostname)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
