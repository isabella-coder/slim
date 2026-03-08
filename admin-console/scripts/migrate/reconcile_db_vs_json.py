#!/usr/bin/env python3
"""Reconcile DB data against JSON source after migration.

Usage:
  python3 reconcile_db_vs_json.py --dsn postgresql://... [--since "2026-03-01 00:00"] [--limit 0]
  python3 reconcile_db_vs_json.py --dsn postgresql://... --sample-size 200 --fail-on-diff
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
ORDERS_FILE = ROOT / "data" / "orders.json"
LOG_FILE = ROOT / "data" / "finance-sync-log.json"

SAMPLE_KEYS = [
    "status",
    "customerName",
    "phone",
    "carModel",
    "plateNumber",
    "salesBrandText",
    "serviceType",
    "appointmentDate",
    "appointmentTime",
]


def text(value):
    return str(value or "").strip()


def parse_dt(value):
    source = text(value)
    if not source:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d"):
        try:
            return datetime.strptime(source, fmt)
        except ValueError:
            continue
    return None


def parse_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def load_json_list(path):
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    return []


def filter_items(items, limit, since, ts_keys):
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if since:
            dt = None
            for key in ts_keys:
                dt = parse_dt(item.get(key))
                if dt:
                    break
            if not dt or dt < since:
                continue
        result.append(item)
    if limit > 0:
        return result[:limit]
    return result


def sum_order_total(orders):
    total = 0.0
    for order in orders:
        summary = order.get("priceSummary") if isinstance(order.get("priceSummary"), dict) else {}
        total += parse_float(summary.get("totalPrice"))
    return round(total, 2)


def json_dataset(limit, since):
    users = filter_items(load_json_list(USERS_FILE), limit, since, ["updatedAt", "createdAt"])
    orders = filter_items(load_json_list(ORDERS_FILE), limit, since, ["updatedAt", "createdAt"])
    logs = filter_items(load_json_list(LOG_FILE), limit, since, ["receivedAt", "createdAt"])

    user_map = {text(item.get("username")): item for item in users if text(item.get("username"))}
    order_map = {text(item.get("id")): item for item in orders if text(item.get("id"))}
    log_map = {text(item.get("id")): item for item in logs if text(item.get("id"))}

    return {
        "users": users,
        "orders": orders,
        "logs": logs,
        "user_map": user_map,
        "order_map": order_map,
        "log_map": log_map,
    }


def fetch_db_scalar(cur, sql, params=None):
    cur.execute(sql, params or ())
    row = cur.fetchone()
    return row[0] if row else 0


def db_summary(conn, json_data, since):
    user_ids = sorted(json_data["user_map"].keys())
    order_ids = sorted(json_data["order_map"].keys())
    log_ids = sorted(json_data["log_map"].keys())

    with conn.cursor() as cur:
        if user_ids:
            users_count = fetch_db_scalar(cur, "SELECT COUNT(*) FROM users WHERE username = ANY(%s)", (user_ids,))
        else:
            users_count = 0

        if order_ids:
            if since:
                orders_count = fetch_db_scalar(
                    cur,
                    "SELECT COUNT(*) FROM orders WHERE order_id = ANY(%s) AND updated_at >= %s",
                    (order_ids, since),
                )
                orders_sum = fetch_db_scalar(
                    cur,
                    "SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE order_id = ANY(%s) AND updated_at >= %s",
                    (order_ids, since),
                )
            else:
                orders_count = fetch_db_scalar(cur, "SELECT COUNT(*) FROM orders WHERE order_id = ANY(%s)", (order_ids,))
                orders_sum = fetch_db_scalar(
                    cur,
                    "SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE order_id = ANY(%s)",
                    (order_ids,),
                )
        else:
            orders_count = 0
            orders_sum = 0

        if log_ids:
            if since:
                logs_count = fetch_db_scalar(
                    cur,
                    "SELECT COUNT(*) FROM finance_sync_logs WHERE log_id = ANY(%s) AND created_at >= %s",
                    (log_ids, since),
                )
            else:
                logs_count = fetch_db_scalar(
                    cur,
                    "SELECT COUNT(*) FROM finance_sync_logs WHERE log_id = ANY(%s)",
                    (log_ids,),
                )
        else:
            logs_count = 0

    return {
        "users_count": int(users_count or 0),
        "orders_count": int(orders_count or 0),
        "orders_total_price": round(float(orders_sum or 0), 2),
        "logs_count": int(logs_count or 0),
    }


def sample_diff(conn, json_orders, sample_size):
    order_ids = sorted([order_id for order_id in json_orders.keys() if order_id])
    sample_ids = order_ids[: max(0, sample_size)]
    diffs = []

    with conn.cursor() as cur:
        for order_id in sample_ids:
            cur.execute("SELECT payload FROM orders WHERE order_id = %s", (order_id,))
            row = cur.fetchone()
            if not row or not isinstance(row[0], dict):
                diffs.append({"orderId": order_id, "issue": "MISSING_IN_DB"})
                continue

            db_payload = row[0]
            src_payload = json_orders[order_id]
            field_diffs = []
            for key in SAMPLE_KEYS:
                db_value = text(db_payload.get(key))
                src_value = text(src_payload.get(key))
                if db_value != src_value:
                    field_diffs.append({"field": key, "json": src_value, "db": db_value})

            if field_diffs:
                diffs.append({"orderId": order_id, "issue": "FIELD_DIFF", "fields": field_diffs})

    return {
        "sampleSize": len(sample_ids),
        "diffCount": len(diffs),
        "items": diffs,
    }


def build_report(json_data, db_data, sample_data, args):
    json_users_count = len(json_data["user_map"])
    json_orders_count = len(json_data["order_map"])
    json_logs_count = len(json_data["log_map"])
    json_orders_sum = sum_order_total(list(json_data["order_map"].values()))

    return {
        "meta": {
            "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "since": args.since,
            "limit": args.limit,
            "sampleSize": args.sample_size,
        },
        "json": {
            "users_count": json_users_count,
            "orders_count": json_orders_count,
            "orders_total_price": json_orders_sum,
            "logs_count": json_logs_count,
        },
        "db": db_data,
        "diff": {
            "users_count": db_data["users_count"] - json_users_count,
            "orders_count": db_data["orders_count"] - json_orders_count,
            "orders_total_price": round(db_data["orders_total_price"] - json_orders_sum, 2),
            "logs_count": db_data["logs_count"] - json_logs_count,
            "sample_diff_count": sample_data["diffCount"],
        },
        "sample": sample_data,
    }


def has_blocking_diff(report):
    diff = report["diff"]
    return any(
        [
            diff["users_count"] != 0,
            diff["orders_count"] != 0,
            abs(diff["orders_total_price"]) > 0,
            diff["logs_count"] != 0,
            diff["sample_diff_count"] != 0,
        ]
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", default="")
    parser.add_argument("--since", default="")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--sample-size", type=int, default=200)
    parser.add_argument("--output", default="")
    parser.add_argument("--fail-on-diff", action="store_true")
    args = parser.parse_args()

    if psycopg is None:
        raise RuntimeError("psycopg is required")
    if not args.dsn:
        raise RuntimeError("--dsn is required")

    since = parse_dt(args.since)
    json_data = json_dataset(args.limit, since)

    with psycopg.connect(args.dsn, autocommit=True) as conn:
        db_data = db_summary(conn, json_data, since)
        sample_data = sample_diff(conn, json_data["order_map"], args.sample_size)

    report = build_report(json_data, db_data, sample_data, args)
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"saved report -> {output_path}")

    if args.fail_on_diff and has_blocking_diff(report):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
