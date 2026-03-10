#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
INTERNAL_API_TOKEN="${INTERNAL_API_TOKEN:-}"
IDEMPOTENCY_KEY="smoke-$(date +%Y%m%d%H%M%S)"

if [ -z "${INTERNAL_API_TOKEN}" ]; then
  echo "缺少 INTERNAL_API_TOKEN，请先 export INTERNAL_API_TOKEN='<token>'"
  exit 1
fi

echo "Smoke API check started"
echo "BASE_URL=${BASE_URL}"
echo ""

echo "[1/4] GET /health"
HEALTH_JSON="$(curl -fsS "${BASE_URL}/health")"
printf '%s' "${HEALTH_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('status') == 'ok'"
echo "  OK"
echo ""

echo "[2/4] GET /api/v1/store/internal/orders"
ORDERS_JSON="$(curl -fsS "${BASE_URL}/api/v1/store/internal/orders" -H "Authorization: Bearer ${INTERNAL_API_TOKEN}")"
printf '%s' "${ORDERS_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('success') is True; assert isinstance(d.get('items'), list)"
ORDER_COUNT="$(printf '%s' "${ORDERS_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('items') or []))")"
echo "  OK (orders=${ORDER_COUNT})"
echo ""

echo "[3/4] POST /api/v1/store/internal/orders/sync (idempotent empty push)"
SYNC_PAYLOAD='{"orders":[]}'
SYNC_JSON="$(curl -fsS "${BASE_URL}/api/v1/store/internal/orders/sync" \
  -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d "${SYNC_PAYLOAD}")"
printf '%s' "${SYNC_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('success') is True; assert d.get('code') == 0"
echo "  OK"
echo ""

echo "[4/4] POST /api/v1/store/internal/work-orders/sync"
SMOKE_ORDER_ID="SMOKE-$(date +%Y%m%d%H%M%S)"
FINANCE_PAYLOAD="$(cat <<EOF
{
  "eventType": "SMOKE_TEST",
  "source": "SMOKE_SCRIPT",
  "order": {
    "id": "${SMOKE_ORDER_ID}",
    "serviceType": "FILM",
    "status": "未完工",
    "priceSummary": {
      "totalPrice": 0
    }
  }
}
EOF
)"
FINANCE_JSON="$(curl -fsS "${BASE_URL}/api/v1/store/internal/work-orders/sync" \
  -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}-finance" \
  -d "${FINANCE_PAYLOAD}")"
printf '%s' "${FINANCE_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('success') is True; assert d.get('code') == 0"
echo "  OK"
echo ""

echo "Smoke API check passed."
