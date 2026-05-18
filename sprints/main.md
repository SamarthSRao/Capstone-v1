# Backend Engineering Mastery Plan — 2026 Edition
### Focus: DBMS Internals · Distributed Systems · Backend 2026 Roadmap
### Target: Infraspec · AI-First Product Engineering · Backend at Scale

---

## The Philosophy Behind This Plan

This plan follows the **Backend 2026 Roadmap** — the progression a backend engineer must follow to be genuinely valuable in an AI-first world. The roadmap has a specific order for good reason:

```
Fundamentals (HTTP, DNS, TCP, Linux)
       ↓
Programming Language Deep (Go primary, TypeScript secondary)
       ↓
Systems Programming (processes, threads, file systems, memory, disks)
       ↓
Data Structures + JSON + Protocol understanding
       ↓
Databases — DEEP (the most important block for backend)
       ↓
Object Storage, Queues, Real-Time Systems
       ↓
Observability + Performance Engineering
       ↓
Security + Containerization + Cloud
       ↓
AI-Native Stack
```

The roadmap says it clearly: **databases are a huge block**. Tables, columns, indexes, query planners, performance, isolation levels — all of it. This plan spends more time on database internals than any single other area because that is what separates backend developers who are copy-pasting StackOverflow from engineers who understand why a query takes 7 seconds and can fix it in 3 minutes.

**Three pillars that run through everything:**

1. **DBMS Internals** — not just "use PostgreSQL" but understand MVCC, WAL, B-trees, query planning, connection pooling, isolation levels with live anomaly demos. Build a WAL from scratch. Build an LSM-tree. Understand why databases make the choices they do.

2. **Distributed Systems** — leader election, distributed locks, consistent hashing, Bloom filters, Saga patterns, event sourcing, exactly-once semantics. Not just use Kafka — understand why partitions exist and what happens when a consumer crashes mid-process.

3. **Backend 2026 Practices** — AI-assisted development, performance engineering (p99 latency, flame graphs, cost optimization), cybersecurity (not hacking, but not getting hacked), observability as a first-class concern, and the ability to work independently on complex systems.

---

## Why Infraspec

**Infraspec** (infraspec.dev) is an AI-first technology consulting firm founded by engineers from Gojek, Navi, Swiggy, and Rapido. They partner with fast-scaling startups globally. The role is Backend Engineer — building scalable systems, shipping fast, and leveraging AI-driven development to deliver high-quality product engineering outcomes.

| Infraspec Requirement | How This Plan Delivers It |
|---|---|
| 3–5 years experience or strong equivalent track record | 5 production-deployed projects with real benchmarks, ADRs, and k6 results |
| 0-to-1 consumer product experience | OpenTrace + RouteMaster built ground-up, Week 1 to production |
| Strong in one backend language (Go / TypeScript) | Go: Months 3–9. TypeScript/Node.js: Months 1–2, 4 |
| Working knowledge of a second backend language | TypeScript primary, Go secondary — both at production depth |
| REST, gRPC, webhooks, OAuth2, JWT | Implemented in every project from Month 2 onward |
| SQL, NoSQL, Redis, Elasticsearch | PostgreSQL + MongoDB + Redis + Elasticsearch — all five projects |
| Monolith vs microservices, event-driven architecture | DungBeetle (monolith → event-driven), PayCore (microservices + Kafka) |
| CI/CD, feature flags, progressive rollouts | GitHub Actions from Month 6; feature flags via LaunchDarkly in Month 8 |
| Debugging + production issue resolution | PITR drills, pprof flame graphs, distributed tracing every month |
| System observability and reliability | OpenTelemetry + Prometheus + Grafana on all 5 projects |
| Security best practices | JWT RS256, HMAC webhooks, input sanitization, OWASP top 10, `trivy` |
| AI tools for development and code review | GitHub Copilot + Claude for RFC drafting — built in from Day 1 |
| RFCs and decision documents | Every major decision → ADR. Every system design → RFC. Written weekly. |

---

## The Engineer's Daily Mindset

Every day you operate with three goals simultaneously:

1. **Ship something real** — every evening you build a named feature of a named project. Not a tutorial. Not a toy.
2. **Understand the why** — every morning you learn the concept by reading source code, not docs. You break things intentionally.
3. **Document like a senior** — every Sunday you write an ADR, update the README, post a benchmark number. Communication is engineering.

**On AI-assisted development:** GitHub Copilot is open from Day 1. Claude drafts your first RFCs. TestSprite generates your first E2E tests. But you own every line — if you can't explain it in an interview, you didn't learn it. AI accelerates delivery; it doesn't replace understanding. As the roadmap says: "AI is just another tool. The person who understands the hard stuff will always be more valuable."

---

## Master Concept Checklist
### Backend 2026 Roadmap — Every Item Implemented in Running Code

---

### ⚡ Stage 1: Fundamentals (Backend 2026 Roadmap Block 1)

- [ ] **HTTP/HTTPS model** — methods, status codes, headers, HTTP/2 multiplexing, TLS handshake; `curl -v` on every endpoint you build
- [ ] **Client/Server concepts** — stateless vs stateful, REST resource design, idempotency (GET/PUT/DELETE vs POST), request/response lifecycle
- [ ] **DNS** — A, CNAME, MX, TXT, NS, TTL, full resolution path (`dig +trace`); understand why TTL matters for migrations
- [ ] **How websites work** — HTML → DOM → CSSOM → Render Tree → Layout → Paint → Composite; Lighthouse 100
- [ ] **TCP/UDP** — three-way handshake, connection termination, UDP for DNS/WebRTC, why TCP ordering matters for databases
- [ ] **JSON** — data serialization, why it exists, JSON vs Protobuf vs MessagePack tradeoffs; used by every microservice

---

### 🖥️ Stage 2: Operating Systems + Computer Networks (Backend 2026 Roadmap Block 2)

#### Operating Systems
- [ ] **Processes** — `fork()`/`exec()` model, process lifecycle, PCB, context switching cost, zombie and orphan processes; `ps aux`, `strace -p <pid>`, `/proc/<pid>/status`
- [ ] **Threads vs goroutines** — POSIX threads vs Go M:N goroutines, why goroutines start at 2KB not 1MB, green threads vs OS threads
- [ ] **CPU scheduling** — Round-Robin, CFS (Completely Fair Scheduler), priority queues, preemption, why `GOMAXPROCS` matches CPU count
- [ ] **Virtual memory** — page tables, TLB, page faults, demand paging, `mmap()` for memory-mapped files (how databases map data files), `mlock()` to prevent swapping
- [ ] **File system internals** — inodes, directory entries, hard links vs symlinks, file descriptors, `O_DIRECT` (bypass page cache — how databases do raw I/O), `fsync()` vs `fdatasync()`
- [ ] **Disk I/O model** — sequential vs random I/O (why LSM-trees write sequentially, why B-trees random-read is fast with caching), page cache, `iostat -x 1`, write amplification
- [ ] **Signals** — `SIGTERM`, `SIGKILL`, `SIGPIPE`, `SIGHUP`, signal handlers in Go via `signal.Notify`
- [ ] **Inter-Process Communication (IPC)** — pipes, Unix domain sockets, shared memory, message queues

#### Computer Networks
- [ ] **TCP/IP stack layers** — Application → Transport → Network → Link
- [ ] **TCP in depth** — three-way handshake, four-way teardown, TIME_WAIT state, TCP window scaling, Nagle's algorithm, `SO_REUSEPORT`
- [ ] **Socket programming** — `socket()` → `bind()` → `listen()` → `accept()` → `read()`/`write()` → `close()`; implement a raw echo server in Go
- [ ] **UDP** — connectionless, no ordering, no delivery guarantee; used by DNS, WebRTC DTLS, QUIC
- [ ] **HTTP/1.1 vs HTTP/2 vs HTTP/3** — persistent connections, multiplexing, HPACK, QUIC transport
- [ ] **DNS protocol** — wire format, recursive vs authoritative, `dig +trace`, TTL caching, split-horizon DNS
- [ ] **SMTP protocol** — EHLO/MAIL FROM/RCPT TO/DATA/QUIT, STARTTLS, MX record lookup
- [ ] **Network debugging tools** — `ss -tlnp`, `netstat -an`, `tcpdump -i any port 5432`, `Wireshark`, `nmap`, `mtr`
- [ ] **Load balancer internals** — L4 vs L7, health checks, connection draining, `SO_REUSEPORT`

---

### 🌐 Stage 3: Frontend (Enough to Build Full-Stack Features)

- [ ] **HTML** — semantic elements, forms, ARIA accessibility, `<head>` structure, what the DOM actually is
- [ ] **CSS** — box model, flexbox, grid, cascade, Tailwind utility-first model
- [ ] **JavaScript** — types, closures, event loop, prototypes, async/await, generators, modules (ESM vs CJS)
- [ ] **Browser Dev Tools** — Network tab, Performance tab, Memory tab, Lighthouse audit
- [ ] **TypeScript** — strict mode, generics, conditional types, branded types (`UserId ≠ DriverId` at compile time), `tsc --noEmit` in CI
- [ ] **ReactJS** — all hooks, reconciliation, `React.memo`, DevTools Profiler
- [ ] **Next.js** — App Router, Server Components, `'use client'`, ISR, streaming Suspense, Server Actions
- [ ] **Zod** — one schema = runtime validation + TypeScript type
- [ ] **Tanstack Query** — optimistic updates + rollback, `staleTime`/`gcTime`
- [ ] **Shadcn UI** — DataTable, Dialog, Command palette (source owned)

---

### ⚙️ Stage 4: Backend Languages — Deep (Backend 2026 Roadmap Block 3)

- [ ] **Node.js** — V8 JIT pipeline (Ignition → TurboFan), hidden classes, generational GC, libuv event loop all 6 phases, `worker_threads`, `AsyncLocalStorage`, streams with backpressure, graceful shutdown
- [ ] **Go** — complete language: zero values, implicit interfaces, error wrapping `%w`, `defer` + cleanup, goroutines (M:N scheduler, work stealing, 2KB stacks), channels (all patterns: pipeline/fan-out/fan-in/semaphore), `sync.RWMutex`/`Pool`/`Once`, `errgroup`, `singleflight`, `atomic`, `context` propagation, `sqlc`, `chi`, `cobra`, `slog`, `pprof`, `go test -race`, `goleak`
- [ ] **Streams** — Node.js `Transform` pipeline, `highWaterMark`, `drain` event, backpressure, `pipeline()` — 200MB file in 20MB constant RAM

---

### 🗄️ Stage 5: DBMS — Deep Internals (Backend 2026 Roadmap Block 4 — THE most important block)
> **"Databases are a huge thing. Tables, columns, indexes, query planner, performance — there's a lot. This is not done and dusted."**
>
> This stage receives the deepest treatment in the plan. Building a WAL, an LSM-tree, and a TCP connection pool from scratch is what separates engineers who understand databases from engineers who merely use them. Every concept here is implemented in running code, not just read about.

#### Relational Databases
- [ ] **PostgreSQL fundamentals** — schemas, tables, constraints, foreign keys, normalization (1NF/2NF/3NF), ACID properties
- [ ] **SQL mastery** — JOINs (INNER/LEFT/RIGHT/FULL), aggregations, CTEs, window functions, subqueries, `EXPLAIN ANALYZE` output reading
- [ ] **Index deep dive** — B-tree (how splits and rotations work internally), partial index, covering index, GIN (for arrays/JSONB), BRIN (for time-series), composite index column order, when indexes hurt writes
- [ ] **MVCC (Multi-Version Concurrency Control)** — why PostgreSQL readers never block writers, how tuple versions work, vacuum and autovacuum, table bloat caused by dead tuples
- [ ] **WAL (Write-Ahead Log)** — why durability requires WAL before data pages, WAL segments, `fsync`, checkpoints, WAL archiving for PITR; **implemented from scratch in Biweekly Project 1**
- [ ] **All 4 isolation levels with live anomaly demos** — Read Uncommitted (dirty read demo), Read Committed (non-repeatable read demo), Repeatable Read (phantom read demo), Serializable — each anomaly triggered in a real transaction in `psql`
- [ ] **`SELECT FOR UPDATE` + `SKIP LOCKED`** — row-level locking, why `SKIP LOCKED` is the correct job queue pattern, advisory locks
- [ ] **Query planner** — seq scan vs index scan vs bitmap scan vs index-only scan, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, join strategies (hash join / nested loop / merge join), planner statistics (`pg_stats`)
- [ ] **Scaling PostgreSQL** — read replicas with streaming replication, replication lag monitoring, PgBouncer transaction mode vs session mode, connection pool sizing formula, `pg_stat_statements` for slow query analysis; **PgBouncer implemented from scratch in Biweekly Project 2**
- [ ] **Sharding and partitioning** — range partitioning by month (span ingestion table), hash partitioning, partition pruning, consistent hash router for horizontal sharding
- [ ] **MySQL** — InnoDB vs MyISAM, clustered index (primary key IS the data), gap locks, `REPEATABLE READ` default, compared to PostgreSQL in a written ADR

#### Non-Relational Databases
- [ ] **Redis** — String/Hash/List/Set/Sorted Set/Stream all data structures with real use cases, Lua scripts (atomic check-and-set), pub/sub, pipelining, TTL jitter, `SETNX` for distributed locks, `DECRBY` for inventory, `ZADD`/`ZRANGEBYSCORE` for rate limiting
- [ ] **MongoDB** — document model, schema-flexible documents, `$lookup` aggregation pipeline, indexes, when NOT to use MongoDB
- [ ] **Elasticsearch** — inverted index, full-text search with relevance scoring, BM25 algorithm, analyzer chains, faceted search, hybrid BM25 + vector search
- [ ] **Cassandra concepts** — wide-column model, partition key design (hot spot causes), eventual consistency, when to choose over PostgreSQL
- [ ] **SQLite** — embedded, zero-config, WAL mode for concurrent reads, when to use, how it differs from client-server databases

#### Vector Databases (AI-Native Stack)
- [ ] **PGVector** — `vector(1536)` type, HNSW index for approximate nearest-neighbor, cosine `<=>` distance, hybrid BM25 + vector search for RAG pipelines
- [ ] **AWS S3 Vector** — large-scale embedding storage for production RAG at scale
- [ ] **ClickHouse** — columnar storage, MergeTree engine, bulk insert patterns, TTL policies, `EXPLAIN` for trace query optimization; **used as OpenTrace's primary span storage**

#### Database Internals (Build It to Understand It — Biweekly Projects)
- [ ] **WAL implementation from scratch** — append-only log, checksums for partial write detection, recovery by replay, log compaction via snapshotting **(Biweekly Project 1)**
- [ ] **LSM-tree storage engine from scratch** — MemTable, SSTable, compaction, Bloom filter per SSTable; write path of RocksDB/LevelDB/Cassandra **(Biweekly Project 8)**
- [ ] **TCP connection pool from scratch** — pgwire protocol parsing, multiplexing clients onto pooled backend connections — why PgBouncer exists **(Biweekly Project 2)**
- [ ] **Picking the right database** — written ADR for every database choice across all 5 projects

---

### 📦 Stage 6: Object Storage (Backend 2026 Roadmap Block 5)

- [ ] **S3 fundamentals** — buckets, objects, keys, versioning, lifecycle policies, replication
- [ ] **Presigned URLs** — generate server-side, client uploads directly to S3, time-limited access
- [ ] **Multipart upload** — for files > 5MB, parallel part uploads, resume on failure
- [ ] **Egress cost awareness** — S3 → internet costs money; Cloudflare R2 has zero egress fees; cost model comparison in ADR
- [ ] **Signed URLs for download** — time-limited read access to private objects

---

### 📨 Stage 7: Queues + Message Brokers (Backend 2026 Roadmap Block 6)

- [ ] **Database-backed queues** — `SELECT FOR UPDATE SKIP LOCKED`, DLQ, retry with exponential backoff
- [ ] **Kafka essentials** — topic → partition → offset model, partition key, consumer group, idempotent producer, exactly-once semantics (transactional API), consumer lag monitoring, outbox pattern
- [ ] **Kafka Connect** — Debezium CDC source connector, Elasticsearch sink connector
- [ ] **Real-time PubSub** — Redis pub/sub for fan-out across replicas, SSE for one-way server push, WebSocket for bidirectional real-time
- [ ] **Event-driven architecture** — outbox pattern, Saga choreography, event sourcing (state = replay of events), CQRS

---

### 🌐 Stage 8: Real-Time Systems

- [ ] **WebSockets** — upgrade handshake, gorilla/websocket in Go, ping/pong keepalive, connection registry in `sync.Map`, fan-out via Redis pub/sub, clustered **(Biweekly Project 3)**
- [ ] **SSE (Server-Sent Events)** — `text/event-stream`, one-way server push, auto-reconnect, `Last-Event-ID`
- [ ] **Distributed presence** — heartbeat protocol, TTL-based expiry, Redis `HSET presence:{userId}` with 60s TTL

---

### 🔒 Stage 9: Security Essentials

- [ ] **Authentication** — JWT RS256 (asymmetric), refresh token rotation, revocation via Redis
- [ ] **API security basics** — parameterized queries, HMAC webhook signatures with `timingSafeEqual`, API key storage as `SHA256(key)`, rate limiting per client
- [ ] **Input validation** — Zod on every API request body, `http.MaxBytesReader`, reject unexpected fields
- [ ] **Container hardening** — non-root user, `govulncheck ./...`, `trivy image` scan
- [ ] **Transport security** — HTTPS everywhere, HSTS header, `Secure` + `HttpOnly` + `SameSite=Strict` cookies

---

### 🧪 Stage 10: Testing

- [ ] **Unit Testing** — Vitest + `@testing-library/react`, Go `testing` + `testify`, table-driven tests, 80%+ coverage
- [ ] **Integration Testing** — `testcontainers-go` for real PostgreSQL + Redis + Kafka in tests (not mocks)
- [ ] **E2E Testing (Playwright)** — `getByRole` queries, auto-wait, network mocking, cross-browser (Playwright covers all E2E needs — Puppeteer and Cypress are redundant)
- [ ] **TestSprite** — AI-generated E2E tests, review and fix every generated test
- [ ] **Go race detector** — `go test -race ./...` passes before every commit; `goleak.VerifyNone(t)` in every test file

---

### 🏗️ Stage 11: Infrastructure + DevOps

- [ ] **Docker** — multi-stage builds (900MB → 85MB), non-root user, health checks, `.dockerignore`, layer caching
- [ ] **Kubernetes** — Pod → Deployment → Service → Ingress, HPA, readiness + liveness probes, ConfigMap + Secret
- [ ] **Terraform** — HCL, state file (S3 + DynamoDB lock), `plan → apply`, modules, per-environment variable files (Terraform is sufficient — Pulumi is not asked in Indian interviews)
- [ ] **GitHub Actions** — matrix builds, `paths` filter, Trivy CVE scan, branch protection
- [ ] **AWS** — ECS Fargate, RDS (Multi-AZ), ElastiCache, MSK, S3, CloudFront
- [ ] **Cloudflare** — DNS, CDN, Workers (V8 isolates — no cold starts), R2 (S3-compatible, zero egress)
- [ ] **CI/CD** — lint → test → build → trivy → deploy. Branch protection. Zero-downtime rolling deploys.
- [ ] **Cost optimization** — compute cost, storage cost, database cost, egress cost awareness

---

### 📡 Stage 12: Observability + Performance Engineering (Backend 2026 Roadmap Block 8)

#### Three Pillars
- [ ] **Traces (Jaeger / OpenTrace)** — OpenTelemetry Go + Node.js SDK, auto-instrumentation (HTTP/PostgreSQL/Redis/Kafka), manual spans, W3C `traceparent` propagation, tail-based sampling, Grafana exemplars
- [ ] **Metrics (Prometheus + Grafana)** — Counter/Gauge/Histogram, RED method per endpoint, Go runtime metrics, PromQL, 4-row Grafana dashboard per service
- [ ] **Logs (structured `slog`)** — JSON structured logs, `trace_id` + `span_id` on every log line via middleware, shipped to Loki/Elasticsearch

#### Alerting
- [ ] **Prometheus alerting rules** — SLI/SLO/error budget, alert rules with `for: 5m`, Alertmanager routing P1→PagerDuty P2/P3→Slack, on-call runbook for every alert

#### Performance Engineering
- [ ] **`pprof` profiling** — CPU flame graph, heap profile, goroutine dump, mutex contention
- [ ] **`EXPLAIN ANALYZE` mastery** — read query plans, identify seq scans, fix missing indexes, understand join strategies, use `auto_explain` in production
- [ ] **k6 load testing** — virtual users, ramp-up patterns, p50/p95/p99 at target RPS, SLO validation, documented in `BENCHMARKS.md`
- [ ] **Production debugging workflow** — alert → Grafana → find anomaly → trace → slow span → pprof → fix → verify

---

### 🧠 Stage 13: AI-Native Stack (Backend 2026 Roadmap Block 9)

- [ ] **LLM fundamentals** — tokens, context windows, temperature, streaming responses, why stateless LLMs need RAG for memory
- [ ] **Embeddings** — what they are (vectors representing semantic meaning), how to generate them, cosine similarity
- [ ] **RAG (Retrieval-Augmented Generation)** — embed → store → retrieve top-K → inject into prompt → generate grounded answer
- [ ] **Tool use / Function calling** — LLM decides which tool to call, your code executes it, result returned to LLM
- [ ] **AI Agents** — agent loop (decide → tool call → observe → decide), multi-agent orchestration
- [ ] **AI SDK (Vercel)** — `useChat`, `streamText`, tool definitions, streaming token-by-token to React via SSE
- [ ] **Vector database selection** — PGVector for < 10M vectors + relational queries, ClickHouse for analytical trace queries, AWS S3 Vector for large-scale production RAG
- [ ] **WebAssembly (Wasm)** — compile Go to Wasm, run in browser at native speed, fraud detection at < 15ms p99 in-browser

---

### 🏛️ Stage 14: Distributed Systems — Deep
> **Your core interest. These concepts are built, not just understood. Every pattern below is implemented in running, tested, benchmarked code.**

- [ ] **Leader election** — Redis SETNX + TTL + heartbeat lease renewal, split-brain prevention **(Biweekly Project 7)**
- [ ] **Distributed locks with fencing tokens** — why TTL alone is not enough, monotonically increasing fencing tokens, Lua atomic verify-and-delete **(Biweekly Project 7)**
- [ ] **Consistent hashing** — ring + virtual nodes (vnodes), adding/removing nodes remaps only 1/N keys, ketama algorithm — implemented in Go
- [ ] **Bloom filters** — probabilistic membership, false positive rate formula, optimal hash count, Redis `BF.ADD`/`BF.EXISTS` — implemented in Go
- [ ] **CAP theorem** — Consistency + Availability + Partition Tolerance, CP vs AP tradeoffs
- [ ] **Saga pattern** — sequence of local transactions with compensating rollbacks, choreography (Kafka events) vs orchestration (DungBeetle job steps)
- [ ] **Event sourcing** — state = replay of immutable events, PayCore double-entry ledger as event stream, CQRS read model projection
- [ ] **Exactly-once semantics** — idempotent Kafka producer, transactional API, outbox pattern for guaranteed at-least-once with idempotent consumer = effective exactly-once
- [ ] **Data replication** — synchronous vs asynchronous replication, replication lag monitoring, read-your-writes consistency
- [ ] **Two-phase commit** — why it's slow and what goes wrong, why Saga is preferred for microservices
- [ ] **Raft consensus basics** — leader election, log replication, quorum, why etcd/CockroachDB use it

---

### 🔧 Stage 15: Infraspec Engineering Practices

- [ ] **RFC Writing** — problem → options → decision → tradeoffs. One RFC per project.
- [ ] **ADRs** — one-page format, every major decision documented, linked from README
- [ ] **API Design** — REST versioning, breaking change policy, gRPC service definitions, webhook HMAC signing, OAuth2 flows, JWT RS256
- [ ] **Feature Flags + Progressive Rollouts** — LaunchDarkly SDK, percentage rollouts, kill switches
- [ ] **Monolith → event-driven migration** — DungBeetle starts monolith, extracted to event-driven by Month 6
- [ ] **Graceful degradation** — circuit breakers (closed/open/half-open), fallback responses, bulkhead isolation

---

### System Design (All Implemented in Projects)

- [ ] e-Commerce Product Listing — RouteMaster: pagination, faceted search (Elasticsearch), inventory consistency
- [ ] Tinder Feed — driver matching: candidate generation, H3 scoring pipeline, real-time swipe/assign stream
- [ ] Notifications at scale — RouteMaster: fan-out on write vs read, APNs/FCM, deduplication via Redis SETNX
- [ ] Twitter Trends — Count-Min Sketch top-K, sliding window counters, `ZINCRBY` per 5-min window
- [ ] URL Shortener — standalone: base62 encoding, redirect cache, analytics counters
- [ ] API Rate Limiter — all 5 projects: token bucket, sliding window log, Redis Lua atomic implementation
- [ ] Realtime Abuse Masker — anomalous span pattern classifier, shadow restrict, appeal workflow
- [ ] Web Crawler — Bloom filter URL dedup, BFS queue, politeness policy, robots.txt
- [ ] GitHub Gists — presigned S3, full-text search, forking with Copy-on-Write
- [ ] Fraud Detection — Wasm pre-filter for span anomaly detection, < 15ms p99
- [ ] Recommendation System — collaborative filtering + PGVector cosine ANN, A/B test framework
- [ ] Distributed Booking System — BookWise: double-booking prevention, distributed locks, payment Saga, waitlist event machine
- [ ] Background Job System — DungBeetle: monolith → event-driven, leader election, exactly-once cron, AI job orchestration
- [ ] **Distributed Tracing System** — OpenTrace: OTLP ingestion, Kafka pipeline, ClickHouse storage, gRPC query, Next.js waterfall UI

---

## The Main Project: OpenTrace
### A Full Distributed Tracing System — Built Like Jaeger, Across 8 Months

**OpenTrace is your final year project and your portfolio centrepiece.** It is a complete open-source distributed tracing system — built in Go (backend) and TypeScript (frontend) — that mirrors Jaeger's architecture from the ground up. Not a clone. An original implementation that you understand at every layer because you built every layer. The name reflects what it is: an open, transparent, from-scratch tracing system.

**Why this is the right capstone:** A distributed tracing system is a distributed system that observes other distributed systems. Building it requires: network protocols (OTLP over gRPC/HTTP), storage systems (ClickHouse for traces, Cassandra-style write patterns), distributed query engines, real-time streaming (WebSocket trace tailing), and a complex UI (trace waterfall visualization). It touches every concept in this plan — and it is a genuine final year project at the depth that gets LFX mentorship applications accepted into Jaeger and OpenTelemetry.

---

### What OpenTrace Is (The Full System)

```
                    ┌─────────────────────────────────────────────────┐
                    │              OpenTrace System                   │
                    │                                                 │
  App (Go/Node) ──OTLP/gRPC──→ Collector ──→ Kafka ──→ Pipeline     │
  App (Python)  ──OTLP/HTTP──→ Collector         (processor)         │
                    │              ↓                    ↓             │
                    │          ClickHouse          Elasticsearch      │
                    │          (spans/traces)      (log search)       │
                    │              ↓                    ↓             │
                    │          Query Service ──gRPC──→ API Gateway    │
                    │                                    ↓            │
                    │                           OpenTrace UI          │
                    │                           (Next.js/TypeScript)  │
                    │                           - Trace waterfall     │
                    │                           - Service map         │
                    │                           - Live tail           │
                    └─────────────────────────────────────────────────┘
```

**The 7 components you build, one per phase:**

| Component | Language | Mirrors | Built In |
|-----------|----------|---------|---------|
| **Collector** | Go | Jaeger Collector / OTel Collector | Month 2 |
| **Pipeline Processor** | Go | Jaeger Ingester / OTel Processor | Month 3 |
| **Storage Layer** | Go | Jaeger Storage Plugin (ClickHouse) | Month 5 |
| **Query Service** | Go | Jaeger Query Service | Month 6 |
| **API Gateway** | TypeScript | Jaeger HTTP API + gRPC gateway | Month 6 |
| **OpenTrace UI** | TypeScript/React | Jaeger UI (trace waterfall, service map) | Month 4 + 7 |
| **SDK** | Go + TypeScript | OpenTelemetry SDK (auto-instrumentation) | Month 7 |

---

### ClickHouse as OpenTrace's Primary Storage — Why and How

ClickHouse is the right database for distributed tracing data. It is a columnar OLAP database optimised for analytical queries on append-only time-series data — exactly what spans are. Understanding *why* ClickHouse beats PostgreSQL for this workload is as important as knowing how to use it.

**The OpenTrace ClickHouse schema:**

```sql
CREATE TABLE spans (
    trace_id        FixedString(32),
    span_id         FixedString(16),
    parent_span_id  FixedString(16),
    operation_name  LowCardinality(String),
    service_name    LowCardinality(String),
    start_time      DateTime64(6),           -- microsecond precision
    duration_us     UInt64,                  -- duration in microseconds
    status_code     UInt8,                   -- 0=Unset, 1=OK, 2=Error
    attributes      Map(String, String),
    resource        Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)           -- monthly partitions
ORDER BY (service_name, start_time, trace_id)
TTL start_time + INTERVAL 30 DAY;           -- auto-delete spans > 30 days
```

Key design decisions to document in an ADR:

**Why MergeTree?** ClickHouse's MergeTree engine sorts data on disk by the ORDER BY key. Queries for `WHERE service_name = 'paycore' AND start_time > now() - INTERVAL 1 HOUR` only scan data for that service and time range — not the entire table. This is what makes trace queries fast.

**Why monthly partitions?** `PARTITION BY toYYYYMM(start_time)` puts each month's spans in a separate directory on disk. Queries for recent data never touch old partitions. Dropping old data is an instant directory deletion, not a slow DELETE.

**Why `LowCardinality`?** `operation_name` and `service_name` have limited distinct values (100s, not millions). `LowCardinality` stores them as integer dictionary references — 4–8× smaller on disk, faster to filter and aggregate.

**Benchmark goal:** 10M spans/sec ingestion throughput. ClickHouse bulk insert (batch of 10K spans) achieves this on a single node. Document the batch size vs latency tradeoff in `BENCHMARKS.md`.

---

### OpenTrace — Month by Month Growth

| Month | Component Built | What You Learn Doing It |
|-------|----------------|------------------------|
| **1** | Foundations: OTLP protocol reading, project scaffold, raw gRPC echo server | OTLP wire format, gRPC service definitions, binary protocols |
| **2** | **Collector v0.1** — receives OTLP/gRPC + OTLP/HTTP, validates, writes to Kafka | gRPC server in Go, protobuf, Kafka producer, backpressure |
| **3** | **Pipeline Processor** — Kafka consumer, sampling decisions, span enrichment, writes to ClickHouse | Kafka consumer groups, ClickHouse bulk insert, tail-based sampling |
| **4** | **OpenTrace UI v0.1** — trace list, trace detail, basic waterfall (React + Next.js) | D3.js waterfall rendering, complex TypeScript state, SSE for live tail |
| **5** | **Storage Layer** — ClickHouse schema design, query patterns, TTL, index tuning | ClickHouse MergeTree, time-series query patterns, `EXPLAIN` |
| **6** | **Query Service + API Gateway** — gRPC query API, REST gateway, service dependency graph | gRPC streaming, service map graph algorithms, API design |
| **7** | **OpenTrace UI v2** + **SDK** — service map, live tail, auto-instrumentation SDK | Go AST for auto-instrumentation, WebSocket live tail, graph layouts |
| **8** | **Production hardening** — Kubernetes deployment, OTel compatibility, benchmarks, docs | K8s Operator for OpenTrace, CNCF compatibility testing |

---

### The Other Projects — Independent Repos, Independent Purpose

Each of the other four projects is a **separate GitHub repository** with its own README, its own `BENCHMARKS.md`, its own ADRs, and its own live demo. They are not satellites of OpenTrace. They stand alone. Each one demonstrates a different hard area of backend engineering that interviewers at Indian Tier 1 companies specifically probe.

| Project | Its Own Purpose | What It Demonstrates Independently |
|---------|----------------|-------------------------------------|
| **PayCore** | A financial transaction and ledger system | Double-entry bookkeeping, idempotency, Saga pattern, event sourcing — the hardest correctness problems in backend |
| **DungBeetle** | A background job processing platform | Leader election, exactly-once cron, monolith → event-driven migration, Kafka-backed job queues at scale |
| **BookWise** | A distributed seat reservation system | Distributed locking, double-booking prevention, payment Saga, waitlist state machine — classic concurrency at scale |
| **RouteMaster** | A logistics and notifications platform | Fan-out notifications at scale, Elasticsearch full-text search, web crawler, real-time order tracking |

The shared technology (PostgreSQL, Redis, Kafka, Go, OpenTelemetry) across all five projects is the point. An interviewer seeing five repos all built with the same stack depth understands immediately that you are not a tutorial-completionist — you are someone who has used these tools repeatedly in different problem domains until they are genuinely familiar.

---

### LFX Mentorship Track — Built Into Month 9

**LFX Mentorship** (Linux Foundation) is the most direct path to CNCF project contributions with mentorship support. The application requires: a cover letter explaining your interest, links to existing contributions (PRs merged), and a project proposal.

**Target projects** (all directly relevant to OpenTrace):

- **Jaeger** — the project you're mirroring. Your OpenTrace RFC is your Jaeger proposal. You understand Jaeger's architecture at implementation depth because you rebuilt it.
- **OpenTelemetry** (otel-go, otel-collector-contrib) — you've implemented OTLP; you understand the codebase from building the Collector
- **Prometheus** — you've built Prometheus metrics exporters across all projects
- **Kubernetes** — you've written a K8s Operator for OpenTrace; controller-runtime contributions are the entry point

**Application cycles:** March, June, September, December. Plan for the **September cycle** (Month 9 of your plan).

---

## The 5 Projects — 5 Separate Repos

| Project | Role | Stack | What It Demonstrates |
|---------|------|-------|----------------------|
| **OpenTrace** | Final year project + portfolio centrepiece | Go + TypeScript + gRPC + ClickHouse + Kafka + Next.js | Full distributed tracing system — 7 components, OTLP compatible, Jaeger-equivalent |
| **PayCore** | Financial transactions and ledger system | Go + PostgreSQL + Redis + Kafka + gRPC | Idempotency, double-entry bookkeeping, event sourcing, Saga pattern |
| **DungBeetle** | Background job processing platform | Go + Kafka + PostgreSQL + Redis | Leader election, exactly-once cron, monolith → event-driven, AI job orchestration |
| **BookWise** | Distributed seat reservation system | Go + PostgreSQL + Redis + Kafka + gRPC | Distributed locking, double-booking prevention, payment Saga, waitlist state machine |
| **RouteMaster** | Logistics and notifications platform | Next.js + Go + Elasticsearch + Kafka | Fan-out notifications at scale, full-text search, web crawler, real-time tracking |

---

**The narrative for OpenTrace:**
*"I built OpenTrace — a complete open-source distributed tracing system in Go and TypeScript, equivalent to Jaeger in architecture. It receives OTLP spans over gRPC/HTTP, processes them through a Kafka pipeline with tail-based sampling, stores them in ClickHouse with monthly partitioning and 30-day TTL, and serves them via a gRPC query service to a Next.js UI that renders trace waterfalls and service dependency maps. To validate it end-to-end, I built a small Go microservice that auto-instruments with the OpenTrace SDK and generates realistic span traffic — the UI shows live traces, service maps, and latency distributions from a real running system."*

**The narrative for the other four projects:**
*"Alongside OpenTrace, I built four independent production-grade systems — PayCore (financial ledger with double-entry bookkeeping and Saga-based payment flows), DungBeetle (background job platform with Redis leader election and exactly-once Kafka-backed cron), BookWise (distributed seat reservation with fencing-token distributed locks and double-booking prevention at 10K concurrent users), and RouteMaster (logistics platform with fan-out notifications, Elasticsearch full-text search, and a Bloom-filter-backed web crawler). Each is a separate GitHub repo with its own benchmarks, ADRs, and CI pipeline."*

*"I'm applying to LFX Mentorship for Jaeger/OpenTelemetry because OpenTrace gave me deep familiarity with the OTLP protocol, ClickHouse storage patterns, and the trace query model. I've already contributed [N] PRs to [project]. Here's my proposal."*

---

## 8–9 Month Overview — All 5 Projects + Backend 2026 Roadmap

| Month | Backend 2026 Focus | OpenTrace Milestone | Other Projects (Independent) |
|-------|-------------------|---------------------|------------------------------|
| **1** | Fundamentals + OS + Networks + JS Engine | Scaffold: monorepo, proto definitions, OTLP wire format study, raw gRPC echo server | All 4 projects: raw HTTP server shells, own repos created |
| **2** | Node.js Deep + TypeScript + API Design | **Collector v0.1**: OTLP/gRPC + OTLP/HTTP receiver, validates spans, publishes to Kafka | PayCore: auth layer + webhook design |
| **3** | Go Mastery + Concurrency + Protocols | **Pipeline Processor**: Kafka consumer, tail-based sampling, ClickHouse bulk writer | DungBeetle: v0.1 in Go, job queue |
| **4** | React + Next.js + TypeScript UI + Testing | **OpenTrace UI v0.1**: trace list, trace detail page, D3.js waterfall | All 4 projects: Next.js frontends, CI/CD |
| **5** | **DBMS Deep** + ClickHouse + Kafka | **Storage Layer**: ClickHouse schema, TTL, index tuning, benchmark | PayCore: double-entry ledger + event sourcing |
| **6** | Infra + K8s + Observability Stack | **Query Service + API Gateway**: gRPC streaming queries, service map, REST gateway | All projects: K8s deployed, OTel self-instrumented |
| **7** | **Distributed Systems Deep** | **OpenTrace UI v2 + SDK**: service map, live tail WebSocket, auto-instrumentation SDK | DungBeetle v3.0; BookWise: waitlist engine |
| **8** | Performance Engineering + AI Stack | **Production hardening**: K8s Operator, OTel compatibility tests, 10M spans/sec load test | All system designs + AI features complete |
| **9** | Polish + LFX Prep + CNCF Contributions | **LFX Application**: cover letter, good first issues PRs, project proposal | Cold emails, all 5 portfolio READMEs final |

---

## Biweekly Projects — Database + Distributed Systems Internals

These 8 biweekly projects are where the DBMS and distributed systems depth gets built. Each one is a standalone system that implements a concept from the inside out. By the end, you have implemented: a WAL, a connection pool, a clustered WebSocket server, a DNS resolver, an SMTP server, an OTP gateway, a distributed lock service, and an LSM-tree storage engine.

---

### Biweekly Project 1 — Weeks 1–2: WAL-Backed KV Store (Write-Ahead Log from Scratch)

**What this teaches:** WAL design, crash recovery, log compaction — the exact internals PostgreSQL, SQLite, and RocksDB use for durability.

**What you build:**

Your existing in-memory KV store loses all data on restart. This version adds durability using a Write-Ahead Log — the same mechanism PostgreSQL uses. Every write appends a log entry `{op: SET/DEL, key, value, timestamp, checksum}` to an append-only file **before** modifying the in-memory map. If the process crashes mid-write, the checksum catches partial writes on recovery.

Components to implement:

- **WAL writer** — append-only log with checksums. Every write durably recorded before in-memory update.
- **Recovery on startup** — replay the WAL from the last good checkpoint. The store returns to its exact pre-crash state.
- **Log compaction** — WAL files grow unboundedly. Compaction: snapshot the current in-memory state to a new file, delete all WAL entries before the snapshot. Same mechanism as Redis RDB + AOF.
- **Tenant isolation at storage level** — each tenant's data in a separate WAL segment. Quotas enforced during WAL write (reject if tenant's segment would exceed 100MB).

**Benchmark:** 100K writes, crash halfway, recover, verify all committed writes are present, no partial writes.

**Connection to plan:** This is the exact internals of the Storage Layer in OpenTrace (Month 7). You will have implemented half of it already.

**Push to GitHub with:** README explaining WAL format (binary layout diagram), benchmark results (writes/sec with and without fsync), recovery time on 1GB WAL, ADR comparing fsync vs fdatasync for different durability/performance tradeoffs.

---

### Biweekly Project 2 — Weeks 3–4: TCP Connection Pool (Like PgBouncer, But Yours)

**What this teaches:** pgwire protocol parsing, connection multiplexing, why PgBouncer exists, why opening 10K raw PostgreSQL connections kills a database.

**What you build:** A TCP proxy in Go that sits between clients and a PostgreSQL server, maintaining a fixed pool of backend connections and multiplexing many client connections onto them.

```
Client 1 ──┐
Client 2 ──┤──→ ConnectionPool ──→ [PG conn 1]
Client 3 ──┤                    ──→ [PG conn 2]
...        ┘                    ──→ [PG conn 3]
```

Components:

- **Pool manager** — maintain N persistent TCP connections to PostgreSQL. Queue client requests. Assign idle connection. Return to pool on query completion.
- **Protocol-aware proxying** — parse enough of the PostgreSQL wire protocol (pgwire) to know when a query starts and when it completes. Read the PostgreSQL protocol specification directly.
- **Transaction mode vs session mode** — session mode: client owns the connection for its entire session. Transaction mode: connection returned to pool after each transaction (how PgBouncer works in production). Implement both.
- **Health checking** — periodically send `SELECT 1` on idle connections. Remove broken connections. Replace them.

**Benchmark:** Compare raw PostgreSQL (1000 connections) vs your pool (10 backend connections, 1000 clients). Measure: connection setup latency, throughput, memory.

**Connection to plan:** This is exactly what PgBouncer does. After building this, you understand connection pool sizing formulas and the transaction mode vs session mode tradeoff from implementation depth, not just from documentation.

---

### Biweekly Project 3 — Weeks 5–6: WebSocket Chat Server v2 (Distributed, Clustered)

**What this teaches:** Redis pub/sub fan-out, distributed presence, the split-brain problem in real-time systems.

**What you build:** Your single-instance WebSocket server extended to work across multiple instances using Redis pub/sub — the same pattern used in production chat systems and the same pattern OpenTrace uses for live trace tailing.

- **Redis pub/sub fan-out** — message published on any instance reaches all instances → all broadcast to their local connected clients
- **Distributed room state** — room membership stored in Redis (`SADD room:{roomId}:members {connectionId}`)
- **Presence heartbeat** — client sends heartbeat every 30s. Server refreshes `HSET presence:{userId} last_seen {timestamp}` with 60s TTL. Dead connections expire automatically.
- **Message history** — `XADD room:{roomId}:history` (Redis Stream). New clients get last 50 messages.
- **Sub-10ms delivery** — benchmark end-to-end latency (message sent → received by all subscribers). Target: p99 < 10ms on same datacenter.

**Connection to plan:** OpenTrace's live tail WebSocket (Month 7) uses exactly this pattern. Your chat server is the simplified version you build first.

---

### Biweekly Project 4 — Weeks 7–8: DNS Resolver (Recursive, from Raw UDP)

**What this teaches:** Binary protocol parsing, UDP vs TCP, DNS delegation chain, why TTL-based caching exists.

**What you build:** A recursive DNS resolver in Go that resolves domain names from scratch — no OS resolver, no libraries. Start from the root servers, follow the delegation chain, return the final A record.

- **DNS wire format parser** — binary DNS messages: header (12 bytes: ID, flags, QDCOUNT, ANCOUNT, NSCOUNT, ARCOUNT), question section, answer records. Your own DNS message struct and binary encoder/decoder.
- **Recursive resolution algorithm** — query root servers → TLD nameserver → authoritative nameserver → A record
- **Caching layer** — cache every response with its TTL. First call: full recursion (~100ms). Second call: cache hit (< 1ms).
- **CNAME following** — recursively resolve CNAME targets
- **Query types** — A, AAAA, MX, TXT, NS records

**Benchmark:** Cold cache vs warm cache resolution time. Document each network round trip.

---

### Biweekly Project 5 — Weeks 9–10: Notification Delivery Service (Multi-Channel, Reliable)

**What this teaches:** Fan-out architecture, multi-channel delivery (email via SendGrid/AWS SES, SMS via Twilio, push via FCM/APNs), reliable queue-backed delivery with retries — the exact pattern used by every Indian product company at scale (Swiggy, Zomato, Zepto all have this system).

**Why this over an SMTP server:** Building a raw SMTP server is intellectually interesting but has low hiring signal in Indian interviews. Building a *notification delivery service* — which companies like Razorpay, PhonePe, and RouteMaster actually run — shows product-oriented distributed systems thinking that interviewers recognise immediately.

**What you build:** A standalone notification delivery service in Go with a clean REST API that all 5 projects consume.

- **Multi-channel abstraction** — pluggable `Channel` interface. Implement: Email (AWS SES), SMS (Twilio mock), Push (FCM mock). Swap channels without changing the caller.

```go
type Channel interface {
    ID() string
    Send(ctx context.Context, to, subject, body string) error
}
```

- **Reliable delivery queue** — every notification inserted into PostgreSQL (`SELECT FOR UPDATE SKIP LOCKED` worker). Status: `pending → sending → delivered | failed`. Exponential backoff with jitter on failures. After 3 attempts → DLQ.
- **Idempotency** — `POST /notifications` accepts an `X-Idempotency-Key` header. Duplicate requests return the cached result — no double-sends.
- **User preferences** — `GET /preferences/{userId}` returns which channels the user has enabled. The service respects opt-outs. PostgreSQL table: `user_preferences(user_id, channel, enabled)`.
- **Rate limiting** — max 5 notifications per user per minute via Redis `INCR notif:{userId}:{minute}` with 60s TTL. Prevents notification spam.
- **Webhook** — on delivery/failure, the service calls a configurable webhook URL (HMAC-signed). All 5 projects use this for delivery receipts.

**Benchmark:** 10K notifications/hour throughput. DLQ depth monitoring in Grafana.

**Connection to plan:** This is a standalone microservice in its own repo (`notification-service`). RouteMaster, PayCore, and DungBeetle each call it over HTTP when they need to notify a user — a clean REST API boundary with no shared code or shared deployment. Each project simply `POST /notifications` with a payload. This is exactly how notification systems work at Swiggy, Razorpay, and PhonePe.

---

### Biweekly Project 6 — Weeks 11–12: OTP Gateway (Multi-Tenant Auth Primitive)

**What this teaches:** Multi-tenancy at API level, crypto/rand vs math/rand for secrets, Redis as ephemeral state store, rate limiting at application layer.

**What you build:** A production-grade, self-hosted OTP verification service.

- **Multi-tenant** — each tenant gets a namespace + secret for BasicAuth. OTPs scoped per namespace.
- **Provider abstraction** — pluggable `Provider` interface: Email (via Notification Delivery Service from Biweekly Project 5), webhook (POST to any URL)
- **OTP lifecycle** — generate cryptographically random 6-digit OTP (`crypto/rand`). Store in Redis with TTL (`SETEX otp:{namespace}:{id} {ttl} {hashedOTP}`). Hash on storage (never raw OTP). Verify by hashing and comparing.
- **Rate limiting** — max 5 verification attempts per OTP via Redis `INCR otp:attempts:{id}` + TTL. Block after 5.
- **REST API** — `PUT /api/otp/:id` (generate + send), `POST /api/otp/:id` (verify), `POST /api/otp/:id/status` (check if verified)

**Connection to plan:** All 5 flagship projects use this for 2FA. The multi-tenant namespace pattern mirrors DungBeetle's multi-tenant job queue.

---

### Biweekly Project 7 — Weeks 13–14: Distributed Lock Service (Like Redlock, But Simpler and Yours)

**What this teaches:** The distributed lock problem, why TTL alone is not enough (fencing tokens), how DynamoDB, PostgreSQL advisory locks, and ZooKeeper solve the same problem differently.

**What you build:** A standalone Go service that provides distributed mutex primitives over HTTP and gRPC.

- **Lock acquisition** — `POST /locks/:resource` → try `SET lock:{resource} {ownerToken} NX PX {ttlMs}`. Returns lock token if acquired, 409 if held.
- **Lock release** — `DELETE /locks/:resource`. Lua script: verify token matches stored token, then delete. Atomic — no race between verify and delete.

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
```

- **Lock renewal** — `PATCH /locks/:resource` extends TTL. Used by long-running jobs.
- **Fencing tokens** — every lock acquisition returns a monotonically increasing fencing token (Redis `INCR lock:fence:{resource}`). The resource holder passes the token with every write. The resource rejects writes with stale tokens. This prevents the "process paused by GC, lock expired, other process takes lock, first process wakes and writes" race condition.
- **Watchdog goroutine** — automatically renew locks held by live clients on heartbeat schedule. If heartbeat stops (client died), lock expires via TTL.

**Connection to plan:** BookWise (Month 6) uses this lock service to prevent double-booking. DungBeetle uses it for leader election. PayCore uses it for idempotency key deduplication.

---

### Biweekly Project 8 — Weeks 15–16: LSM-Tree Storage Engine (The Write Path of RocksDB, Yours)

**What this teaches:** Why LSM-trees have excellent write performance (sequential writes), why reads are more expensive (multiple files to check), what "write amplification" means, why Bloom filters are essential for LSM performance. RocksDB, LevelDB, Cassandra, DynamoDB, and ScyllaDB all use this architecture.

**What you build:** A key-value storage engine in Go using an LSM-tree (Log-Structured Merge-tree). Same architecture as LevelDB.

- **MemTable** — in-memory sorted map. All writes go here first.
- **WAL** — every write to MemTable is first written to the WAL (append-only file). Recovery: replay WAL on startup.
- **Flush to SSTable** — when MemTable exceeds 4MB, flush to disk as an SSTable (Sorted String Table): a sorted, immutable file with a binary search index at the end.

```
SSTable layout:
[data block 1][data block 2]...[index block][footer]
index block: sorted list of (last_key_in_block → block_offset)
```

- **Compaction** — multiple SSTables accumulate. Compaction: read all, merge-sort, write new SSTable, delete old ones. Handle tombstones (deleted keys).
- **Bloom filter per SSTable** — before reading an SSTable to check if a key exists, check its Bloom filter. If "no," skip the file. Reduces unnecessary disk reads from O(N files) to O(1) for missing keys.
- **Get operation** — check MemTable → check SSTables newest-to-oldest (with Bloom filter shortcut) → return first match or "not found."

**Benchmark:** 1M writes. Measure: write throughput, read latency (warm cache, cold cache), compaction impact on write latency (write stalls). Document in `BENCHMARKS.md`.

**Connection to plan:** If someone asks "how does RocksDB work?" you answer from code, not Wikipedia. This is also the write path OpenTrace's ClickHouse Storage Layer uses conceptually — understanding LSM-trees makes ClickHouse's MergeTree engine immediately clear.

---

## BookWise — The Distributed Booking System

**Why a booking system:** Booking systems are one of the hardest classes of distributed systems problems. Double-booking prevention requires distributed locking. Seat inventory requires atomic operations. Payment + confirmation requires Sagas. Waitlists require event-driven state machines. Every startup that handles appointments, reservations, tickets, or slots has this problem.

**What BookWise is:** A production-grade distributed booking platform. Think: flight seat reservation + concert ticket booking + doctor appointment scheduling. Not a demo. Not a tutorial. A real system that handles 10K concurrent booking attempts with zero double-bookings.

**The double-booking problem — how BookWise solves it:**

```go
// Naive (broken): check then book — race condition between check and insert
available := db.QueryRow("SELECT count FROM inventory WHERE seat_id = $1", seatId)
if available > 0 {
    // Another request wins the race here
    db.Exec("UPDATE inventory SET count = count - 1 WHERE seat_id = $1", seatId)
    db.Exec("INSERT INTO bookings ...")
}

// Correct: atomic decrement with check
result := db.Exec(`
    UPDATE inventory
    SET count = count - 1
    WHERE seat_id = $1 AND count > 0   -- atomic: decrement only if available
    RETURNING count
`, seatId)
if result.RowsAffected == 0 {
    return ErrSeatUnavailable   // someone else got it
}
// Only one transaction can win — database guarantees atomicity
db.Exec("INSERT INTO bookings ...")
```

For high-contention seats (e.g., front row at a Taylor Swift concert):

- Redis `DECR inventory:{seatId}` — atomic, O(1), returns new count. If < 0, INCR back and reject.
- Distributed lock via Biweekly Project 7 — only one BookWise instance processes requests for a given seat simultaneously.
- Fencing token passed with every inventory mutation — prevents stale lock holders from booking.

**What BookWise grows into across the months:**

| Month | BookWise Feature | Distributed Systems Concept |
|-------|-----------------|----------------------------|
| 1 | Raw HTTP booking endpoint — POST /bookings, no concurrency protection yet | REST API design, idempotency keys |
| 2 | JWT auth, tenant isolation (multi-venue support), webhook notifications | OAuth2, webhooks, multi-tenancy |
| 3 | Go rewrite, gRPC internal inventory service | gRPC service definitions, Go concurrency |
| 4 | React booking UI, seat map component, real-time availability via SSE | Server-Sent Events for live seat updates |
| 5 | PostgreSQL advisory locks + Redis distributed lock (Biweekly Project 7) | Database locking, distributed locks |
| 6 | Payment Saga (reserve seat → charge payment → confirm → release if payment fails) | Saga pattern, compensating transactions |
| 7 | Waitlist engine — Kafka event triggers automatic assignment when booking cancelled | Event-driven state machine |
| 8 | AI-powered seat recommendation using PGVector | RAG over seat metadata |

**BookWise Infraspec narrative:** *"I built a distributed seat reservation system that handles 10K concurrent booking requests with zero double-bookings. The inventory uses Redis atomic DECR with PostgreSQL as the source of truth and distributed locks with fencing tokens to prevent stale lock races. The payment flow is a Saga — if Stripe declines the card, the seat is automatically released and the next person on the waitlist is notified within 200ms."*

---

## Daily Schedule

| Block | Duration | Activity |
|-------|----------|----------|
| **Morning** | 2 hours | Learn the concept. Run code. Break it. Read source code — not docs. Concept introduced because a project needs it. GitHub Copilot open — use it, explain every accepted suggestion. |
| **Evening** | 2 hours | Build the named feature of the named project. Must use ≥ 3 technologies together. Always "BookWise needs X" or "DungBeetle needs X" or "OpenTrace needs X" — each project drives its own features. Never a tutorial. |
| **DSA** | 30 min | 1 problem. Always connects to what you built. LRU = Redis eviction. Bloom Filter = URL crawler dedup. Consistent Hash = job routing. |
| **RFC/ADR** | 30 min | Write a short RFC or ADR for a decision you made. Do this every day. Senior engineers write constantly. |
| **Saturday** | 5 hours | Weekend capstone: wire the week's features into the flagship project. Deploy. Benchmark with k6. Push biweekly project. |
| **Sunday** | 3 hours | Document: README + ADR update, benchmark numbers, LinkedIn/X post, Loom walkthrough. CI must be green. |

**AI workflow (from Day 1):**
- GitHub Copilot always open — every suggestion you accept, you must explain
- Month 2+: Claude drafts your first RFC — you rewrite it entirely in your own reasoning
- Month 4+: TestSprite generates E2E tests — review and fix every single one
- Month 6+: You build AI features (Vercel AI SDK + tool use) — not just consume AI, build with it

---

# MONTH 1 — Fundamentals + OS + Computer Networks + JavaScript Engine
### Backend 2026 Roadmap: Blocks 1 + 2 · OpenTrace: Scaffold + Protocol Study

> **What you build this month for OpenTrace:** The monorepo scaffold, proto definitions for OTLP, a raw gRPC echo server that receives spans and logs them — nothing stored yet. You study the actual Jaeger source code and OTLP spec this month. You understand the protocol before you implement it.
>
> **OS + Computer Networks this month:** TCP three-way handshake, socket programming (`net.Listen` → `Accept` → `Read`/`Write`), file descriptors, process lifecycle — all grounded in "this is what happens when your Collector receives an OTLP/gRPC connection."
>
> **Biweekly Project 1 starts:** KV Store v2 with WAL. Runs in parallel with main work on weekends.
>
> **By end of Month 1:** OpenTrace monorepo exists with proto-generated code. A gRPC server receives a span and prints it. You have read the Jaeger collector source code and written notes on how it works. All 4 other projects have their own GitHub repos initialised with a raw HTTP server, a `README.md` stub, and a `BENCHMARKS.md` placeholder.

---

## Week 1 — How the Web Works: HTTP, DNS, Client/Server, Browsers

---

### Monday — Week 1 · HTTP/HTTPS Model + Dev Environment

| | |
|---|---|
| 🛠 **Technologies** | Node.js 22 LTS, VS Code, pnpm, `curl`, `dig`, `openssl` |
| 📖 **Concepts** | HTTP methods, status codes, request/response headers, HTTP/2 multiplexing, TLS handshake |
| 🎯 **You Build** | Dev environment configured. `curl -v` dissection of 5 real sites documented. Domain registered on Cloudflare. |

**Morning — HTTP from First Principles**

Run `curl -v https://google.com` and observe: TCP handshake → TLS handshake → HTTP request → HTTP response. HTTP status code families: 2xx (success), 3xx (redirect), 4xx (client error), 5xx (server error). HTTP/2 multiplexes multiple requests over a single TCP connection, solving HTTP/1.1 head-of-line blocking.

**VS Code Setup**: ESLint, Prettier, Error Lens, GitLens, Thunder Client. Format-on-save. pnpm workspaces with `packages/types`, `packages/schemas`, `packages/utils`.

**DSA — Big O Notation:** O(1), O(log N), O(N), O(N log N), O(N²). Connect: HTTP header lookup is O(1) (hash map). DNS recursive resolution is O(depth of tree). Sorting HTTP logs is O(N log N).

---

### Tuesday — Week 1 · Client/Server Concepts + REST Design

| | |
|---|---|
| 🛠 **Technologies** | Node.js `http` stdlib, `curl`, `httpie` |
| 📖 **Concepts** | Stateless vs stateful, REST resource design, idempotency (GET/PUT/DELETE vs POST), request/response lifecycle |
| 🎯 **You Build** | Raw GPS/span receiver — plain `http.createServer`, no framework. Handles malformed requests gracefully. |

**Morning — REST Constraints:** Resources identified by URLs. Nouns, not verbs (`/spans`, not `/getSpans`). Plural. Hierarchy represents relationships (`/traces/abc123/spans`). Query strings for filtering. **Idempotency:** GET, PUT, DELETE are idempotent. POST is not. Critical for payment retries.

---

### Wednesday — Week 1 · DNS — From Browser to IP

| | |
|---|---|
| 🛠 **Technologies** | `dig`, `nslookup`, Cloudflare DNS, Wireshark |
| 📖 **Concepts** | DNS record types (A, CNAME, MX, TXT, NS, PTR), TTL, recursive vs iterative resolution, CDN DNS routing |
| 🎯 **You Build** | Register domains for all 5 projects on Cloudflare. Configure A and CNAME records. Set TTLs correctly. |

Run `dig +trace google.com`. Follow: browser cache → OS cache → recursive resolver → root servers → TLD servers → authoritative nameservers. **TTL rule:** lower TTL 48 hours before any planned migration, raise it back after.

---

### Thursday — Week 1 · How Websites Work — Browser Rendering Pipeline

| | |
|---|---|
| 🛠 **Technologies** | Chrome DevTools (Elements, Network, Performance, Lighthouse) |
| 📖 **Concepts** | HTML → DOM → CSSOM → Render Tree → Layout → Paint → Composite, critical render path, reflow vs repaint |
| 🎯 **You Build** | Profile OpenTrace UI landing page with Lighthouse. Document every bottleneck. Achieve 90+ score before adding React. |

**Render pipeline:** CSS blocks rendering — browser must finish parsing all CSS before painting. Animating `transform` and `opacity` only triggers compositing — the cheapest GPU operation. This is why CSS animations using `transform` are smooth and `top/left` animations are janky.

---

### Friday — Week 1 · CLI + Shell Scripting

| | |
|---|---|
| 🛠 **Technologies** | Bash, `grep`, `sed`, `awk`, `find`, `top`, `htop`, `ps`, `kill`, `cron` |
| 📖 **Concepts** | File system hierarchy, pipes and redirection, process management, environment variables, cron jobs |
| 🎯 **You Build** | Deploy script: stops old server, pulls new code, runs tests, starts new server, health checks. |

---

## Week 2 — HTML + CSS: Semantic Markup, Box Model, Flexbox, Grid

---

### Monday — Week 2 · HTML + Accessibility

| | |
|---|---|
| 🛠 **Technologies** | HTML5, WAVE accessibility checker, Lighthouse |
| 📖 **Concepts** | Semantic HTML elements (`<header>`, `<main>`, `<article>`, `<section>`), ARIA attributes, forms |
| 🎯 **You Build** | OpenTrace UI dashboard markup — semantic HTML with no CSS yet. Passes WAVE accessibility check. |

---

### Tuesday — Week 2 · CSS Box Model + Cascade

| | |
|---|---|
| 🛠 **Technologies** | CSS3, Chrome DevTools Computed tab |
| 📖 **Concepts** | Box model (content, padding, border, margin), `box-sizing: border-box`, cascade algorithm, specificity, CSS custom properties |
| 🎯 **You Build** | OpenTrace layout styled with pure CSS — box model understood by measuring every element in DevTools. |

**Critical rule:** Always add `*, *::before, *::after { box-sizing: border-box }`. Specificity scoring: inline style (1000) > ID (100) > class/attribute/pseudo-class (10) > element (1).

---

### Wednesday — Week 2 · Flexbox + Grid + Responsive Design

| | |
|---|---|
| 🛠 **Technologies** | CSS Flexbox, CSS Grid, media queries, `clamp()` |
| 📖 **Concepts** | Main axis vs cross axis, Grid template areas, auto-fill vs auto-fit, mobile-first design |
| 🎯 **You Build** | OpenTrace trace list layout — 1 column on mobile, 2 on tablet, 3 on desktop using only CSS Grid. |

---

### Thursday — Week 2 · CSS Animations + Tailwind CSS

| | |
|---|---|
| 🛠 **Technologies** | CSS animations, `@keyframes`, CSS transitions, Tailwind CSS |
| 📖 **Concepts** | GPU-accelerated animations (`transform`/`opacity`), `will-change`, Tailwind utility-first model, `cn()`, `cva()` |
| 🎯 **You Build** | OpenTrace UI rebuilt with Tailwind. All custom CSS deleted. `cn()` for conditional classes. |

---

### Friday — Week 2 · Shadcn UI + Radix UI

| | |
|---|---|
| 🛠 **Technologies** | Shadcn UI, Radix UI, Tailwind |
| 📖 **Concepts** | Headless components, compound component pattern, accessibility built-in (keyboard navigation, ARIA), owning your component source |
| 🎯 **You Build** | OpenTrace UI uses Shadcn: DataTable for trace list, Dialog for trace detail, Command palette for search |

### Weekend Capstone — Web Fundamentals + Biweekly Project 1 (WAL KV Store)

All 5 platform landing pages: semantic HTML, Tailwind, Shadcn, Lighthouse 90+, deployed to Cloudflare Pages. WAL implementation started — WAL writer + recovery on startup by end of weekend.

---

## Weeks 3–4 — JavaScript Engine: Types, Scope, Closures, Prototypes, Event Loop, TypeScript

*(Coverage identical to original plan — all JavaScript internals, closures, prototypes, event loop phases, async/await, generators, TypeScript strict mode, Zod, branded types. Applied to OpenTrace utilities: `packages/utils` contains retry, emitter, scheduler, ConcurrencyLimiter. `packages/types` contains all branded entity IDs. `packages/schemas` contains Zod schemas for OTLP span validation.)*

### Weekend Capstone — All 5 Platform Shells + Biweekly Project 1 Complete

All 5 platforms have raw HTTP servers. WAL KV store: WAL writer, recovery, log compaction, benchmark results in `BENCHMARKS.md`. `goleak.VerifyNone` passing.

---

# MONTH 2 — JavaScript Deep + Node.js + TypeScript Mastery
### OpenTrace: Collector v0.1

> **What you build this month for OpenTrace:** The Collector — receives OTLP/gRPC and OTLP/HTTP, validates spans, publishes to Kafka. This is the entry point of the entire tracing system. Every span from every application enters through here.
>
> **Infraspec goal:** JWT RS256 auth and OAuth2 PKCE flow implemented. Webhook HMAC signing live on DungBeetle. `AsyncLocalStorage` for request-scoped context — the foundation of distributed tracing context propagation.
>
> **RFC this month:** "OpenTrace Collector Design — backpressure strategy, Kafka topic partitioning scheme, and validation failure handling." One page. Three options. Recommendation with tradeoffs.
>
> **Biweekly Project 2:** TCP connection pool — builds understanding of exactly what PgBouncer does. Run in parallel on weekends.

---

## Weeks 5–6 — Node.js Internals + Streams + DungBeetle v0.1

*(Coverage identical to original plan — V8 JIT pipeline, hidden classes, generational GC, libuv event loop all 6 phases, streams with backpressure, `pipeline()`, `worker_threads`, `AsyncLocalStorage`, `crypto` HMAC signing, `net` TCP server, `perf_hooks`, `clinic.js`.)*

**All concepts applied with OpenTrace framing:**
- `AsyncLocalStorage` — used by OpenTrace Collector to propagate trace context through the request handler chain without passing it as a parameter to every function
- HMAC signing — used by DungBeetle's webhook delivery system to sign outbound payloads, and used by the Notification Delivery Service to verify webhook callbacks
- Streams — used by OpenTrace Collector to handle large OTLP batch requests without buffering the entire payload in memory

---

## Weeks 7–8 — TypeScript Mastery + DungBeetle Scaffold + OpenTrace Collector

### OpenTrace Collector v0.1 (Built This Month)

The Collector is the entry point for all spans. It must be reliable, fast, and correct above all else.

```go
// gRPC service definition from OTLP spec
service TraceService {
  rpc Export(ExportTraceServiceRequest) returns (ExportTraceServiceResponse) {}
}

// OpenTrace Collector receives this, validates, and publishes to Kafka
// Implementation uses: grpc-go, sarama (Kafka client), protobuf
```

Components built this month:

- **OTLP/gRPC receiver** — Go gRPC server implementing the `TraceService` proto. Receives `ExportTraceServiceRequest`, validates spans (required fields, valid timestamps, trace ID format), returns `ExportTraceServiceResponse`.
- **OTLP/HTTP receiver** — HTTP endpoint accepting Protobuf and JSON-encoded OTLP. Same validation pipeline.
- **Kafka producer** — validated spans published to `spans.raw` Kafka topic. Partition key = `trace_id` (ensures all spans of a trace go to same partition → ordering guaranteed).
- **Backpressure** — if Kafka is slow, the Collector's send buffer fills. Collector returns `RESOURCE_EXHAUSTED` gRPC status to the instrumented application (which queues locally or drops). Document this tradeoff in the ADR.

**Benchmark this month:** Collector throughput at 1K, 10K, 100K spans/sec. Find the bottleneck (likely Kafka publish latency). Fix with batching. Document in `BENCHMARKS.md`.

### Weekend Capstone — OpenTrace Collector v0.1 + Biweekly Project 2 Complete

OpenTrace Collector deployed and load tested. A small Go test harness generates synthetic OTLP spans to verify the Collector end-to-end — spans arrive over gRPC, are validated, and land in the Kafka topic. PayCore (in its own repo) has auth and webhook design complete this month independently. TCP connection pool: pgwire protocol parsing, transaction mode and session mode, benchmark vs raw PostgreSQL. ADR written: "Why PgBouncer transaction mode over session mode."

---

# MONTH 3 — Go Mastery
### OpenTrace: Pipeline Processor

> **What you build this month for OpenTrace:** The Pipeline Processor — consumes from Kafka, makes tail-based sampling decisions, enriches spans with service metadata, and bulk-inserts into ClickHouse.
>
> **Go is the primary language for OpenTrace and all 5 projects from this month onward.** One full month on the language before any project uses it in production.
>
> **RFC this month:** "DungBeetle v0.1 → Go Rewrite — Why Go over Node.js for the job worker." Covers: goroutine-per-job model, `go test -race`, `goleak`, benchmark numbers before/after.

---

## Weeks 7–10 — Go Language Core + Concurrency + Stdlib

*(Coverage identical to original plan — complete Go language: zero values, implicit interfaces, error wrapping `%w`, `defer`, goroutines (M:N scheduler, work stealing, 2KB stacks), channels (all patterns), `sync.RWMutex`/`Pool`/`Once`, `errgroup`, `singleflight`, `atomic`, `context`, `sqlc`, `chi`, `cobra`, `slog`, `pprof`, `go test -race`, `goleak`, `golangci-lint`, generics.)*

### OpenTrace Pipeline Processor (Built This Month)

The Pipeline Processor is where span data is transformed from raw Kafka messages into ClickHouse rows. This is the most complex component to get right because it must be: fast (ClickHouse bulk insert), correct (no lost spans), and configurable (sampling policies).

```go
// The processor's main loop
func (p *Processor) Run(ctx context.Context) error {
    for msg := range p.consumer.Messages() {
        spans := p.deserialize(msg)
        spans = p.enrich(spans)       // add service metadata from registry
        if p.sampler.ShouldKeep(spans) {
            p.buffer.Add(spans)        // buffer for bulk insert
        }
        p.consumer.MarkOffset(msg)
    }
    return nil
}

// Tail-based sampling decision: keep 100% errors + slow spans, 5% normal
func (s *TailSampler) ShouldKeep(spans []Span) bool {
    for _, span := range spans {
        if span.StatusCode == Error { return true }
        if span.DurationUs > 500_000 { return true } // > 500ms
    }
    return rand.Float64() < 0.05 // 5% of normal traces
}
```

**ClickHouse bulk insert** — batch 10K spans before writing. `INSERT INTO spans VALUES ...` with batch. Benchmark: single-row insert vs batch insert. Document 100x throughput difference in `BENCHMARKS.md`.

### Weekend Capstone — Go Mastery + Pipeline Processor + Biweekly Project 3

`go test -race ./...` passes everywhere. `goleak.VerifyNone` passes everywhere. Pipeline Processor deployed — the synthetic span generator from Month 2 now flows through Kafka into ClickHouse, proving the full Collector → Kafka → Processor → ClickHouse pipeline works end-to-end. DungBeetle (in its own repo) has its v0.1 Go job queue running. Clustered WebSocket chat server: Redis pub/sub fan-out, distributed presence, sub-10ms delivery benchmark.

---

# MONTH 4 — React + Frameworks + Testing + Dev Tools
### OpenTrace: UI v0.1

> **What you build this month for OpenTrace:** The UI — trace list, trace detail page, D3.js waterfall visualization. The waterfall is the hardest UI component: each span must be positioned proportionally on a timeline, with child spans nested under parent spans, all rendered at 60fps even for traces with 10K+ spans.
>
> **Biweekly Projects 4–5 run this month:** DNS Resolver (Weeks 7–8) and Notification Delivery Service (Weeks 9–10).

---

## Weeks 11–14 — React + Next.js + Testing

*(Coverage this month — all React hooks, reconciliation, `React.memo`, Tanstack Query optimistic updates, Zustand selective subscription, Next.js App Router + Server Components + ISR + streaming Suspense + Server Actions, Vitest, `@testing-library/react`, Playwright E2E (single E2E tool — no Puppeteer or Cypress), TestSprite, `testcontainers-go`. Frontend framework: Next.js is the primary and only framework — no Svelte or Vue 3 to context-switch between.)*

**All concepts applied with OpenTrace framing:**

**OpenTrace Trace Waterfall (D3.js):** The waterfall visualization is a timeline where each span is a horizontal bar. Width = duration. Position = start time relative to trace start. Child spans are nested under parent spans. The critical rendering challenge: traces with 10K spans must render without blocking the UI thread. Solution: virtualized rendering — only render spans that are visible in the current viewport. D3.js handles the coordinate calculations; React virtualizes the DOM elements.

```typescript
// Each span becomes a positioned div
const spanToRect = (span: Span, traceStart: number, totalDuration: number, depth: number) => ({
  left:   `${((span.startTime - traceStart) / totalDuration) * 100}%`,
  width:  `${(span.duration / totalDuration) * 100}%`,
  top:    `${depth * 24}px`,
  color:  serviceColorMap[span.serviceName],
});
```

**Server Components for OpenTrace UI:** The trace list page renders on the server — zero JS bundle for the initial list. Clicking a trace loads the detail page, which streams the waterfall in as spans are fetched from the Query Service via gRPC streaming.

### Weekend Capstone — All 5 Platforms Full-Stack + OpenTrace UI v0.1

All 5 projects have Next.js/React frontends, Go backends, PostgreSQL + Redis, JWT auth, full test suites — each in its own GitHub repo with its own CI pipeline. OpenTrace UI v0.1: trace list, trace detail, basic waterfall renders real spans from the synthetic span generator. DNS Resolver: cold/warm cache benchmark. Notification Delivery Service: its own repo, multi-channel delivery, reliable queue, idempotency, webhook receipts — consumed independently by RouteMaster and PayCore via a clean REST API.

---

# MONTH 5 — DBMS Deep Internals + Caching Architecture + System Design Part 1
### Backend 2026 Roadmap: Block 4 — THE Most Important Month
### OpenTrace: Storage Layer

> **This is the most important month in the plan.** The Backend 2026 roadmap is explicit: databases are a massive block. Tables, columns, indexes, query planner, performance, isolation levels — each is a week-long subject on its own. You don't learn PostgreSQL by reading the docs. You learn it by running `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` on 50 queries, watching seq scans appear and disappear as you add indexes, and intentionally triggering dirty reads and phantom reads in live transactions.
>
> **What this month gives you that most engineers never have:** The ability to look at a slow query, read its execution plan, understand exactly why it's slow, fix it in 3 minutes, and verify the fix with before/after benchmark numbers.
>
> **OpenTrace: Storage Layer** — ClickHouse schema design, monthly partitioning, TTL policies, query optimisation. The goal: trace queries against 30 days of data complete in < 200ms p99. This is what Month 5 delivers.
>
> **Biweekly Projects 6–7 run this month:** OTP Gateway (Weeks 11–12) and Distributed Lock Service (Weeks 13–14).
>
> **The sequence matters:** Isolation levels before Kafka (you need to understand distributed transactions before designing sagas). MVCC before sharding (you need to understand how PostgreSQL handles concurrency before you think about distributing it). Query planner before read replicas (you need to understand where queries are slow before you add replicas to fix them).

---

## Week 13 — Relational Databases Deep + PostgreSQL Mastery

---

### Monday — Week 13 · ACID + Transactions + All 4 Isolation Levels with Live Anomaly Demos

| | |
|---|---|
| 🛠 **Technologies** | PostgreSQL, `psql`, two terminal windows for concurrent transactions |
| 📖 **Concepts** | ACID properties, all 4 isolation levels demonstrated live, `SELECT FOR UPDATE`, `ON CONFLICT DO UPDATE` (upsert) |
| 🎯 **You Build** | PayCore double-entry ledger — every financial movement creates two journal entries in a single transaction that are guaranteed to both commit or both roll back. |

**The 4 Isolation Levels — demonstrated with live anomaly scripts:**

| Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|-------|-----------|---------------------|--------------|
| Read Uncommitted | ✓ possible | ✓ possible | ✓ possible |
| Read Committed (PG default) | ✗ prevented | ✓ possible | ✓ possible |
| Repeatable Read | ✗ prevented | ✗ prevented | ✓ possible |
| Serializable | ✗ prevented | ✗ prevented | ✗ prevented |

**Demonstrate each anomaly in a real `psql` session:**

```sql
-- DIRTY READ demo (requires Read Uncommitted, not possible in PG — use MySQL to demo)
-- TERMINAL 1: BEGIN; UPDATE accounts SET balance = 9999 WHERE id = 1; (don't COMMIT yet)
-- TERMINAL 2: SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; SELECT balance FROM accounts WHERE id = 1;
-- Terminal 2 sees 9999 — money that doesn't exist yet (Terminal 1 could ROLLBACK)

-- NON-REPEATABLE READ demo (Read Committed level)
-- TERMINAL 1: BEGIN; SELECT balance FROM accounts WHERE id = 1; (gets 100)
-- TERMINAL 2: BEGIN; UPDATE accounts SET balance = 200 WHERE id = 1; COMMIT;
-- TERMINAL 1: SELECT balance FROM accounts WHERE id = 1; (gets 200 — changed mid-transaction!)
-- TERMINAL 1: COMMIT;

-- PHANTOM READ demo (Repeatable Read level)
-- TERMINAL 1: BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT COUNT(*) FROM orders WHERE total > 100; (gets 5)
-- TERMINAL 2: INSERT INTO orders (total) VALUES (150); COMMIT;
-- TERMINAL 1: SELECT COUNT(*) FROM orders WHERE total > 100; (still 5 — phantom prevented in PG)
-- Note: PostgreSQL uses MVCC which prevents phantoms even at Repeatable Read
```

Write the anomaly demonstration script and push it to GitHub as `scripts/isolation-level-demos/`. This is the most valuable database education artifact you will produce.

---

### Tuesday — Week 13 · PostgreSQL Internals: MVCC + WAL + All Index Types

| | |
|---|---|
| 🛠 **Technologies** | PostgreSQL, `pg_stat_activity`, `pg_locks`, WAL settings, `pgstattuple` |
| 📖 **Concepts** | MVCC (Multi-Version Concurrency Control) — tuple versions, `xmin`/`xmax`, vacuum, table bloat; WAL segments, checkpoints, WAL archiving; all index types |
| 🎯 **You Build** | All 5 platform schemas with proper indexes. `EXPLAIN ANALYZE` on every endpoint — zero seq scans on tables > 10K rows. OpenTrace `pg_stat_statements` enabled and queried. |

**MVCC deep dive:**

```sql
-- See MVCC tuple headers directly
SELECT ctid, xmin, xmax, * FROM spans LIMIT 5;
-- ctid: physical location (page, offset)
-- xmin: transaction that created this tuple version
-- xmax: transaction that deleted/updated this tuple version (0 if current)

-- After an UPDATE, the old tuple is not deleted — it is marked with xmax
-- The new tuple has a new xmin
-- VACUUM reclaims dead tuples (those whose xmax was committed)

-- Measure table bloat
SELECT schemaname, tablename,
       n_dead_tup, n_live_tup,
       round(n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0) * 100, 2) AS bloat_pct
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
```

**WAL: why it exists:**

```
Without WAL: write data page → crash → data page half-written → corruption
With WAL:    write WAL record → fsync WAL → write data page → checkpoint
             On crash: replay WAL records → data page restored to consistent state
```

**All PostgreSQL index types with correct use cases:**

```sql
-- B-tree (default) — O(log N), used for =, <, >, BETWEEN, ORDER BY
CREATE INDEX ON spans (service_name);

-- Partial index — only index rows matching a condition (tiny, fast for filtered queries)
CREATE INDEX ON spans (trace_id) WHERE status_code = 2;   -- only error spans

-- Covering index — include extra columns so query is satisfied from index alone (no heap fetch)
CREATE INDEX ON spans (service_name, start_time) INCLUDE (duration_us, operation_name);

-- Composite index — column order matters: queries must use leftmost columns
-- Good for: WHERE service_name = 'paycore' AND start_time > ...
-- NOT for:  WHERE start_time > ... (without service_name — can't use this index efficiently)

-- GIN — inverted index, for JSONB, arrays, full-text search
CREATE INDEX ON spans USING GIN (attributes);   -- for attributes @> '{"http.status": "500"}'

-- BRIN — tiny index for naturally ordered data (timestamps in append-only tables)
CREATE INDEX ON gps_pings USING BRIN (ping_time);  -- 1000x smaller than B-tree for time-series
```

---

### Wednesday — Week 13 · Query Planner + `EXPLAIN ANALYZE` Mastery

| | |
|---|---|
| 🛠 **Technologies** | PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, `auto_explain`, `pg_stat_statements` |
| 📖 **Concepts** | Seq scan vs index scan vs bitmap scan vs index-only scan, join strategies (hash join / nested loop / merge join), planner statistics (`pg_stats`), `auto_explain` for production slow queries |
| 🎯 **You Build** | Fix 5 slow queries across all projects by reading the query plan. Before/after `EXPLAIN ANALYZE` output documented. Zero seq scans on tables > 10K rows. |

**Reading `EXPLAIN ANALYZE` output:**

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
SELECT s.trace_id, s.operation_name, s.duration_us
FROM spans s
WHERE s.service_name = 'paycore'
  AND s.start_time > NOW() - INTERVAL '1 hour'
ORDER BY s.duration_us DESC
LIMIT 100;
```

Key fields to read:
- **`Seq Scan`** on a large table → missing index. Add it.
- **`Rows Removed by Filter`** → many rows scanned, few returned. Index on filter column.
- **`Shared Hit Blocks`** → data was in PostgreSQL buffer pool (fast). **`Shared Read Blocks`** → read from disk (slow, add memory or improve index).
- **`Actual Loops`** in a nested loop join → if this number is high, the inner side is scanned many times. Consider switching to hash join.
- **`Actual Time`** per node → where is the time actually spent?

**`auto_explain`** — enables logging of any query slower than a threshold:

```sql
-- postgresql.conf
shared_preload_libraries = 'auto_explain'
auto_explain.log_min_duration = '100ms'   -- log any query > 100ms
auto_explain.log_analyze = true
auto_explain.log_buffers = true
```

After enabling, slow queries appear in your PostgreSQL log with full `EXPLAIN ANALYZE` output — you get production query plans without connecting to the database.

---

### Thursday — Week 13 · Scaling PostgreSQL — Read Replicas + PgBouncer

| | |
|---|---|
| 🛠 **Technologies** | PostgreSQL streaming replication, PgBouncer, `pg_stat_replication` |
| 📖 **Concepts** | Streaming replication, replication lag monitoring, PgBouncer transaction mode vs session mode, connection pool sizing formula, WAL archiving for PITR |
| 🎯 **You Build** | OpenTrace Query Service reads from a PostgreSQL read replica (for metadata queries). PgBouncer in transaction mode for all services. Connection pool sizing calculated and documented. |

**Connection pool sizing formula:**

```
pool_size = (# CPUs * 2) + effective_spindle_count
# For a 4-CPU RDS instance: pool_size = (4 * 2) + 1 = 9
# PgBouncer: 10K app connections → 9 database connections
```

**PgBouncer transaction mode vs session mode:**
- **Session mode:** client owns the connection for its entire session. PostgreSQL prepared statements work. `SET` commands persist. Safe but fewer clients can share each connection.
- **Transaction mode:** connection returned to pool after each transaction. `SET` commands don't persist (cleared on return). Prepared statements require PgBouncer workarounds. But one connection serves many more clients.
- **Use transaction mode** in production for HTTP APIs. Use session mode for long-running reporting jobs.

**Replication lag monitoring:**

```sql
-- On primary: how far behind is each replica?
SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
       (sent_lsn - replay_lsn) AS replication_lag_bytes
FROM pg_stat_replication;

-- Alert when lag > 10MB (risk of stale reads on replica)
```

---

### Friday — Week 13 · Sharding + Partitioning

| | |
|---|---|
| 🛠 **Technologies** | PostgreSQL partitioning, consistent hash router in Go |
| 📖 **Concepts** | Horizontal sharding (split rows across databases), range vs hash vs list partitioning, partition pruning |
| 🎯 **You Build** | OpenTrace span ingestion table partitioned by month in ClickHouse (range). Queries for "last 24 hours" touch 1–2 partitions, not all historical data. |

**Range partitioning in PostgreSQL (for metadata):**

```sql
CREATE TABLE span_metadata (
    trace_id UUID, service_name TEXT, ingested_at TIMESTAMPTZ
) PARTITION BY RANGE (ingested_at);

CREATE TABLE span_metadata_2026_01 PARTITION OF span_metadata
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- New partitions created monthly by a DungBeetle cron job
-- Old partitions moved to cold storage by a separate archival job
-- Partition pruning: WHERE ingested_at > NOW() - INTERVAL '24h' only touches 1 partition
```

**ClickHouse partitioning (for OpenTrace spans):** Already designed in the schema above — `PARTITION BY toYYYYMM(start_time)`. Verify partition pruning with ClickHouse `EXPLAIN`:

```sql
EXPLAIN SELECT trace_id, duration_us FROM spans
WHERE service_name = 'paycore' AND start_time > now() - INTERVAL 24 HOUR;
-- Look for: Selected 1/7 parts
-- This means ClickHouse read 1 partition out of 7 total — partition pruning is working
```

---

## Week 14 — Caching Architecture

*(Coverage identical to original plan — cache-aside, read-through, write-through, write-behind, cache stampede/thundering herd/TTL jitter, Redis all data structures with correct use cases, Lua scripts for atomicity, caching at different architecture levels, `Cache-Control` headers.)*

**Applied to OpenTrace:** The Query Service caches frequently-requested traces in Redis. TTL jitter prevents stampede when multiple users open the same trace simultaneously. Cache key: `trace:{traceId}`. Invalidation: when a new span arrives for a trace already in cache, the key is deleted (cache-aside pattern).

---

## Week 15 — Kafka Essentials + System Design (URL Shortener + Rate Limiter)

---

### Monday — Week 15 · Message Queues: DLQ + Retry Policies

*(Coverage identical to original plan — at-least-once delivery, idempotency, DLQ, exponential backoff, poison pill handling.)*

**DungBeetle v1.0** (in its own repo): jobs retry with exponential backoff. After max retries, moved to DLQ. DLQ dashboard in UI. The retry-with-DLQ pattern is a standalone distributed systems concept that DungBeetle demonstrates independently — it is not borrowed from OpenTrace.

---

### Tuesday–Wednesday — Week 15 · Kafka Essentials

| | |
|---|---|
| 🛠 **Technologies** | Apache Kafka, MSK, Confluent Go Kafka client |
| 📖 **Concepts** | Topic → partition → offset model, consumer groups, partition key selection, idempotent producer, exactly-once semantics (EOS), consumer lag monitoring, outbox pattern |
| 🎯 **You Build** | OpenTrace span pipeline via Kafka (Collector → `spans.raw` topic → Processor → ClickHouse). In PayCore's own repo, independently: payment events published to a `payments.events` Kafka topic for the analytics read model. |

**OpenTrace Kafka topic design** (internal to OpenTrace only):

```
spans.raw          → partition key = trace_id   (ordering per trace guaranteed)
spans.sampled      → partition key = trace_id   (sampled spans only)
spans.errors       → partition key = service    (all error spans, unsampled)
```

Partition key = `trace_id` ensures all spans of one trace go to the same partition. This guarantees ordering — the Processor can reconstruct the complete trace without sorting by time.

**PayCore Kafka topic design** (in PayCore's own repo, independent):

```
payments.events    → partition key = user_id    (ordering per user guaranteed)
payments.dlq       → partition key = payment_id (failed payment events)
```

PayCore and OpenTrace use Kafka for completely different purposes with different topic designs. Both are documented in their own separate ADRs.

**Consumer lag monitoring** — if the Processor falls behind:

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group trace-processor
# Shows: CURRENT-OFFSET, LOG-END-OFFSET, LAG per partition
# Alert when LAG > 100K messages sustained for 15 minutes
```

**Outbox pattern for OpenTrace Collector:**

The Collector must guarantee that every span it acknowledges to the application is eventually written to Kafka. Without the outbox, a crash between receiving the span and publishing to Kafka loses the span permanently.

```sql
-- Collector: in one transaction
BEGIN;
INSERT INTO span_outbox (id, payload, status) VALUES (uuid(), proto_bytes, 'pending');
-- Acknowledge to the application (gRPC OK response)
COMMIT;
-- Separate outbox worker: reads pending rows, publishes to Kafka, marks as published
-- On crash: worker restarts, finds pending rows, retries
```

---

### Thursday–Friday — Week 15 · System Design: URL Shortener + API Rate Limiter

*(Coverage identical to original plan — URL shortener with base62 encoding, redirect cache, analytics counters; rate limiter with token bucket, sliding window log, Redis Lua atomic implementation.)*

**Applied to OpenTrace:** The rate limiter service protects the Collector from overloaded instrumented services. If one service sends more than 100K spans/sec, the Collector rate limits it and returns `RESOURCE_EXHAUSTED`.

### Weekend Capstone — All Database Patterns + OpenTrace Storage Layer

All 5 platforms using correct database choices. ClickHouse Storage Layer deployed: `EXPLAIN` shows partition pruning working. `pg_stat_statements` catching slow queries. PgBouncer in transaction mode. URL Shortener + Rate Limiter deployed. Biweekly Project 7 (Distributed Lock Service) started.

---

# MONTH 6 — Infrastructure + Real-Time + Resiliency + System Design Part 2
### OpenTrace: Query Service + API Gateway

> **What you build this month for OpenTrace:** The Query Service (gRPC, streams trace data from ClickHouse) and the API Gateway (TypeScript, REST wrapper over gRPC, service dependency graph endpoint). These two components make the stored traces accessible to the UI.
>
> **Full observability stack this month:** OpenTrace instruments itself. The Collector, Processor, Query Service, and API Gateway all emit their own spans using the OTel Go SDK, which the Collector then ingests. You see the full self-referential trace of a query request: UI → API Gateway → Query Service → ClickHouse → back. Every other project instruments itself independently using the official OTel SDK with its own collector endpoint.

---

## Weeks 16–17 — Docker + K8s + Terraform + GitHub Actions + gRPC + Observability

*(Coverage this month — Docker multi-stage builds, non-root user, `trivy` CVE scan, Kubernetes Pod/Deployment/Service/Ingress/HPA, Terraform HCL + state + modules, GitHub Actions CI pipeline, Firecracker microVM concepts, S3 presigned URLs + multipart upload + lifecycle, Cloudflare Workers, gRPC + Protocol Buffers, SideCar circuit breaker + mTLS, OpenTelemetry distributed tracing + Prometheus metrics + structured `slog` logs.)*

**OpenTrace Query Service (Built This Month):**

```go
// gRPC service definition for OpenTrace Query Service
service QueryService {
  rpc FindTraces(FindTracesRequest) returns (stream Trace) {}
  rpc GetTrace(GetTraceRequest) returns (Trace) {}
  rpc GetServices(GetServicesRequest) returns (GetServicesResponse) {}
  rpc GetOperations(GetOperationsRequest) returns (GetOperationsResponse) {}
  rpc GetDependencies(GetDependenciesRequest) returns (DependencyGraph) {}
}
```

The `GetDependencies` endpoint constructs the service dependency graph from spans. For each span with a parent_span_id in a different service, it creates an edge from parent service to child service. The result is a directed graph of all service-to-service calls in the observed system.

```go
// Service dependency graph construction from ClickHouse
func (q *QueryService) GetDependencies(ctx context.Context, req *GetDependenciesRequest) (*DependencyGraph, error) {
    rows, err := q.ch.Query(ctx, `
        SELECT parent.service_name AS caller, child.service_name AS callee, COUNT(*) AS call_count
        FROM spans child
        JOIN spans parent ON child.parent_span_id = parent.span_id
                         AND child.trace_id = parent.trace_id
        WHERE child.start_time > ? AND parent.service_name != child.service_name
        GROUP BY caller, callee
    `, req.StartTime)
    // Build directed graph from rows
}
```

**API Gateway (TypeScript, Built This Month):**

The API Gateway wraps the gRPC Query Service in a REST API that the UI can call. It also handles: authentication (JWT verification), rate limiting, and request validation.

```typescript
// REST → gRPC translation
app.get('/api/traces', async (req, res) => {
  const { service, operation, start, end, minDuration, limit } = req.query;
  const stream = queryClient.FindTraces({
    serviceName: service as string,
    operationName: operation as string,
    startTime: new Date(start as string),
    endTime: new Date(end as string),
    minDuration: Number(minDuration),
    maxResults: Number(limit) || 20,
  });
  const traces = [];
  for await (const trace of stream) {
    traces.push(trace);
  }
  res.json({ traces });
});
```

### Week 17B — Full-Stack Observability

*(Full coverage identical to original plan — Three pillars: traces (OpenTelemetry), metrics (Prometheus + Grafana RED method), logs (structured slog with trace_id). Alerting: SLI/SLO/error budget, Prometheus alert rules with `for: 5m`, Alertmanager routing, inhibition rules, on-call runbooks. Production debugging workflow: alert → Grafana → exemplar → Jaeger/OpenTrace → slow span → pprof → fix → verify. Three deliberately introduced bugs: missing index, goroutine leak, N+1 query.)*

**OpenTrace instruments itself:** All OpenTrace components (Collector, Processor, Query Service, API Gateway) emit spans using the official OpenTelemetry Go SDK. The Collector ingests its own sibling components' spans. The result is a self-referential trace: a request to the UI creates a trace that shows the UI calling the API Gateway, which calls the Query Service, which queries ClickHouse — the entire pipeline visible as one distributed trace inside OpenTrace itself. This is the most compelling demo you will give, and it requires zero integration with any other project.

---

## Week 18 — PayCore + Financial Systems + System Design

*(Coverage identical to original plan — double-entry ledger with `DECIMAL(19,4)`, idempotency keys with `ON CONFLICT DO NOTHING`, outbox pattern, Saga pattern, event sourcing, CQRS, system design: Tinder Feed + Twitter Trends with Count-Min Sketch.)*

### Weekend Capstone — All Infrastructure Live + OpenTrace Query Service + API Gateway

All 5 projects deployed to ECS Fargate — each from its own repo, its own Terraform config, its own CI pipeline. OpenTrace Query Service + API Gateway deployed; the self-referential trace demo is live. Each of the other four projects has its own Prometheus + Grafana stack and emits OTel traces to its own local Jaeger instance (not to OpenTrace — they are independent). PITR drill executed on PayCore's PostgreSQL. Biweekly Project 7 (Distributed Lock Service) complete — BookWise uses it internally for seat reservation locking.

---

# MONTH 7 — Distributed Systems Deep + Blob/CDN/Edge + System Design Part 3
### Backend 2026 Roadmap: Distributed Systems is Your Core Interest — This Month Goes All In
### OpenTrace: UI v2 + SDK

> **This is the distributed systems month.** Everything you have built so far — the WAL in Biweekly Project 1, the TCP connection pool in Biweekly Project 2, the distributed lock in Biweekly Project 7, the LSM-tree in Biweekly Project 8 — converges here. DungBeetle evolves from a monolith into a fully event-driven, leader-elected, exactly-once job processing system. BookWise gets its waitlist engine powered by Kafka event-driven state machines.
>
> **OpenTrace UI v2:** Service map visualization (using the dependency graph from the Query Service), live tail WebSocket (streams new spans in real time as they arrive), and the auto-instrumentation SDK (instruments any Go HTTP server with a single import).
>
> **Biweekly Project 8** (LSM-tree storage engine) runs this month. By end of Month 7, your GitHub has: WAL store, TCP pool, clustered WebSocket, DNS resolver, Notification Delivery Service, OTP gateway, distributed lock service, LSM-tree. That is a distributed systems portfolio that most 3-year engineers don't have.

---

### Weeks 19–21 — Bloom Filters + Consistent Hashing + Protocols + Big Data + S3 + Edge + Wasm + System Designs

---

### Bloom Filters

| | |
|---|---|
| 🛠 **Technologies** | Go, Redis `BF.ADD`/`BF.EXISTS` |
| 📖 **Concepts** | Probabilistic membership, false positive rate, sizing formula (`m = -n*ln(p) / ln(2)²`), optimal hash count (`k = m/n * ln(2)`), no false negatives guarantee |
| 🎯 **You Build** | OpenTrace URL dedup Bloom filter for the RouteMaster web crawler. Also: DungBeetle uses Bloom filter to check if a job has been processed before hitting the database. |

**Sizing calculation for OpenTrace:** If the Processor has seen 1 billion trace IDs and needs to check for duplicates (to prevent processing the same span twice), a Bloom filter sized for 1 billion items at 0.1% false positive rate requires: `m = -1B * ln(0.001) / ln(2)² = ~14.4GB`. Too large. Solution: use a smaller Bloom filter for recent spans (last 1 hour) + ClickHouse deduplication for older ones.

---

### Consistent Hashing

| | |
|---|---|
| 🛠 **Technologies** | Go |
| 📖 **Concepts** | Hash ring, virtual nodes (vnodes), adding/removing nodes remaps only 1/N keys, ketama algorithm |
| 🎯 **You Build** | Go consistent hash library as a standalone `pkg/consistenthash` package used independently in two projects: DungBeetle worker routing (in its own repo) and OpenTrace Collector Processor assignment (in OpenTrace repo). Same library, completely independent use cases. |

**OpenTrace consistent hashing use case:** Tail-based sampling requires seeing all spans of a trace before making the sampling decision. If multiple Processor instances handle different spans of the same trace, no single instance has the complete picture. Consistent hashing routes all spans with the same `trace_id` to the same Processor instance — the trace is complete for sampling decisions.

---

### DungBeetle v3.0: Kafka + Leader Election + Exactly-Once Cron

| | |
|---|---|
| 🛠 **Technologies** | Go, Kafka, Redis, PostgreSQL |
| 📖 **Concepts** | Kafka-backed job queue, Redis leader election for cron jobs, HMAC-signed webhook delivery, exactly-once processing |
| 🎯 **You Build** | DungBeetle v3.0: Kafka replaces PostgreSQL for job queue. Leader election ensures one cron runner. Webhook manager with HMAC signing, retry with backoff, DLQ. |

**Redis leader election:**

```go
func (w *Worker) TryBecomeLeader(ctx context.Context) bool {
    acquired, err := w.redis.SetNX(ctx, "leader:lock", w.instanceId, 30*time.Second).Result()
    if err != nil || !acquired {
        return false
    }
    // Start heartbeat: refresh TTL every 10 seconds while still doing work
    go w.refreshLease(ctx)
    return true
}

func (w *Worker) refreshLease(ctx context.Context) {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            // Verify we still hold the lock before refreshing
            script := redis.NewScript(`
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("expire", KEYS[1], ARGV[2])
                else
                    return 0
                end
            `)
            result, _ := script.Run(ctx, w.redis, []string{"leader:lock"}, w.instanceId, 30).Result()
            if result.(int64) == 0 {
                // Lost the lock — another instance took over
                return
            }
        case <-ctx.Done():
            return
        }
    }
}
```

---

### OpenTrace SDK (Auto-Instrumentation)

| | |
|---|---|
| 🛠 **Technologies** | Go, Go AST, OpenTelemetry Go SDK |
| 📖 **Concepts** | Go AST for code analysis, monkey-patching HTTP handlers, auto-instrumentation without code changes |
| 🎯 **You Build** | OpenTrace Go SDK: any Go HTTP server — including apps you've never built — can send spans to OpenTrace with a single import and one line of code. To demo it, you write a small standalone sample app that imports the SDK. The other four projects use the official OTel SDK pointing at their own Jaeger instances independently. |

```go
// Before (no instrumentation):
http.ListenAndServe(":8080", mux)

// After (full auto-instrumentation):
import _ "github.com/yourusername/opentrace/sdk/go"  // import for side effect

otrace.Instrument(mux)  // wraps all routes with span creation
http.ListenAndServe(":8080", mux)
// Now every request creates a span, every outbound HTTP call creates a child span,
// every database query via standard `database/sql` creates a child span
```

The SDK wraps `http.Handler`, `database/sql`, `net/http.Transport`, and `google.golang.org/grpc` to create spans automatically. It reads the OpenTrace Collector address from an environment variable (`OPENTRACE_ENDPOINT=localhost:4317`).

---

### S3 + Cloudflare Workers + WebAssembly

*(Coverage identical to original plan — S3 presigned URLs, multipart upload, lifecycle policies, Cloudflare Workers V8 isolates, Cloudflare KV, R2, Wasm Go compilation, in-browser fraud detection at < 15ms p99.)*

---

### System Designs This Month

*(Coverage identical to original plan — GitHub Gists (content-addressable storage, presigned S3, full-text search, forking), Fraud Detection (Wasm rules engine + ML scoring), Recommendation System (collaborative filtering + PGVector cosine ANN, two-stage pipeline), Distributed Booking System (BookWise waitlist engine), Background Job System (DungBeetle v3.0).)*

### Weekend Capstone — OpenTrace UI v2 + SDK + Biweekly Project 8

OpenTrace UI v2: service map renders the real self-referential dependency graph (UI → API Gateway → Query Service → ClickHouse). Live tail WebSocket streams new incoming spans in real time. SDK: a standalone sample app demonstrates zero-code-change auto-instrumentation — one import, spans flowing. LSM-tree: 1M write benchmark, compaction strategy, Bloom filter shortcutting reads, documented in `BENCHMARKS.md`. DungBeetle v3.0 (its own repo): Kafka job queue, leader election, exactly-once cron — fully independent milestone. BookWise waitlist engine (its own repo): Kafka event-driven state machine for waitlist assignment.

---

# MONTH 8 — AI-Native Stack + Performance Engineering + Final System Designs
### Backend 2026 Roadmap: Blocks 8 + 9
### OpenTrace: Production Hardening

> **OpenTrace Production Hardening:** K8s Operator for lifecycle management, OTel compatibility testing (any app using official OTel SDK sends spans to OpenTrace with zero config changes), 10M spans/sec load test, final `BENCHMARKS.md`.

---

## Weeks 22–24 — AI Engineering + Performance Engineering + System Designs

---

### AI Engineering: Embeddings + RAG + Tool Use + Agents

*(Coverage identical to original plan — PGVector embeddings, HNSW index, cosine similarity, RAG pipeline (embed → retrieve top-K → inject into prompt → generate grounded answer), AI SDK (Vercel) with `useChat`/`streamText`/tool definitions, multi-agent orchestration on DungBeetle.)*

**Applied to OpenTrace:** OpsAI semantic search over OpenTrace's own span data: "find all traces where the ClickHouse query took longer than 500ms" or "show me all error spans in the Query Service from the last hour." This is a natural language query translated to a ClickHouse SQL query by the AI, running entirely within the OpenTrace codebase. No dependency on any other project.

---

### k6 Load Testing + pprof Profiling

*(Coverage identical to original plan — virtual users, ramp-up patterns, p50/p95/p99 at target RPS, SLO validation, CPU flame graphs via `go tool pprof`, heap allocation profiling, goroutine dump, three deliberately introduced performance regressions: hot-loop allocation, N+1 query, goroutine leak.)*

**OpenTrace load test targets:**

| Component | Target RPS | p99 SLO | Error Rate SLO |
|-----------|-----------|---------|----------------|
| Collector (gRPC ingestion) | 10M spans/sec | < 5ms | < 0.01% |
| Pipeline Processor (Kafka → ClickHouse) | 10M spans/sec | — | < 0.001% |
| Query Service (FindTraces) | 1K queries/sec | < 200ms | < 0.01% |
| Query Service (GetDependencies) | 100 queries/sec | < 500ms | < 0.01% |
| API Gateway (REST) | 5K req/sec | < 50ms | < 0.01% |

---

### `EXPLAIN ANALYZE` on Every ClickHouse + PostgreSQL Query

*(Coverage identical to original plan — eliminate all seq scans on tables > 10K rows, `auto_explain` for production slow query logging, verify partition pruning, understand join strategies.)*

**OpenTrace ClickHouse-specific optimisations:**

```sql
-- Finding spans by attribute value (e.g., http.status_code = 500)
-- Bad: table scan with LIKE
SELECT * FROM spans WHERE attributes['http.status_code'] = '500'

-- Good: pre-materialise common attributes as columns with projections
ALTER TABLE spans ADD PROJECTION http_errors
  (SELECT trace_id, span_id, service_name, start_time, duration_us
   WHERE attributes['http.status_code'] != '200'
   ORDER BY service_name, start_time);

-- ClickHouse EXPLAIN shows whether projection is used:
EXPLAIN SELECT trace_id FROM spans WHERE attributes['http.status_code'] = '500';
-- Look for: "Projection: http_errors" in the plan
```

---

### Complete System Design Implementations

*(Coverage identical to original plan — Twitter Trends (Count-Min Sketch, sliding window counters), Notification System (fan-out on write vs read, APNs/FCM), Realtime Abuse Masker (streaming classifier, shadow banning), API Rate Limiter (adaptive rate limiter with p99 feedback in SideCar).)*

### Weekend Capstone — OpenTrace Production Hardened + All System Designs Complete

K8s Operator for OpenTrace deployed. OTel compatibility verified: the official `go.opentelemetry.io/otel` SDK sends spans to OpenTrace with only `OTEL_EXPORTER_OTLP_ENDPOINT=your-opentrace-collector:4317`. 10M spans/sec load test passed and documented. All system design implementations deployed. `BENCHMARKS.md` complete for all projects.

---

# MONTH 9 — Performance Engineering + OpenTrace Polish + LFX Mentorship Sprint
### The Month That Opens CNCF Doors

> **Two goals this month, both equally important:**
>
> **Goal 1 — OpenTrace production-ready.** 10M spans/sec load tested. K8s Operator deployed. OTel SDK compatibility verified. `BENCHMARKS.md` complete. Architecture RFC complete. Final year project documentation complete.
>
> **Goal 2 — LFX September cycle application submitted.** Needs: cover letter, ≥ 2 merged PRs in the target project, and a project proposal.
>
> **Why your application will be strong:** You have spent 8 months building a distributed tracing system that is architecturally identical to Jaeger. You understand OTLP at the wire level. You have built a gRPC server, a Kafka pipeline processor, a ClickHouse storage layer, and a query service. When you say "I want to contribute to Jaeger," you mean it from implementation depth — not from tutorial knowledge.

---

## Weeks 25–26 — Performance Engineering + LFX Application

---

### k6 + pprof: Three Performance Regressions Introduced and Fixed

*(Coverage identical to original plan — allocating inside hot loop → `sync.Pool` fix, N+1 query → JOIN fix, goroutine leak → `defer ticker.Stop()` fix. All documented with before/after benchmark numbers in `BENCHMARKS.md`.)*

**OpenTrace-specific performance targets:**

| Project | Target RPS | p99 Latency SLO | Error Rate SLO |
|---------|-----------|-----------------|----------------|
| OpenTrace span ingestion | 50K/sec | < 50ms | < 0.01% |
| PayCore payments | 10K TPS | < 200ms | < 0.001% |
| DungBeetle job claims | 5K/sec | < 100ms | < 0.01% |
| BookWise seat reservations | 10K concurrent | < 500ms | < 0.001% |
| RouteMaster orders | 20K/sec | < 100ms | < 0.01% |

---

### LFX Mentorship Application: Pick Project + Find Issues + Submit PRs

**Target projects ranked by fit with OpenTrace:**

| Project | Why It Fits | Entry Points |
|---------|------------|--------------|
| **Jaeger** | You rebuilt Jaeger. You know the architecture at implementation depth. | `jaeger-ui` TypeScript waterfall improvements, Go collector, ClickHouse storage plugin |
| **OpenTelemetry Go** (`otelgo`) | You implemented OTLP. You understand the SDK lifecycle from building the Collector. | `sdk/trace`, `exporters/otlp`, receiver components |
| **OpenTelemetry Collector Contrib** | You built a collector. The contrib repo has 100+ receivers/exporters to improve. | ClickHouse receiver (you've written one), OTLP improvements |
| **Prometheus** | You've written Prometheus exporters for all your projects. | Client library improvements, exporter fixes |
| **Kubernetes** (`controller-runtime`) | You wrote a K8s Operator for OpenTrace. Controller-runtime is the library under them. | Reconciler improvements, better error handling |

**How to read the Jaeger codebase fast:**

```
jaeger/
├── cmd/collector/    ← start here — this is what your OpenTrace Collector mirrors
├── cmd/query/        ← this is what your OpenTrace Query Service mirrors
├── plugin/storage/   ← storage plugins — your ClickHouse plugin would live here
│   └── clickhouse/   ← this is your exact contribution target
├── model/            ← span/trace data model — you know this from OTLP
└── proto/            ← proto definitions — identical to what you generated in Month 1
```

**Your natural Jaeger contribution:** A production-quality ClickHouse storage plugin. Jaeger has storage plugins for Cassandra, Elasticsearch, and BadgerDB. ClickHouse is better for trace storage than all three (columnar, faster analytical queries, cheaper storage). You built a ClickHouse storage layer for OpenTrace — you can contribute it to Jaeger as a real, working plugin.

**PR description template:**

```markdown
## What this does
Adds ClickHouse storage plugin for Jaeger.

## Why
ClickHouse outperforms Elasticsearch for trace storage: 10x better compression,
faster analytical queries (p99 < 200ms on 30-day window), lower cost at scale.
See benchmarks in BENCHMARKS.md.

## How
Implements the `spanstore.Reader` and `spanstore.Writer` interfaces using ClickHouse
MergeTree with monthly partitioning and 30-day TTL. Schema matches the official
Jaeger data model.

## Testing
Integration tests using testcontainers-go (real ClickHouse instance in CI).
Load tested at 10M spans/sec — see BENCHMARKS.md.
```

---

### LFX Cover Letter

```
Paragraph 1 — Who you are and what you built:
"I spent the last 8 months building OpenTrace — a complete open-source distributed
tracing system in Go and TypeScript, equivalent to Jaeger in architecture. I
implemented the OTLP receiver in Go (gRPC + HTTP), a Kafka-based span processing
pipeline with tail-based sampling, a ClickHouse storage layer with monthly
partitioning and TTL, and a Next.js UI that renders trace waterfalls and service
dependency maps. OpenTrace instruments itself — the full self-referential trace of
a query request (UI → API Gateway → Query Service → ClickHouse) is visible live in
the system. Alongside it, I built four independent production-grade systems in
separate repos: PayCore (financial ledger, event sourcing), DungBeetle (job platform,
leader election), BookWise (distributed booking, Saga pattern), and RouteMaster
(logistics, fan-out notifications at scale)."

Paragraph 2 — Why this specific project:
"I'm applying to contribute to Jaeger because OpenTrace gave me intimate familiarity
with Jaeger's architecture from the inside out. I've built what Jaeger builds. I've
already contributed [N] PRs: [link1], [link2]. My natural contribution is the
ClickHouse storage plugin — I built one for OpenTrace and I know exactly what
tradeoffs the implementation involves."

Paragraph 3 — What you want to build during mentorship:
"My proposal is to contribute a production-quality ClickHouse storage plugin to
Jaeger. Here is my implementation approach: [technical details]. I've already
benchmarked ClickHouse against Elasticsearch for trace storage: [numbers]. I've
discussed this in the Jaeger Slack channel with [maintainer name]."

Paragraph 4 — Why you will complete it:
"I've shipped code every week for 8 months. Here is my GitHub activity graph. Here
are my 8 standalone systems projects. I complete what I start."
```

---

### Cost Optimisation + Database Migration Strategy

*(Coverage identical to original plan — AWS Cost Explorer, Infracost, Terraform for cost analysis, compute cost breakeven (Lambda vs Fargate vs EC2), storage cost (S3 vs R2 egress), database cost; zero-downtime schema migrations using the expand/contract pattern for 100M-row tables.)*

---

### Portfolio Final + Cold Emails

**OpenTrace final README structure:**

```markdown
# OpenTrace
> A complete open-source distributed tracing system — OTLP compatible, Jaeger-equivalent,
> built from scratch in Go + TypeScript.

## Architecture
[Mermaid diagram showing all 7 components and data flow]

## Components
| Component | Language | Description |
|-----------|----------|-------------|
| Collector  | Go | OTLP/gRPC + OTLP/HTTP receiver, Kafka publisher |
| Processor  | Go | Tail-based sampling, enrichment, ClickHouse bulk writer |
| Storage    | Go | ClickHouse MergeTree, monthly partitions, 30-day TTL |
| Query      | Go | gRPC streaming query service, service dependency graph |
| Gateway    | TypeScript | REST API, authentication, rate limiting |
| UI         | Next.js | Trace waterfall, service map, live tail WebSocket |
| SDK        | Go | Auto-instrumentation for Go HTTP/gRPC/database/sql |

## Benchmarks
| Metric | Result |
|--------|--------|
| Ingestion throughput | 10M spans/sec |
| ClickHouse query p99 (30-day window) | < 200ms |
| Collector gRPC p99 latency | < 5ms |
| UI waterfall render (10K spans) | < 100ms |
| Storage cost vs Elasticsearch | 8x cheaper per GB |

## Self-Instrumented Demo
OpenTrace instruments its own 7 components. The live demo shows a real
distributed trace of a query request flowing through the entire system:
UI → API Gateway → Query Service → ClickHouse — fully observable inside OpenTrace.

## OTel Compatibility
Any application using the official OpenTelemetry SDK sends spans to OpenTrace with:
export OTEL_EXPORTER_OTLP_ENDPOINT=your-collector:4317
```

**Cold email — Infraspec:**

```
Subject: Backend Engineer — built OpenTrace: Jaeger-equivalent distributed tracing
         system in Go + TypeScript, 10M spans/sec

I spent 8 months building OpenTrace — a complete distributed tracing system that
receives OTLP spans over gRPC/HTTP, processes them through Kafka with tail-based
sampling, stores them in ClickHouse (10M spans/sec, p99 query < 200ms on 30-day
window), and serves them via a gRPC query service to a Next.js UI. OpenTrace
instruments itself — the self-referential demo is live.

Key numbers:
• 10M spans/sec ingestion throughput, ClickHouse query p99 < 200ms on 30-day window
• 4 independent production-grade systems in separate repos: PayCore (financial
  ledger + Saga), DungBeetle (job platform + leader election), BookWise (distributed
  booking + distributed locks), RouteMaster (logistics + fan-out notifications)
• 8 standalone systems projects: WAL, LSM-tree, recursive DNS resolver, TCP
  connection pool, distributed lock service, clustered WebSocket server

Also applying to LFX Mentorship for Jaeger — [N] PRs merged already. Natural
contribution: ClickHouse storage plugin (Jaeger currently lacks one).

[GitHub] [OpenTrace live demo] [BENCHMARKS.md] [Architecture RFC]
```

---

## Final Polish Checklist (OpenTrace + All Projects)

**OpenTrace-Specific**

- [ ] All 7 components deployed on Kubernetes (K8s Operator handles lifecycle)
- [ ] OTel compatibility verified — official OTel Go SDK sends to OpenTrace with zero config changes
- [ ] Self-instrumentation demo live — full trace of a query request visible inside OpenTrace itself
- [ ] Trace waterfall renders correctly for traces with 10K+ spans (virtualised rendering)
- [ ] Service map correctly shows the internal dependency graph of OpenTrace's own components
- [ ] Live tail WebSocket works under load (100 concurrent tail sessions)
- [ ] 10M spans/sec load test documented in `BENCHMARKS.md`
- [ ] ClickHouse query p99 < 200ms on 30-day window documented
- [ ] Architecture RFC written (problem → design → tradeoffs → alternatives considered)
- [ ] Final year project documentation complete

**LFX Application**

- [ ] Target project chosen and codebase mapped (Jaeger is primary target — ClickHouse plugin)
- [ ] ≥ 2 PRs submitted to target project (at least 1 merged)
- [ ] Cover letter written
- [ ] Project proposal written (ClickHouse storage plugin for Jaeger, implementation approach, timeline)
- [ ] Application submitted before September cycle deadline

**All Projects — Database + Distributed Systems**

- [ ] Isolation level demos script: all 4 levels demonstrated live in `scripts/isolation-level-demos/`
- [ ] `EXPLAIN ANALYZE` on every query — zero seq scans on tables > 10K rows, documented
- [ ] PgBouncer in transaction mode — connection pool sizing formula documented in ADR
- [ ] WAL biweekly project: binary layout diagram, benchmark, recovery time documented
- [ ] LSM-tree biweekly project: 1M write benchmark, compaction strategy, Bloom filter impact documented
- [ ] TCP connection pool biweekly project: pgwire protocol parsing, benchmark vs raw PostgreSQL
- [ ] Distributed lock service: fencing token correctness test, Lua atomic verify-and-delete
- [ ] Leader election: split-brain scenario tested, heartbeat failure tested
- [ ] Consistent hashing: adding/removing nodes remaps only 1/N keys, verified
- [ ] Kafka outbox pattern: crash between receive and publish tested, recovery verified
- [ ] Saga pattern: compensating transactions triggered on payment failure, verified
- [ ] Event sourcing: state reconstruction from event replay, verified

**All Projects — General**

- [ ] `go test -race ./...` passes — data races are silent production bugs
- [ ] `go test -bench` on every data structure — numbers in `BENCHMARKS.md`
- [ ] `goleak.VerifyNone(t)` passes in every Go test file — zero goroutine leaks
- [ ] `tsc --noEmit` passes — `strict: true`, no `any`, no `ts-ignore`
- [ ] Vitest 80%+ coverage on core business logic
- [ ] Playwright E2E in CI — branch protection enforced
- [ ] k6 load test documented: p50/p95/p99 at target RPS
- [ ] Prometheus + Grafana dashboard live for every service
- [ ] Each project emits OTel traces to its own observability stack (Jaeger instance per project, independent); OpenTrace emits to itself
- [ ] Structured `slog` JSON logs with `trace_id` on every line
- [ ] SLO-based alert rules — Alertmanager routes P1→PagerDuty, P2/P3→Slack
- [ ] PITR drill: DROP TABLE → restore → RTO < 10 min → runbook written
- [ ] `govulncheck ./...` passes, `trivy image` passes
- [ ] ADR for every major technology decision (database choice, caching strategy, Kafka partitioning, ClickHouse schema)
- [ ] README: Mermaid architecture diagram + benchmark table + live demo link

---

## Non-Negotiable Rules (From Day 1)

| Rule | Why |
|------|-----|
| `go test -race ./...` before every commit | Data races in the OpenTrace Collector lose spans silently under load |
| `EXPLAIN ANALYZE` + `EXPLAIN` on every ClickHouse + PostgreSQL query | Missing indexes cause p99 explosions — you must see the query plan before shipping |
| `goleak.VerifyNone(t)` in every Go test file | Goroutine leaks in the span pipeline accumulate over days and crash production |
| Idempotency key on every mutation that can be retried | PayCore: retries without idempotency cause duplicate charges |
| Outbox pattern for every Kafka publish that must be guaranteed | OpenTrace Collector: crash between receive and Kafka publish loses spans forever |
| ADR for every OpenTrace component design decision | Your LFX application proposal must show you understand design tradeoffs |
| k6 load test before calling anything "production-ready" | 10M spans/sec is the OpenTrace target — untested claims are fiction |
| `govulncheck ./...` + `trivy image` before every deploy | CNCF projects have strict security standards |
| Read Jaeger/OTel source code weekly | Your LFX application is rejected if you don't know the codebase |
| Post benchmark numbers publicly every weekend | Building in public accelerates learning and makes your LFX application credible |
| Never `fmt.Sprintf` in SQL — always parameterized queries | SQL injection in a tracing system is embarrassing and fixable in 30 seconds |
| Partition pruning verified on every ClickHouse query | A query that reads all partitions instead of one is 30x slower at 30-day window size |
| Document every isolation level anomaly demo | This is the most valuable database education artifact you will produce |
