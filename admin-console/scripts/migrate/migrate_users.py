#!/usr/bin/env python3
"""Migrate admin-console/data/users.json into PostgreSQL users table.

Usage:
  python3 migrate_users.py --dsn postgresql://... [--dry-run] [--limit 100] [--since "2026-03-01 00:00"]
"""

import argparse
import json
from datetime import datetime
from pathlib import Path

try:
    import psycopg
except Exception:
    psycopg = None

ROOT = Path(__file__).resolve().parents[2]
USERS_FILE = ROOT / "data" / "users.json"


def parse_dt(value):
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def load_users(limit=0, since=None):
    data = json.loads(USERS_FILE.read_text(encoding="utf-8")) if USERS_FILE.exists() else []
    users = [u for u in data if isinstance(u, dict)]
    if since:
        users = [u for u in users if (parse_dt(u.get("updatedAt")) or datetime.min) >= since]
    if limit > 0:
        users = users[:limit]
    return users


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--since", default="")
    args = parser.parse_args()

    since = parse_dt(args.since)
    users = load_users(limit=args.limit, since=since)
    print(f"loaded users={len(users)} dry_run={args.dry_run}")

    if args.dry_run:
        return
    if psycopg is None:
        raise RuntimeError("psycopg is required for non-dry-run migration")
    if not args.dsn:
        raise RuntimeError("--dsn is required for non-dry-run migration")

    with psycopg.connect(args.dsn, autocommit=False) as conn:
        with conn.cursor() as cur:
            for u in users:
                username = str(u.get("username") or "").strip()
                if not username:
                    continue
                updated_at = parse_dt(u.get("updatedAt")) or datetime.now()
                cur.execute(
                    """
                    INSERT INTO users (username, name, role, payload, updated_at)
                    VALUES (%s, %s, %s, %s::jsonb, %s)
                    ON CONFLICT (username)
                    DO UPDATE SET
                      name = EXCLUDED.name,
                      role = EXCLUDED.role,
                      payload = EXCLUDED.payload,
                      updated_at = EXCLUDED.updated_at
                    """,
                    (
                        username,
                        str(u.get("name") or "").strip(),
                        str(u.get("role") or "sales").strip().lower() or "sales",
                        json.dumps(u, ensure_ascii=False),
                        updated_at,
                    ),
                )
        conn.commit()
    print("migrate_users done")


if __name__ == "__main__":
    main()
