package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/lib/pq"
)

var db *sql.DB

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://nexus:nexusgear123@localhost:5432/nexusgear?sslmode=disable"
	}

	var err error
	db, err = sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to open DB: %v", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err = db.Ping(); err != nil {
		log.Fatalf("Failed to ping DB: %v", err)
	}

	log.Println("[API] Connected to PostgreSQL")

	mux := http.NewServeMux()
	mux.HandleFunc("/api/products", withCORS(getProducts))
	mux.HandleFunc("/api/checkout", withCORS(checkout))
	mux.HandleFunc("/health", withCORS(health))

	log.Println("[API] Listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

// GET /api/products
func getProducts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.Query(`
		SELECT id, name, category, base_price, description, stock
		FROM products
		ORDER BY id
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type Product struct {
		ID          int     `json:"id"`
		Name        string  `json:"name"`
		Category    string  `json:"category"`
		BasePrice   float64 `json:"base_price"`
		Description string  `json:"description"`
		Stock       int     `json:"stock"`
	}

	var products []Product

	for rows.Next() {
		var p Product

		if err := rows.Scan(
			&p.ID,
			&p.Name,
			&p.Category,
			&p.BasePrice,
			&p.Description,
			&p.Stock,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		products = append(products, p)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(products)
}

// POST /api/checkout
// Body: {"product_id":1,"quantity":1,"session_id":"abc123"}
func checkout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProductID int    `json:"product_id"`
		Quantity  int    `json:"quantity"`
		SessionID string `json:"session_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	if req.Quantity <= 0 {
		req.Quantity = 1
	}

	// Begin transaction
	tx, err := db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var unitPrice float64
	var stock int

	err = tx.QueryRow(
		`SELECT base_price, stock
		 FROM products
		 WHERE id = $1
		 FOR UPDATE`,
		req.ProductID,
	).Scan(&unitPrice, &stock)

	if err == sql.ErrNoRows {
		http.Error(w, "product not found", http.StatusNotFound)
		return
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if stock < req.Quantity {
		http.Error(w, "insufficient stock", http.StatusConflict)
		return
	}

	_, err = tx.Exec(
		`UPDATE products
		 SET stock = stock - $1
		 WHERE id = $2`,
		req.Quantity,
		req.ProductID,
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	total := unitPrice * float64(req.Quantity)

	var orderID int

	err = tx.QueryRow(
		`INSERT INTO orders
		(product_id, quantity, unit_price, total, session_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		req.ProductID,
		req.Quantity,
		unitPrice,
		total,
		req.SessionID,
	).Scan(&orderID)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err = tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fmt.Printf(
		"[API] Order #%d — Product %d × %d = $%.2f\n",
		orderID,
		req.ProductID,
		req.Quantity,
		total,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"order_id":   orderID,
		"total":      total,
		"session_id": req.SessionID,
		"status":     "confirmed",
	})
}

// GET /health
func health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
	})
}

// CORS Middleware
func withCORS(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		h(w, r)
	}
}