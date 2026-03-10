# SPEC-002: API Contract Baseline Freeze

## 1. Metadata

- Spec ID: `SPEC-002`
- Owner: Backend Lead
- Reviewers: Frontend Lead, QA Lead
- Status: `DRAFT`
- Created: 2026-03-08
- Target Milestone: Milestone 1

## 2. Problem Statement

Current API behavior is defined by implementation only (`admin-console/server.py`). Without a frozen contract, frontend integration and regression testing are unstable.

## 3. Scope

### In Scope

1. Freeze the currently implemented critical APIs into OpenAPI.
2. Standardize auth and error semantics for these critical APIs.
3. Define optimistic locking contract (`version`, `409 ORDER_VERSION_CONFLICT`).
4. Define legacy internal full-sync API as compatibility-only contract.

### Out of Scope

1. Full coverage of every admin endpoint in this first freeze.
2. Breaking API redesign for V2.
3. Automatic OpenAPI generation from code.

## 4. Contract Artifact

- OpenAPI baseline file: `specs/02-api/openapi-v1.yaml`

Covered endpoint groups:

1. Health: `/health`
2. Internal sync:
   - `/api/v1/store/internal/orders`
   - `/api/v1/store/internal/orders/sync`
   - `/api/v1/store/internal/work-orders/sync`
3. Incremental order sync:
   - `GET /api/v1/orders`
   - `PATCH /api/v1/orders/{orderId}`
4. Admin auth and update:
   - `POST /api/v1/store/login`
   - `GET /api/v1/store/me`
   - `POST /api/v1/store/logout`
   - `PUT /api/orders/{orderId}`

## 5. Requirements

### Functional Requirements

1. Contract file must be the single reference for frontend/backend alignment.
2. `PATCH /api/v1/orders/{orderId}` and `PUT /api/orders/{orderId}` require `version`.
3. Conflict responses must carry `currentVersion`.
4. Internal endpoints require `INTERNAL_API_TOKEN` auth semantics.

### Non-Functional Requirements

1. Contract updates must be versioned and reviewable.
2. Contract test cases must be mapped from this OpenAPI baseline.

## 6. Risks and Mitigations

1. Risk: Contract drift from implementation.
   - Mitigation: PR check requiring OpenAPI update when endpoint behavior changes.
2. Risk: Mixed response styles (`ok` vs `success`) increase client complexity.
   - Mitigation: Keep as-is for compatibility in v1 baseline, unify in a later versioned API plan.

## 7. Acceptance Criteria

- [ ] OpenAPI baseline exists and is reviewed.
- [ ] Critical endpoints listed in this spec are represented.
- [ ] Conflict and auth failure responses are documented.
- [ ] QA has a contract-test extraction checklist linked to this spec.

## 8. Evidence Required

1. Link to reviewed OpenAPI file.
2. Endpoint-to-test-case mapping sheet.
3. Follow-up issue list for v2 contract cleanup (`ok/success` unification, idempotency expansion).
