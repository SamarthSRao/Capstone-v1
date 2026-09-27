#!/usr/bin/env python3
"""
Restock NexusGear for Locust / load tests.

Problem: default seed data has only ~485 units total. Aggressive Locust
(flash_sale_spike.py, wait_time=0) exhausts stock in seconds → HTTP 409
→ failed checkouts do not forward telemetry → dashboard stays at 50 RPS.

Usage (from Capstone-v1):
    python scripts/prep_load_test_stock.py
    python scripts/prep_load_test_stock.py --stock 5000000
    python scripts/prep_load_test_stock.py --full-reset   # truncate + re-seed + restock
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "services" / "api" / "schema.sql"
DEFAULT_CONTAINER = "capstone-v1-nexusgear-db-1"
DEFAULT_STOCK = 1_000_000


def run_psql(container: str, sql: str) -> str:
    proc = subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-U", "nexus", "-d", "nexusgear"],
        input=sql,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    return proc.stdout.strip()


def container_running(name: str) -> bool:
    proc = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"],
        capture_output=True,
        text=True,
        check=True,
    )
    return name in proc.stdout.splitlines()


def main() -> int:
    parser = argparse.ArgumentParser(description="Restock products for load testing")
    parser.add_argument(
        "--container",
        default=DEFAULT_CONTAINER,
        help=f"Postgres container name (default: {DEFAULT_CONTAINER})",
    )
    parser.add_argument(
        "--stock",
        type=int,
        default=DEFAULT_STOCK,
        help=f"Units per SKU (default: {DEFAULT_STOCK:,})",
    )
    parser.add_argument(
        "--full-reset",
        action="store_true",
        help="Truncate orders/products, re-run schema.sql seed, then set high stock",
    )
    parser.add_argument(
        "--clear-orders",
        action="store_true",
        help="Truncate orders only (keep products, just bump stock)",
    )
    args = parser.parse_args()

    if not container_running(args.container):
        print(f"ERROR: container '{args.container}' is not running.", file=sys.stderr)
        print("Start the stack: docker compose up -d", file=sys.stderr)
        return 1

    if args.full_reset:
        print("Full reset: truncate tables and re-seed from schema.sql ...")
        run_psql(args.container, "TRUNCATE orders, products RESTART IDENTITY CASCADE;")
        if not SCHEMA.is_file():
            print(f"ERROR: schema not found at {SCHEMA}", file=sys.stderr)
            return 1
        seed = SCHEMA.read_text(encoding="utf-8")
        proc = subprocess.run(
            ["docker", "exec", "-i", args.container, "psql", "-U", "nexus", "-d", "nexusgear"],
            input=seed,
            text=True,
            capture_output=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    elif args.clear_orders:
        print("Clearing order history ...")
        run_psql(args.container, "TRUNCATE orders RESTART IDENTITY;")

    print(f"Setting stock = {args.stock:,} on all products ...")
    out = run_psql(
        args.container,
        f"UPDATE products SET stock = {args.stock}; "
        f"SELECT COUNT(*) AS products, MIN(stock) AS min_stock, MAX(stock) AS max_stock, "
        f"SUM(stock) AS total_units FROM products;",
    )
    print(out)
    print(
        f"\nReady for load test — {args.stock:,} units per SKU "
        f"({args.stock * 12:,} total across 12 products)."
    )
    print("Run Locust:")
    print("  python -m locust -f tests/load/flash_sale_spike.py --host http://localhost:8080")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
