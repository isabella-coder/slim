# Car Film Mini Program: System Design and Task Breakdown (Spec-Driven)

## 1. Document Info

- Project: car-film-mini-program
- Version: v1.1 (Spec-Driven baseline, risk-closed)
- Date: 2026-03-08
- Scope: Mini Program + Admin Console + Backend + Data Layer + Release process
- Goal: Move the project to strict spec-driven delivery with PostgreSQL as the single source of truth (SSOT)

Revision focus in v1.1:

1. Add media/object-storage architecture and attachment domain model.
2. Add optimistic-lock conflict UX strategy and weak-network offline queue.
3. Replace ambiguous JSON fallback with explicit dual-write transition policy.
4. Clarify idempotency and token/session strategy at API/security layer.
5. Split rollout timeline into two milestones to reduce delivery risk.

## 2. Objectives and Constraints

### 2.1 Business Objectives

1. Support end-to-end order lifecycle for film/wash services.
2. Ensure multi-role collaboration (manager/sales/technician/finance) with explicit permissions.
3. Eliminate multi-end overwrite risk by migrating from local JSON merge model to server-side SSOT.
4. Make release predictable via spec-first, test-first, and gated rollout.

### 2.2 Engineering Constraints (Current)

1. Mini Program currently uses local storage as primary order storage.
2. Backend is a single Python service (`admin-console/server.py`) with dual storage mode:
   - JSON file mode (default)
   - PostgreSQL mode via `ENABLE_DB_STORAGE=1`
3. Internal sync APIs now require `INTERNAL_API_TOKEN`.
4. Existing DB migration and schema files are present but not yet fully aligned with runtime repository implementation.
5. Media files (construction photos/payment proofs) are not yet modeled as first-class storage entities.

## 3. Current System (As-Is)

### 3.1 Components

1. Mini Program frontend:
   - Entry/order/dispatch/followup/sales pages under `pages/`
   - Core business logic in `utils/order.js`, `utils/scheduling.js`, `utils/followup.js`, `utils/finance-sync.js`
2. Admin Console frontend:
   - Static web app under `admin-console/web/`
3. Backend:
   - Single Python HTTP server in `admin-console/server.py`
4. Storage:
   - Local JSON files: `admin-console/data/orders.json`, `users.json`, `finance-sync-log.json`
   - Optional PostgreSQL storage when enabled

### 3.2 Main Data Flows

1. Mini Program local order write:
   - Save to `wx` storage (`filmOrders`)
2. Mini Program order sync:
   - Pull: `GET /api/v1/store/internal/orders`
   - Merge local/remote by timestamp
   - Push merged list: `POST /api/v1/store/internal/orders/sync`
3. Finance sync:
   - Mini Program triggers `POST /api/v1/store/internal/work-orders/sync`
   - Backend writes finance sync logs
4. Admin Console:
   - Login + token in memory
   - Query/update orders/followups/dispatch/finance logs

### 3.3 Existing API Surface (Implemented)

1. Health:
   - `GET /health`
   - 无独立 `db` 健康子接口（数据库状态由统一健康检查覆盖）
2. Internal APIs:
   - `GET /api/v1/store/internal/orders`
   - `POST /api/v1/store/internal/orders/sync`
   - `POST /api/v1/store/internal/work-orders/sync`
   - `GET /api/v1/orders?updatedAfter=...`
   - `PATCH /api/v1/orders/{id}`
3. Admin APIs:
   - Auth/session/user/password endpoints
   - Order list + update (`PUT /api/orders/{id}`)
   - Dispatch, followup, finance log endpoints

## 4. Target System (To-Be)

### 4.1 Architecture Principles

1. Server-side SSOT: PostgreSQL is the authoritative source for orders/users/logs.
2. Contract-first: API contracts are frozen before implementation.
3. Explicit versioning: optimistic locking for order update with mandatory `version`.
4. Incremental sync only: no full list overwrite in steady state.
5. Security by default: internal endpoints require token; passwords stored hashed.
6. Observable behavior: health checks, latency/error metrics, audit logs.

### 4.2 Critical Design Supplements

1. Media storage:
   - Use object storage (OSS/S3/COS) + CDN for photos/files.
   - Backend only stores attachment metadata and URLs.
2. Conflict handling UX:
   - `409 ORDER_VERSION_CONFLICT` must not drop user input.
   - Client keeps local draft, fetches latest server snapshot, and guides merge/re-apply.
3. Weak-network support:
   - Introduce client offline queue for non-destructive operations.
   - Retry with backoff and dead-letter behavior for repeated failures.
4. Migration safety:
   - Use time-boxed dual-write and reconciliation instead of uncontrolled JSON fallback.

### 4.3 Target Logical Architecture

1. Client Layer:
   - Mini Program
   - Admin Console Web
2. API Layer:
   - Auth API
   - Order API
   - Dispatch/Followup API
   - Finance integration API
3. Domain/Repository Layer:
   - Repository abstractions for orders/users/finance logs
   - DB repository as primary implementation
4. Data Layer:
   - PostgreSQL normalized schema (`users`, `orders`, `order_dispatches`, `order_work_parts`, `followups`, `finance_sync_logs`, `audit_logs`)
   - Object storage bucket for media assets + CDN distribution
5. Operations Layer:
   - Health/metrics/logging
   - Migration/validation jobs

## 5. Domain Model (Authoritative)

### 5.1 Core Entities

1. User
   - `username`, `name`, `role`, `password_hash`, `status`, `last_login_at`
2. Order
   - `order_id`, `service_type`, `status`, customer/vehicle/sales/store fields, `appointment_time`, `total_price`, `version`
3. Dispatch
   - per-order dispatch slot/work bay/technicians
4. Work Part
   - per-order technician part records and commission data
5. Followup
   - fixed nodes `D7`, `D30`, `D60`, `D180`
6. Finance Sync Log
   - inbound/outbound integration status
7. Audit Log
   - who changed what and when
8. Media Attachment
   - `attachment_id`, `order_id`, `kind`, `object_key`, `cdn_url`, `mime_type`, `size_bytes`, `uploaded_by`, `created_at`

### 5.2 Invariants

1. `orders.order_id` must be unique.
2. Every mutable order update must provide current `version`.
3. Version mismatch must return `409 ORDER_VERSION_CONFLICT`.
4. Canceled orders must not consume scheduling capacity.
5. Followup nodes are unique per `(order_id, node_type)`.
6. Attachment writes must be append-only or explicitly versioned (no silent overwrite).

## 6. Contract and Spec Baseline

### 6.1 Required Spec Artifacts

1. Product Spec: scope, roles, workflows, out-of-scope.
2. Domain Spec: entity definitions, invariants, state transitions.
3. API Spec (OpenAPI): endpoint contracts, auth rules, error models.
4. Data Spec: schema, index, migration rules, retention policy.
5. Test Spec: contract/integration/e2e/perf cases with expected outputs.
6. Release Spec: rollout, canary, rollback, checklists.

### 6.2 Spec Repository Layout (Must Adopt)

1. `specs/00-governance/`
2. `specs/01-domain/`
3. `specs/02-api/`
4. `specs/03-data/`
5. `specs/04-test/`
6. `specs/05-release/`

Each spec folder must include:

1. `README.md` (scope, owner, status)
2. `CHANGELOG.md` (spec-level change history)
3. `acceptance-checklist.md` (executable DoD)

### 6.3 Spec Status Model

1. `DRAFT`
2. `IN_REVIEW`
3. `APPROVED`
4. `IMPLEMENTED`
5. `VERIFIED`

No code merge to `main` unless related spec is at least `APPROVED`.

## 7. Security and Compliance Requirements

1. Internal APIs:
   - Must enforce `INTERNAL_API_TOKEN`
   - Must return explicit 401/503 error model
2. Auth:
   - Replace plaintext password compare with hash verify
   - Token model must be explicitly selected:
   - `Option A`: stateful session in Redis/DB with server-side revocation
   - `Option B`: short-lived JWT + refresh token + denylist for forced logout
3. Data:
   - Sensitive configuration from env only
   - DB least privilege account
4. Audit:
   - All order mutations must write audit log entry

## 8. Non-Functional Requirements

1. Availability:
   - Health endpoint stable under load
2. Performance:
   - P95 read API latency < 300ms
   - P95 write API latency < 500ms
3. Reliability:
   - Migration consistency: count diff = 0, amount diff = 0
4. Recoverability:
   - Rollback drill within 15 minutes
5. Observability:
   - Structured logs for request id, endpoint, latency, result
6. Client resilience:
   - Sync flow should tolerate intermittent connectivity without data loss.

## 9. Gap Analysis (As-Is vs To-Be)

1. Storage gap:
   - Runtime DB mode currently stores JSON payload in simplified tables; full normalized schema exists but not wired as runtime source.
2. Sync gap:
   - Mini Program still follows pull-merge-push full-list behavior.
3. Security gap:
   - Admin user password still plaintext in current server implementation.
4. Governance gap:
   - Specs and acceptance gates are not yet repository-first and mandatory.
5. Test gap:
   - Contract and migration verification automation is missing.
6. Media gap:
   - No object storage lifecycle and attachment metadata model.
7. Migration gap:
   - JSON fallback alone is not a safe rollback path after normalized DB writes.

## 10. Task Breakdown (WBS)

### Phase A: Spec Governance Setup

- [ ] A-01 Create `specs/` directory skeleton and ownership map.
- [ ] A-02 Define spec template (problem, scope, contract, risk, acceptance).
- [ ] A-03 Add spec status workflow and PR policy (`spec id required`).
- [ ] A-04 Define architecture decision record (ADR) template.
- [ ] A-05 Create baseline specs for domain/API/data/test/release.

Deliverables:

1. `specs/` structure with templates.
2. Contribution policy update in root docs.

Acceptance:

1. Any new feature PR references approved spec.
2. Missing spec blocks merge.

### Phase B: Data Model Finalization

- [ ] B-01 Freeze normalized PostgreSQL schema from `admin-console/sql/schema_v2.sql`.
- [ ] B-02 Add schema versioning rule and migration id convention.
- [ ] B-03 Define canonical field dictionary for orders and child tables.
- [ ] B-04 Define index strategy and query plans for hot endpoints.
- [ ] B-05 Define retention and archive rules for logs/audit.
- [ ] B-06 Add `attachments` table and storage metadata dictionary.
- [ ] B-07 Define object key naming, retention, and deletion policy for media.

Deliverables:

1. Data spec with ER model and field dictionary.
2. Migration playbook v1.

Acceptance:

1. Schema and field dictionary reviewed and approved.
2. Query plans satisfy P95 targets in test env.

### Phase C: Repository Refactor (Backend)

- [ ] C-01 Introduce repository interfaces in `server.py` split by domain.
- [ ] C-02 Implement DB repositories against normalized tables.
- [ ] C-03 Replace open-ended JSON fallback with explicit dual-write transition mode.
- [ ] C-04 Add transaction boundaries for multi-table order write.
- [ ] C-05 Add idempotent upsert strategy per entity.
- [ ] C-06 Add attachment repository (metadata only) and signed upload flow hooks.

Deliverables:

1. Repository layer design spec.
2. Runtime switch policy (`DB primary`, `dual-write transition`, `JSON snapshot readonly`).

Acceptance:

1. DB mode no longer depends on payload-only table model.
2. All order-related writes update required child tables atomically.

### Phase D: API Contract Alignment

- [ ] D-01 Freeze OpenAPI for order query/update endpoints.
- [ ] D-02 Promote incremental read API as default sync API.
- [ ] D-03 Ensure `PATCH /api/v1/orders/{id}` contract includes version and error model.
- [ ] D-04 Align admin `PUT /api/orders/{id}` with same optimistic lock semantics.
- [ ] D-05 Add standard error codes and message catalog.
- [ ] D-06 Add `Idempotency-Key` contract for side-effecting `POST` APIs.
- [ ] D-07 Define attachment upload contract (init upload, commit metadata, revoke).

Deliverables:

1. OpenAPI file under `specs/02-api/`.
2. Contract test cases.

Acceptance:

1. Contract tests pass for success and failure paths.
2. No undocumented fields in API responses.

### Phase E: Data Migration and Verification

- [ ] E-01 Validate and harden migration scripts under `admin-console/scripts/migrate/`.
- [ ] E-02 Add precheck script (source data quality, null/invalid fields).
- [ ] E-03 Run dry-run full migration and capture report.
- [ ] E-04 Run incremental migration rehearsal (`--since`).
- [ ] E-05 Build reconciliation script (count, sum, sampled field diff).
- [ ] E-06 Run dual-write shadow period with hourly reconciliation.
- [ ] E-07 Freeze JSON as readonly snapshot before final cutover.

Deliverables:

1. Migration report template.
2. Reconciliation scripts and report output.

Acceptance:

1. Orders count diff = 0.
2. Total amount diff = 0.
3. Sampled record field accuracy = 100%.

### Phase F: Mini Program Sync Upgrade

- [ ] F-01 Replace full-list overwrite sync with incremental pull strategy.
- [ ] F-02 Add local checkpoint (`lastSyncedAt`) and retry/backoff logic.
- [ ] F-03 Add conflict handling UI for `ORDER_VERSION_CONFLICT`.
- [ ] F-04 Ensure all order mutation requests include `version`.
- [ ] F-05 Add telemetry for sync success/failure and retry counts.
- [ ] F-06 Add offline operation queue for weak-network environments.
- [ ] F-07 Add local storage eviction policy (recent N days + active orders only).

Deliverables:

1. Updated sync design spec for `utils/order.js`.
2. E2E scenarios for offline/online reconciliation.
3. Conflict-resolution UX spec (draft preservation, diff, retry path).

Acceptance:

1. No full-order-list push in normal flow.
2. Conflicts are user-visible and recoverable.
3. Client storage does not exceed Mini Program local storage budget.

### Phase G: Admin Console Hardening

- [ ] G-01 Add version field propagation in order edit payload.
- [ ] G-02 Add explicit conflict prompt for 409 response.
- [ ] G-03 Upgrade password handling to hash-based auth.
- [ ] G-04 Add role-based guard audit for finance/security actions.
- [ ] G-05 Add session expiration and invalidation strategy.
- [ ] G-06 Implement token revocation flow for role change and forced logout.
- [ ] G-07 Add conflict diff UI for 409 responses on order edits.

Deliverables:

1. Security spec and implementation notes.
2. Admin UI conflict/retry UX spec.

Acceptance:

1. Plaintext password path removed.
2. Unauthorized access attempts are blocked and logged.

### Phase H: Observability and Ops

- [ ] H-01 Add structured logging with request id.
- [ ] H-02 Expose DB latency metric in health endpoint and logs.
- [ ] H-03 Add periodic consistency job for DB vs snapshot comparison.
- [ ] H-04 Define alert thresholds for 5xx, sync failure, conflict rate.
- [ ] H-05 Add runbook for incidents and rollback.
- [ ] H-06 Define offline queue stuck-rate and retry saturation alerts.

Deliverables:

1. Observability spec.
2. Runbook docs.

Acceptance:

1. On-call can identify and triage top failure modes within 10 minutes.
2. Rollback drill completed successfully.

### Phase I: Test and Release Gates

- [ ] I-01 Build contract test suite from OpenAPI.
- [ ] I-02 Build migration regression test suite.
- [ ] I-03 Build role/permission integration tests.
- [ ] I-04 Build core E2E tests (create -> dispatch -> delivery -> followup -> finance sync).
- [ ] I-05 Define Go/No-Go gate checklist for release.
- [ ] I-06 Add resilience tests (weak network, duplicate submits, conflict merge, offline replay).

Deliverables:

1. Test spec matrix with owner and execution frequency.
2. Release checklist and evidence.

Acceptance:

1. All P0 test suites are green before release.
2. Go/No-Go checklist fully signed.

## 11. Milestones and Timeline (Recommended)

1. Milestone 1 (implicit migration, 4-6 weeks):
   - Complete Phase A + B + C + D + E + H (backend/data/ops readiness)
   - Keep legacy client behavior compatible via adapter layer
   - Run dual-write + reconciliation + shadow verification
2. Milestone 2 (full client cutover, 2-4 weeks):
   - Complete Phase F + G + I
   - Switch Mini Program/Admin to incremental sync + conflict UX
   - Perform production cutover and rollback drill

## 12. RACI (Suggested)

1. Product owner:
   - Owns scope, acceptance, release decision
2. Tech lead:
   - Owns architecture/data/API specs and risk decisions
3. Backend engineer:
   - Owns repository/API/migration implementation
4. Frontend engineer:
   - Owns mini program/admin console sync and UX updates
5. QA:
   - Owns contract/e2e validation and release evidence
6. Ops:
   - Owns monitoring, alerting, rollback operations

## 13. Definition of Done (Strict)

1. Related spec is `APPROVED`.
2. API/data/test docs updated in same change set.
3. Contract and integration tests pass.
4. Migration/reconciliation evidence attached (if data impacted).
5. Security and audit requirements validated.
6. Rollback path documented and tested.

## 14. Immediate Next Actions

1. Create `specs/` baseline folders and templates.
2. Freeze OpenAPI for current implemented endpoints.
3. Freeze DB schema and runtime repository mapping strategy.
4. Run migration dry-run and generate first reconciliation report.
5. Plan first implementation PR as `SPEC-001 DB SSOT foundation`.
