# SPEC-001: DB SSOT Foundation

## 1. Metadata

- Spec ID: `SPEC-001`
- Owner: Backend Lead
- Reviewers: Frontend Lead, Product Owner
- Status: `DRAFT`
- Created: 2026-03-08
- Target Milestone: Milestone 1 (implicit migration)

## 2. Problem Statement

The system currently relies on local JSON and full-list merge sync. This creates overwrite risks, weak consistency guarantees, and fragile migration behavior. We need PostgreSQL as single source of truth with contract-driven incremental sync.

## 3. Scope

### In Scope

1. Freeze normalized PostgreSQL schema and repository mapping.
2. Introduce dual-write transition mode (DB primary + JSON snapshot compatibility).
3. Provide migration and reconciliation execution baseline.
4. Define API contract constraints required by DB SSOT (`version`, conflict model, idempotency baseline).
5. Define attachment/media metadata model with object storage integration boundary.

### Out of Scope

1. Full Mini Program conflict-resolution UI implementation.
2. Full production observability stack implementation.
3. Finance system deep integration redesign.

## 4. Requirements

### Functional Requirements

1. All order writes in SSOT mode must persist in PostgreSQL normalized tables.
2. Every mutable order update must include `version`; mismatch returns `409 ORDER_VERSION_CONFLICT`.
3. Transition mode must support dual-write with reconciliation.
4. Migration scripts must support:
   - `--dry-run`
   - `--limit`
   - `--since`
5. Attachments must be represented as metadata records in DB; binary data must not be stored in PostgreSQL.

### Non-Functional Requirements

1. P95 read latency < 300ms for hot order read endpoints in staging.
2. P95 write latency < 500ms for order update endpoints in staging.
3. Reconciliation discrepancy targets:
   - count diff = 0
   - amount diff = 0
   - sampled record accuracy = 100%

## 5. Data Contract Baseline

## 5.1 Core Tables

1. `users`
2. `orders`
3. `order_dispatches`
4. `order_work_parts`
5. `followups`
6. `finance_sync_logs`
7. `audit_logs`
8. `attachments` (to be added in migration)

## 5.2 Attachment Metadata Contract

- `attachment_id` (pk)
- `order_id` (fk)
- `kind` (`construction_photo`, `payment_proof`, `vin_photo`, ...)
- `object_key`
- `cdn_url`
- `mime_type`
- `size_bytes`
- `uploaded_by`
- `created_at`

## 6. API Contract Constraints

1. `PATCH /api/v1/orders/{id}`:
   - must require `version`
   - returns `409 ORDER_VERSION_CONFLICT` with `currentVersion`
2. `PUT /api/orders/{id}`:
   - same optimistic lock semantics as patch endpoint
3. Side-effecting POST endpoints must support `Idempotency-Key` in Milestone 1 scope definition.

## 7. Migration and Rollout Strategy

1. Phase 1: Schema freeze + repository mapping validation.
2. Phase 2: Full migration dry-run and reconciliation report.
3. Phase 3: Dual-write shadow period with hourly reconciliation.
4. Phase 4: JSON freeze as readonly snapshot.
5. Phase 5: Cutover with rollback checkpoint.

## 8. Risks and Mitigations

1. Risk: data drift during dual-write.
   - Mitigation: hourly reconciliation + alerting + stop-the-line threshold.
2. Risk: conflict spikes after version enforcement.
   - Mitigation: client-side draft preservation and explicit refresh-retry flow.
3. Risk: migration script data quality edge cases.
   - Mitigation: precheck script and staged rehearsal with sampled diffs.

## 9. Acceptance Criteria

- [ ] Schema and field dictionary approved.
- [ ] Migration dry-run report generated.
- [ ] Incremental migration rehearsal report generated.
- [ ] Reconciliation script reports zero diff on staging baseline.
- [ ] Dual-write transition runbook approved.
- [ ] API contracts for optimistic locking aligned and reviewed.

## 10. Evidence Required

1. SQL schema review record.
2. Migration execution report.
3. Reconciliation output artifact.
4. API contract test report.
5. Cutover and rollback checklist draft.
