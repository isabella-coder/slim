# Merge Migration Checklist (2026-03-11)

## Goal
Unify into single mainline repository at `car-film-mini-program` while preserving root backup branch history.

## Source of Truth
- Root backup branch: `origin/backup/ylx-root-20260311`
- Target mainline: `car-film-mini-program/main`

## P0 (today)
- Migrate unified 8000 store bridge backend files into `backend/` under target repo.
- Sync key mini-program bridge files with direct path mapping where possible.
- Keep changes isolated in branch: `migration/p0-root-backend-bridge`.

### P0 file mapping
- `root/backend/.env.example` -> `car-film-mini-program/backend/.env.example`
- `root/backend/README.md` -> `car-film-mini-program/backend/README.md`
- `root/backend/app/api/store.py` -> `car-film-mini-program/backend/app/api/store.py`
- `root/backend/app/services/store_service.py` -> `car-film-mini-program/backend/app/services/store_service.py`
- `root/backend/app/config.py` -> `car-film-mini-program/backend/app/config.py`
- `root/backend/app/db/__init__.py` -> `car-film-mini-program/backend/app/db/__init__.py`
- `root/backend/app/db/init_data.py` -> `car-film-mini-program/backend/app/db/init_data.py`
- `root/backend/app/main.py` -> `car-film-mini-program/backend/app/main.py`
- `root/backend/app/models/__init__.py` -> `car-film-mini-program/backend/app/models/__init__.py`
- `root/miniprogram/pages/douyin-leads/douyin-leads.js` -> `car-film-mini-program/pages/douyin-leads/douyin-leads.js`
- `root/miniprogram/pages/login/login.wxml` -> `car-film-mini-program/pages/login/login.wxml`

## P1 (next)
- Resolve module path differences for `miniprogram/utils/adapters/store-api.js`.
- Normalize docs across root and target repo.
- Add migration tests for auth/order/internal sync.

## P2 (final)
- Decide and finalize legacy 8080 policy (read-only legacy vs full decommission).
- Release checklist sign-off and production cutover notes.
