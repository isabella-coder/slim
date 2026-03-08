#!/bin/bash

# 蔚蓝工单系统启动脚本
# PostgreSQL + server.py + 小程序
# 用法: bash START_SYSTEM.sh

set -e

PROJECT_DIR="/Users/yushuai/Documents/Playground/car-film-mini-program"
cd "$PROJECT_DIR"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
INTERNAL_API_TOKEN="${INTERNAL_API_TOKEN:-}"

if [ -z "$POSTGRES_PASSWORD" ]; then
    echo "❌ 请先设置 POSTGRES_PASSWORD 环境变量"
    echo "   例如: export POSTGRES_PASSWORD='your-db-password'"
    exit 1
fi

if [ -z "$INTERNAL_API_TOKEN" ]; then
    echo "❌ 请先设置 INTERNAL_API_TOKEN 环境变量"
    echo "   例如: export INTERNAL_API_TOKEN='your-internal-token'"
    exit 1
fi

echo "🚀 蔚蓝工单系统启动中..."
echo ""

# 1. 检查并启动Docker
echo "1️⃣ 检查 PostgreSQL 容器..."
alias docker='/Applications/Docker.app/Contents/Resources/bin/docker'

if ! docker ps | grep -q postgres-slim; then
    echo "   启动 PostgreSQL 容器..."
    docker run --name postgres-slim -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
        -p 5432:5432 -v postgres_data:/var/lib/postgresql/data -d postgres:15 > /dev/null 2>&1
    sleep 2
    echo "   ✅ PostgreSQL 已启动"
else
    echo "   ✅ PostgreSQL 已在运行"
fi

# 2. 等待数据库就绪
echo ""
echo "2️⃣ 等待数据库就绪..."
counter=0
while ! python3 -c "import os, psycopg; psycopg.connect(f\"dbname=slim user=postgres host=localhost password={os.environ['POSTGRES_PASSWORD']}\")" 2>/dev/null; do
    counter=$((counter+1))
    if [ $counter -gt 10 ]; then
        echo "   ❌ 数据库连接超时"
        exit 1
    fi
    sleep 0.5
done
echo "   ✅ 数据库就绪"

# 3. 验证数据
echo ""
echo "3️⃣ 验证迁移数据..."
python3 -c "
import os, psycopg
with psycopg.connect(f\"dbname=slim user=postgres host=localhost password={os.environ['POSTGRES_PASSWORD']}\") as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM users')
        users = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM orders')
        orders = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM finance_sync_logs')
        logs = cur.fetchone()[0]
        print(f'   ✅ users: {users}, orders: {orders}, logs: {logs}')
"

# 4. 启动后端服务
echo ""
echo "4️⃣ 启动后端服务 (localhost:8080)..."

# 检查端口是否被占用
if lsof -i :8080 >/dev/null 2>&1; then
    echo "   清理占用的进程..."
    lsof -i :8080 | grep Python | awk '{print $2}' | xargs kill -9 2>/dev/null || true
    sleep 1
fi

ENABLE_DB_STORAGE=1 INTERNAL_API_TOKEN="$INTERNAL_API_TOKEN" python3 admin-console/server.py > /tmp/car_film_server.log 2>&1 &
SERVER_PID=$!
sleep 2

if kill -0 $SERVER_PID 2>/dev/null; then
    echo "   ✅ 后端服务已启动 (PID: $SERVER_PID)"
else
    echo "   ❌ 后端服务启动失败，查看日志:"
    cat /tmp/car_film_server.log
    exit 1
fi

# 5. 验证API
echo ""
echo "5️⃣ 验证 API..."
python3 -c "
import urllib.request, json
import os
try:
    req = urllib.request.Request('http://127.0.0.1:8080/api/v1/internal/orders',
        headers={'Authorization': f\"Bearer {os.environ['INTERNAL_API_TOKEN']}\"})
    with urllib.request.urlopen(req, timeout=3) as r:
        data = json.load(r)
        count = len(data.get('items', []))
        print(f'   ✅ API 响应正常: {count} 条订单可用')
except Exception as e:
    print(f'   ⚠️ API 返回错误: {e}')
"

# 完成
echo ""
echo "════════════════════════════════════════"
echo "✅ 系统启动完成！"
echo "════════════════════════════════════════"
echo ""
echo "📱 小程序配置:"
echo "   开发环境: http://127.0.0.1:8080"
echo "   Token: 使用 INTERNAL_API_TOKEN 的值"
echo ""
echo "🔧 后端服务:"
echo "   地址: http://127.0.0.1:8080"
echo "   日志: /tmp/car_film_server.log"
echo ""
echo "💾 数据库:"
echo "   连接: localhost:5432/slim"
echo "   用户: postgres"
echo "   密码: 使用 POSTGRES_PASSWORD 的值"
echo ""
echo "🚀 下一步:"
echo "   1. 打开微信开发者工具"
echo "   2. 导入项目: $PROJECT_DIR"
echo "   3. 编译或预览 (Cmd+Shift+P)"
echo "   4. 导航到订单列表页面"
echo ""
