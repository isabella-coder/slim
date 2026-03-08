#!/usr/bin/env python3
"""Precheck source JSON data quality before migration.

Usage:
  python3 precheck_source_data.py [--limit 0] [--since "2026-03-01 00:00"] [--output /tmp/precheck.json]
"""

import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
USERS_FILE = ROOT / "data" / "users.json"
ORDERS_FILE = ROOT / "data" / "orders.json"
LOG_FILE = ROOT / "data" / "finance-sync-log.json"

VALID_ORDER_STATUS = {"未完工", "已完工", "已取消", "待确认", "已确认"}
VALID_USER_ROLE = {"manager", "sales", "technician", "finance"}


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
        return None


def load_json_list(path):
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    return []


def apply_limit_and_since(items, limit, since, ts_keys):
    filtered = []
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
        filtered.append(item)
    if limit > 0:
        return filtered[:limit]
    return filtered


def check_users(users):
    issues = []
    usernames = []
    for idx, user in enumerate(users):
        username = text(user.get("username"))
        role = text(user.get("role")).lower()
        if not username:
            issues.append({"level": "error", "code": "USER_MISSING_USERNAME", "index": idx})
        else:
            usernames.append(username)
        if role and role not in VALID_USER_ROLE:
            issues.append(
                {
                    "level": "warn",
                    "code": "USER_INVALID_ROLE",
                    "index": idx,
                    "value": role,
                }
            )

    dup = [name for name, cnt in Counter(usernames).items() if cnt > 1]
    for name in dup:
        issues.append({"level": "error", "code": "USER_DUPLICATE_USERNAME", "username": name})

    return issues


def check_orders(orders):
    issues = []
    ids = []
    for idx, order in enumerate(orders):
        order_id = text(order.get("id"))
        status = text(order.get("status"))
        if not order_id:
            issues.append({"level": "error", "code": "ORDER_MISSING_ID", "index": idx})
        else:
            ids.append(order_id)

        if status and status not in VALID_ORDER_STATUS:
            issues.append(
                {
                    "level": "warn",
                    "code": "ORDER_UNKNOWN_STATUS",
                    "index": idx,
                    "value": status,
                }
            )

        if text(order.get("createdAt")) and not parse_dt(order.get("createdAt")):
            issues.append({"level": "warn", "code": "ORDER_INVALID_CREATED_AT", "index": idx})
        if text(order.get("updatedAt")) and not parse_dt(order.get("updatedAt")):
            issues.append({"level": "warn", "code": "ORDER_INVALID_UPDATED_AT", "index": idx})

        version = order.get("version")
        if version is not None:
            try:
                if int(version) < 0:
                    issues.append({"level": "warn", "code": "ORDER_NEGATIVE_VERSION", "index": idx})
            except (TypeError, ValueError):
                issues.append({"level": "warn", "code": "ORDER_INVALID_VERSION", "index": idx})

        summary = order.get("priceSummary") if isinstance(order.get("priceSummary"), dict) else {}
        total_price = summary.get("totalPrice")
        if total_price is not None and parse_float(total_price) is None:
            issues.append({"level": "warn", "code": "ORDER_INVALID_TOTAL_PRICE", "index": idx})

    dup = [order_id for order_id, cnt in Counter(ids).items() if cnt > 1]
    for order_id in dup:
        issues.append({"level": "error", "code": "ORDER_DUPLICATE_ID", "orderId": order_id})

    return issues


def check_logs(logs):
    issues = []
    ids = []
    for idx, item in enumerate(logs):
        log_id = text(item.get("id"))
        order_id = text(item.get("orderId"))
        received_at = item.get("receivedAt")

        if not log_id:
            issues.append({"level": "error", "code": "LOG_MISSING_ID", "index": idx})
        else:
            ids.append(log_id)

        if not order_id:
            issues.append({"level": "warn", "code": "LOG_MISSING_ORDER_ID", "index": idx})

        if text(received_at) and not parse_dt(received_at):
            issues.append({"level": "warn", "code": "LOG_INVALID_RECEIVED_AT", "index": idx})

    dup = [log_id for log_id, cnt in Counter(ids).items() if cnt > 1]
    for log_id in dup:
        issues.append({"level": "error", "code": "LOG_DUPLICATE_ID", "logId": log_id})

    return issues


def summarize_issues(issues):
    counts = Counter(item.get("level", "unknown") for item in issues)
    return {
        "total": len(issues),
        "error": counts.get("error", 0),
        "warn": counts.get("warn", 0),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--since", default="")
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    since = parse_dt(args.since)

    users = apply_limit_and_since(load_json_list(USERS_FILE), args.limit, since, ["updatedAt", "createdAt"])
    orders = apply_limit_and_since(load_json_list(ORDERS_FILE), args.limit, since, ["updatedAt", "createdAt"])
    logs = apply_limit_and_since(load_json_list(LOG_FILE), args.limit, since, ["receivedAt", "createdAt"])

    user_issues = check_users(users)
    order_issues = check_orders(orders)
    log_issues = check_logs(logs)

    report = {
        "meta": {
            "limit": args.limit,
            "since": args.since,
            "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
        "dataset": {
            "users": len(users),
            "orders": len(orders),
            "financeLogs": len(logs),
        },
        "summary": {
            "users": summarize_issues(user_issues),
            "orders": summarize_issues(order_issues),
            "financeLogs": summarize_issues(log_issues),
            "all": summarize_issues(user_issues + order_issues + log_issues),
        },
        "issues": {
            "users": user_issues,
            "orders": order_issues,
            "financeLogs": log_issues,
        },
    }

    print(json.dumps(report, ensure_ascii=False, indent=2))

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"saved report -> {output_path}")

    if report["summary"]["all"]["error"] > 0:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
