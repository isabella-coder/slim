#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="$SCRIPT_DIR/reports"
mkdir -p "$REPORT_DIR"

SINCE=""
LIMIT="0"
SAMPLE_SIZE="200"
DSN=""
APPLY="0"
FAIL_ON_DIFF="0"

usage() {
  cat <<USAGE
Usage:
  ./run_migration_gate.sh --dsn <postgres_dsn> [--since "2026-03-01 00:00"] [--limit 0] [--sample-size 200] [--apply] [--fail-on-diff]

Behavior:
  1) Always runs source precheck
  2) Always runs migration scripts in --dry-run mode
  3) If --apply is set, runs real migration scripts
  4) Always runs reconciliation against DB
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dsn)
      DSN="${2:-}"
      shift 2
      ;;
    --since)
      SINCE="${2:-}"
      shift 2
      ;;
    --limit)
      LIMIT="${2:-0}"
      shift 2
      ;;
    --sample-size)
      SAMPLE_SIZE="${2:-200}"
      shift 2
      ;;
    --apply)
      APPLY="1"
      shift
      ;;
    --fail-on-diff)
      FAIL_ON_DIFF="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$DSN" ]]; then
  echo "--dsn is required" >&2
  usage
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
PRECHECK_REPORT="$REPORT_DIR/precheck-$TS.json"
RECON_REPORT="$REPORT_DIR/reconcile-$TS.json"

EXTRA_ARGS=()
if [[ -n "$SINCE" ]]; then
  EXTRA_ARGS+=(--since "$SINCE")
fi
if [[ -n "$LIMIT" ]]; then
  EXTRA_ARGS+=(--limit "$LIMIT")
fi

echo "[1/4] precheck source data"
python3 "$SCRIPT_DIR/precheck_source_data.py" "${EXTRA_ARGS[@]}" --output "$PRECHECK_REPORT"

echo "[2/4] dry-run migrations"
python3 "$SCRIPT_DIR/migrate_users.py" --dry-run "${EXTRA_ARGS[@]}"
python3 "$SCRIPT_DIR/migrate_orders.py" --dry-run "${EXTRA_ARGS[@]}"
python3 "$SCRIPT_DIR/migrate_finance_logs.py" --dry-run "${EXTRA_ARGS[@]}"

if [[ "$APPLY" == "1" ]]; then
  echo "[3/4] apply migrations"
  python3 "$SCRIPT_DIR/migrate_users.py" --dsn "$DSN" "${EXTRA_ARGS[@]}"
  python3 "$SCRIPT_DIR/migrate_orders.py" --dsn "$DSN" "${EXTRA_ARGS[@]}"
  python3 "$SCRIPT_DIR/migrate_finance_logs.py" --dsn "$DSN" "${EXTRA_ARGS[@]}"
else
  echo "[3/4] skip apply migrations (use --apply to enable)"
fi

echo "[4/4] reconcile db vs json"
RECON_ARGS=(--dsn "$DSN" --sample-size "$SAMPLE_SIZE" --output "$RECON_REPORT" "${EXTRA_ARGS[@]}")
if [[ "$FAIL_ON_DIFF" == "1" ]]; then
  RECON_ARGS+=(--fail-on-diff)
fi
python3 "$SCRIPT_DIR/reconcile_db_vs_json.py" "${RECON_ARGS[@]}"

echo "done"
echo "precheck report: $PRECHECK_REPORT"
echo "reconcile report: $RECON_REPORT"
