# CHANGELOG

## 2026-03-08

- Initialized data spec workspace.
- Added `SPEC-001` DB SSOT foundation spec.
- Added `SPEC-003` migration and reconciliation execution spec.
- Added migration utility scripts:
  - `precheck_source_data.py`
  - `reconcile_db_vs_json.py`
  - `run_migration_gate.sh`
- Added SQL migration:
  - `admin-console/sql/migrations/20260308_add_attachments.sql`
