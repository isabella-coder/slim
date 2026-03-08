# Specs Workspace

This directory is the source of truth for spec-driven delivery in this repository.

## Structure

- `00-governance/`: process, templates, approval flow
- `01-domain/`: domain model and business invariants
- `02-api/`: API contracts and error models
- `03-data/`: schema, migration, reconciliation
- `04-test/`: test strategy and executable acceptance
- `05-release/`: rollout, go/no-go, rollback

## Status Model

- `DRAFT`
- `IN_REVIEW`
- `APPROVED`
- `IMPLEMENTED`
- `VERIFIED`

## Merge Gate

No feature implementation should merge without an `APPROVED` spec and linked acceptance checklist.
