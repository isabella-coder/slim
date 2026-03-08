#!/usr/bin/env python3
"""Migrate admin-console/data/orders.json into orders and child tables.

Usage:
  python3 migrate_orders.py --dsn postgresql://... [--dry-run] [--limit 100] [--since "2026-03-01 00:00"]
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
ORDERS_FILE = ROOT / "data" / "orders.json"


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


def parse_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def load_orders(limit=0, since=None):
    data = json.loads(ORDERS_FILE.read_text(encoding="utf-8")) if ORDERS_FILE.exists() else []
    items = [x for x in data if isinstance(x, dict)]
    if since:
        items = [x for x in items if (parse_dt(x.get("updatedAt")) or parse_dt(x.get("createdAt")) or datetime.min) >= since]
    if limit > 0:
        items = items[:limit]
    return items


def normalize_version(value):
    try:
        num = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, num)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--since", default="")
    args = parser.parse_args()

    since = parse_dt(args.since)
    orders = load_orders(limit=args.limit, since=since)
    print(f"loaded orders={len(orders)} dry_run={args.dry_run}")

    if args.dry_run:
        return
    if psycopg is None:
        raise RuntimeError("psycopg is required for non-dry-run migration")
    if not args.dsn:
        raise RuntimeError("--dsn is required for non-dry-run migration")

    with psycopg.connect(args.dsn, autocommit=False) as conn:
        with conn.cursor() as cur:
            for o in orders:
                order_id = text(o.get("id"))
                if not order_id:
                    continue
                created_at = parse_dt(o.get("createdAt")) or datetime.now()
                updated_at = parse_dt(o.get("updatedAt")) or created_at
                appointment_date = text(o.get("appointmentDate"))
                appointment_time = text(o.get("appointmentTime"))
                appointment_dt = parse_dt(f"{appointment_date} {appointment_time}") if appointment_date and appointment_time else parse_dt(appointment_date)
                total_price = parse_float((o.get("priceSummary") or {}).get("totalPrice") if isinstance(o.get("priceSummary"), dict) else 0)

                cur.execute(
                    """
                    INSERT INTO orders (
                      order_id, service_type, status, customer_name, phone, plate_number, car_model,
                      sales_owner, appointment_time, total_price, version, payload, created_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                    ON CONFLICT (order_id)
                    DO UPDATE SET
                      service_type = EXCLUDED.service_type,
                      status = EXCLUDED.status,
                      customer_name = EXCLUDED.customer_name,
                      phone = EXCLUDED.phone,
                      plate_number = EXCLUDED.plate_number,
                      car_model = EXCLUDED.car_model,
                      sales_owner = EXCLUDED.sales_owner,
                      appointment_time = EXCLUDED.appointment_time,
                      total_price = EXCLUDED.total_price,
                      version = EXCLUDED.version,
                      payload = EXCLUDED.payload,
                      updated_at = EXCLUDED.updated_at
                    """,
                    (
                        order_id,
                        text(o.get("serviceType")) or "FILM",
                        text(o.get("status")) or "未完工",
                        text(o.get("customerName")),
                        text(o.get("phone")),
                        text(o.get("plateNumber")),
                        text(o.get("carModel")),
                        text(o.get("salesBrandText")),
                        appointment_dt,
                        total_price,
                        normalize_version(o.get("version")),
                        json.dumps(o, ensure_ascii=False),
                        created_at,
                        updated_at,
                    ),
                )

                dispatch = o.get("dispatchInfo") if isinstance(o.get("dispatchInfo"), dict) else {}
                if dispatch:
                    tech_names = dispatch.get("technicianNames") if isinstance(dispatch.get("technicianNames"), list) else []
                    if not tech_names and text(dispatch.get("technicianName")):
                        tech_names = [text(dispatch.get("technicianName"))]
                    cur.execute(
                        """
                        INSERT INTO order_dispatches (
                          order_id, dispatch_date, dispatch_time, work_bay, technician_names, remark, dispatch_status, updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s)
                        """,
                        (
                            order_id,
                            text(dispatch.get("date")) or None,
                            text(dispatch.get("time")),
                            text(dispatch.get("workBay")),
                            json.dumps(tech_names, ensure_ascii=False),
                            text(dispatch.get("remark")),
                            "ASSIGNED",
                            parse_dt(dispatch.get("updatedAt")) or updated_at,
                        ),
                    )

                work_parts = o.get("workPartRecords") if isinstance(o.get("workPartRecords"), list) else []
                for wp in work_parts:
                    if not isinstance(wp, dict):
                        continue
                    cur.execute(
                        """
                        INSERT INTO order_work_parts (order_id, technician_name, part_label, commission_amount, updated_at)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (
                            order_id,
                            text(wp.get("technicianName")),
                            text(wp.get("partLabel")),
                            parse_float(wp.get("commissionAmount")),
                            updated_at,
                        ),
                    )

                followups = o.get("followupRecords") if isinstance(o.get("followupRecords"), list) else []
                for fu in followups:
                    if not isinstance(fu, dict):
                        continue
                    node_type = text(fu.get("type")).upper()
                    if not node_type:
                        continue
                    done_at = parse_dt(fu.get("doneAt"))
                    status = "DONE" if fu.get("done") else "PENDING"
                    cur.execute(
                        """
                        INSERT INTO followups (order_id, node_type, status, done_at, remark, payload, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
                        ON CONFLICT (order_id, node_type)
                        DO UPDATE SET
                          status = EXCLUDED.status,
                          done_at = EXCLUDED.done_at,
                          remark = EXCLUDED.remark,
                          payload = EXCLUDED.payload,
                          updated_at = EXCLUDED.updated_at
                        """,
                        (
                            order_id,
                            node_type,
                            status,
                            done_at,
                            text(fu.get("remark")),
                            json.dumps(fu, ensure_ascii=False),
                            updated_at,
                        ),
                    )
        conn.commit()

    print("migrate_orders done")


if __name__ == "__main__":
    main()
