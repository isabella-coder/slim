#!/usr/bin/env python3
"""Migrate admin-console/data/finance-sync-log.json into finance_sync_logs.

Usage:
  python3 migrate_finance_logs.py --dsn postgresql://... [--dry-run] [--limit 100] [--since "2026-03-01 00:00"]
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
LOG_FILE = ROOT / "data" / "finance-sync-log.json"


def text(v):
    return str(v or "").strip()


def parse_dt(value):
    src = text(value)
    if not src:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d"):
        try:
            return datetime.strptime(src, fmt)
        except ValueError:
            continue
    return None


def load_logs(limit=0, since=None):
    data = json.loads(LOG_FILE.read_text(encoding="utf-8")) if LOG_FILE.exists() else []
    logs = [x for x in data if isinstance(x, dict)]
    if since:
        logs = [x for x in logs if (parse_dt(x.get("receivedAt")) or datetime.min) >= since]
    if limit > 0:
        logs = logs[:limit]
    return logs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--since", default="")
    args = parser.parse_args()

    since = parse_dt(args.since)
    logs = load_logs(limit=args.limit, since=since)
    print(f"loaded finance_logs={len(logs)} dry_run={args.dry_run}")

    if args.dry_run:
        return
    if psycopg is None:
        raise RuntimeError("psycopg is required for non-dry-run migration")
    if not args.dsn:
        raise RuntimeError("--dsn is required for non-dry-run migration")

    with psycopg.connect(args.dsn, autocommit=False) as conn:
        with conn.cursor() as cur:
            for item in logs:
                log_id = text(item.get("id"))
                if not log_id:
                    continue
                created_at = parse_dt(item.get("receivedAt")) or datetime.now()
                cur.execute(
                    """
                    INSERT INTO finance_sync_logs (
                      log_id, order_id, event_type, service_type, result,
                      request_payload, response_payload, retry_count, payload, created_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s::jsonb, %s, %s)
                    ON CONFLICT (log_id)
                    DO UPDATE SET
                      order_id = EXCLUDED.order_id,
                      event_type = EXCLUDED.event_type,
                      service_type = EXCLUDED.service_type,
                      result = EXCLUDED.result,
                      request_payload = EXCLUDED.request_payload,
                      response_payload = EXCLUDED.response_payload,
                      retry_count = EXCLUDED.retry_count,
                      payload = EXCLUDED.payload,
                      updated_at = EXCLUDED.updated_at
                    """,
                    (
                        log_id,
                        text(item.get("orderId")),
                        text(item.get("eventType")),
                        text(item.get("serviceType")),
                        text(item.get("result")) or "SUCCESS",
                        json.dumps(item.get("payload") if isinstance(item.get("payload"), dict) else {}, ensure_ascii=False),
                        json.dumps({}, ensure_ascii=False),
                        int(item.get("retryCount") or 0),
                        json.dumps(item, ensure_ascii=False),
                        created_at,
                        created_at,
                    ),
                )
        conn.commit()

    print("migrate_finance_logs done")


if __name__ == "__main__":
    main()
