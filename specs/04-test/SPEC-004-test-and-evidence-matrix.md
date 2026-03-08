# SPEC-004: Test and Evidence Matrix

## 1. Metadata

- Spec ID: `SPEC-004`
- Owner: QA Lead
- Reviewers: Backend Lead, Frontend Lead, Ops Lead
- Status: `DRAFT`
- Created: 2026-03-08
- Target Milestone: Milestone 1 and Milestone 2

## 2. Problem Statement

Spec-driven delivery requires objective and repeatable evidence. Current repository has baseline specs, but test ownership, execution frequency, and release evidence mapping are not yet fully explicit.

## 3. Scope

### In Scope

1. Define mandatory test layers and owners.
2. Define pass/fail gates per milestone.
3. Define required evidence artifacts for status progression to `VERIFIED`.

### Out of Scope

1. Full CI pipeline implementation.
2. Non-critical exploratory testing processes.

## 4. Test Matrix

| Test Layer | Target | Owner | Frequency | Gate |
|---|---|---|---|---|
| Data precheck | JSON source quality | Backend | Before each migration run | M1 mandatory |
| Migration dry-run | Users/Orders/Logs scripts | Backend | Every schema/data change | M1 mandatory |
| Reconciliation | DB vs JSON count/amount/sample diff | Backend + QA | Every migration rehearsal | M1 mandatory |
| API contract tests | `openapi-v1.yaml` critical endpoints | QA | Every backend API change | M1 mandatory |
| Auth/permission integration | manager/sales/tech/finance scopes | QA | Every auth/permission change | M1 mandatory |
| Conflict handling tests | `409 ORDER_VERSION_CONFLICT` flows | QA + Frontend | Every order-write change | M2 mandatory |
| Weak-network resilience | retry/offline queue/replay | QA + Frontend | Every sync logic change | M2 mandatory |
| Core E2E flow | create->dispatch->delivery->followup->finance sync | QA | Each release candidate | M1+M2 mandatory |
| Rollback rehearsal | DB restore and cutover reversal | Ops | Before production cutover | M2 mandatory |

## 5. Milestone Gates

## 5.1 Milestone 1 (implicit migration)

Must pass:

- [ ] Data precheck has zero blocking errors.
- [ ] Full migration dry-run is green.
- [ ] Reconciliation meets thresholds:
  - [ ] users count diff = 0
  - [ ] orders count diff = 0
  - [ ] finance logs count diff = 0
  - [ ] order amount diff = 0.00
  - [ ] sample diff count = 0
- [ ] OpenAPI baseline is reviewed and approved.
- [ ] Contract tests for critical endpoints are green.

## 5.2 Milestone 2 (full client cutover)

Must pass all Milestone 1 gates plus:

- [ ] Conflict UX preserves user draft and supports merge/retry.
- [ ] Weak-network/offline replay tests are green.
- [ ] Production rollback drill completes within target time.

## 6. Evidence Artifact Rules

1. Each run must produce timestamped artifacts under `reports/` (or CI artifact store).
2. Required artifact naming convention:
   - `precheck-YYYYMMDD-HHMMSS.json`
   - `reconcile-YYYYMMDD-HHMMSS.json`
   - `contract-test-YYYYMMDD-HHMMSS.xml|json`
   - `e2e-YYYYMMDD-HHMMSS.json`
3. Every Go/No-Go decision must link artifact files directly.

## 7. Status Progression Rule

1. `DRAFT -> IN_REVIEW`: matrix and owners defined.
2. `IN_REVIEW -> APPROVED`: gate criteria signed by QA + Tech Lead.
3. `APPROVED -> IMPLEMENTED`: test hooks/scripts available.
4. `IMPLEMENTED -> VERIFIED`: latest release candidate has complete evidence set.

## 8. Open Risks

1. Risk: flaky network-dependent tests.
   - Mitigation: separate deterministic contract tests from network chaos tests.
2. Risk: missing artifact discipline.
   - Mitigation: enforce artifact path checks in release checklist.
