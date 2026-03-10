#!/bin/bash

# System Health Check for Car Film Mini Program
# Usage: bash HEALTH_CHECK.sh

echo "=================================="
echo "Car Film System Health Check"
echo "=================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

status=0
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
INTERNAL_API_TOKEN="${INTERNAL_API_TOKEN:-}"

if [ -z "$POSTGRES_PASSWORD" ]; then
    echo "[Config] POSTGRES_PASSWORD: MISSING"
    status=1
fi

if [ -z "$INTERNAL_API_TOKEN" ]; then
    echo "[Config] INTERNAL_API_TOKEN: MISSING"
    status=1
fi

# 1. PostgreSQL Container
echo -n "[Docker] PostgreSQL container: "
alias docker='/Applications/Docker.app/Contents/Resources/bin/docker'
if docker ps 2>/dev/null | grep -q postgres-slim; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}DOWN${NC}"
    status=1
fi

# 2. Database Connection
echo -n "[Database] Connection to slim: "
if python3 -c "import os, psycopg; psycopg.connect(f\"dbname=slim user=postgres host=localhost password={os.environ['POSTGRES_PASSWORD']}\")" 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    status=1
fi

# 3. Data in Database
echo -n "[Data] Records count: "
USERS=$(docker exec postgres-slim psql -U postgres slim -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ')
ORDERS=$(docker exec postgres-slim psql -U postgres slim -t -c "SELECT COUNT(*) FROM orders;" 2>/dev/null | tr -d ' ')
LOGS=$(docker exec postgres-slim psql -U postgres slim -t -c "SELECT COUNT(*) FROM finance_sync_logs;" 2>/dev/null | tr -d ' ')

if [ -n "$USERS" ] && [ -n "$ORDERS" ] && [ -n "$LOGS" ]; then
    echo -e "${GREEN}OK (users=$USERS, orders=$ORDERS, logs=$LOGS)${NC}"
else
    echo -e "${YELLOW}UNAVAILABLE (users=$USERS, orders=$ORDERS, logs=$LOGS)${NC}"
    status=1
fi

# 4. Backend Service
echo -n "[Backend] process (uvicorn/server.py): "
if ps aux | grep -E "uvicorn.*app.main:app|python3.*server.py" | grep -v grep > /dev/null; then
    PID=$(ps aux | grep -E "uvicorn.*app.main:app|python3.*server.py" | grep -v grep | awk '{print $2}' | head -1)
    echo -e "${GREEN}OK (PID: $PID)${NC}"
else
    echo -e "${RED}DOWN${NC}"
    status=1
fi

# 5. API Port
echo -n "[Network] Port 8000 listening: "
if netstat -an 2>/dev/null | grep -q "*.8000.*LISTEN"; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}CLOSED${NC}"
    status=1
fi

# 6. API Endpoint
echo -n "[API] GET /api/v1/store/internal/orders: "
python3 << 'PYEOF' 2>/dev/null
import os
import urllib.request, json
try:
    req = urllib.request.Request('http://127.0.0.1:8000/api/v1/store/internal/orders',
        headers={'Authorization': f"Bearer {os.environ['INTERNAL_API_TOKEN']}"})
    with urllib.request.urlopen(req, timeout=2) as r:
        data = json.load(r)
        count = len(data.get('items', []))
        print(f"OK (items: {count})")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}")
PYEOF

# 7. API Port from netstat if available
if [ $? -ne 0 ]; then
    status=1
fi

# Summary
echo ""
echo "=================================="
if [ $status -eq 0 ]; then
    echo -e "${GREEN}Status: HEALTHY${NC}"
else
    echo -e "${RED}Status: ISSUES DETECTED${NC}"
fi
echo "=================================="

exit $status
