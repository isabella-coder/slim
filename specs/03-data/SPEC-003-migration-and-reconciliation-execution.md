# SPEC-003: Migration and Reconciliation Execution

## 1. Metadata

- Spec ID: `SPEC-003`
- Owner: Backend Lead
- Reviewers: QA Lead, Ops Lead
- Status: `DRAFT`
- Created: 2026-03-08
- Target Milestone: Milestone 1

## 2. Problem Statement

Migration scripts exist, but execution safety is not fully standardized. We need a repeatable process with precheck, migration rehearsal, reconciliation thresholds, and stop-the-line rules.

## 3. Scope

### In Scope

1. Source data precheck before any non-dry-run migration.
2. Full and incremental migration rehearsal process.
3. DB-vs-JSON reconciliation process and pass/fail thresholds.
4. Cutover go/no-go data gates and rollback triggers.

### Out of Scope

1. Full release process outside data migration.
2. Large-scale performance benchmark framework.

## 4. Required Scripts

1. `admin-console/scripts/migrate/precheck_source_data.py`
2. `admin-console/scripts/migrate/reconcile_db_vs_json.py`
3. Existing migration scripts:
   - `migrate_users.py`
   - `migrate_orders.py`
   - `migrate_finance_logs.py`

## 5. Execution Workflow

### Step A: Source Precheck

1. Run precheck in dry mode:
   - `python3 scripts/migrate/precheck_source_data.py --limit 0`
2. Validate blocking issues:
   - missing primary ids
   - duplicate primary ids
3. Validate warning issues:
   - invalid datetime format
   - invalid numeric fields

### Step B: Full Migration Rehearsal

1. Apply schema to target DB.
2. Run three migration scripts in sequence with `--dry-run`.
3. Run non-dry-run migration using a staging DSN.

### Step C: Incremental Rehearsal

1. Pick a fixed `--since` time.
2. Re-run migration scripts with `--since`.
3. Validate changed subsets only.

### Step D: Reconciliation

1. Run count and amount reconciliation:
   - users/orders/finance logs count
   - order total amount sum
2. Run sampled field-diff reconciliation.
3. Produce a saved report artifact (`json`).

## 6. Stop-the-Line Criteria

1. Any duplicate/missing primary id in source precheck.
2. Any count mismatch after migration.
3. Any amount mismatch beyond tolerance.
4. Sample diff mismatch rate > 0% for required fields.

## 7. Acceptance Thresholds

- [ ] users count diff = 0
- [ ] orders count diff = 0
- [ ] finance logs count diff = 0
- [ ] order total amount diff = 0.00
- [ ] sampled required-field diff count = 0

## 8. Report Artifacts

1. Precheck report JSON.
2. Full migration execution log.
3. Incremental migration execution log.
4. Reconciliation report JSON.
5. Go/No-Go data gate checklist.

## 9. Rollback Trigger and Action

### Trigger

1. Critical reconciliation mismatch.
2. Runtime DB write anomalies detected post-cutover.

### Action

1. Stop write traffic.
2. Restore from DB backup/snapshot checkpoint.
3. Re-enable previous stable mode based on release runbook.
4. File incident and root-cause report before retry.
