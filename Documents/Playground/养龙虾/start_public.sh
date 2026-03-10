#!/bin/bash
# ===============================================
# 一键启动：后端 + 公网隧道
# 使用方法: bash start_public.sh
# ===============================================

set -e
cd "$(dirname "$0")"

echo "🚀 启动养龙虾系统（公网模式）"
echo "================================"

# 1. 启动后端
echo "📡 启动 FastAPI 后端..."
cd backend
source ../.venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# 等待后端就绪
echo "⏳ 等待后端启动..."
for i in $(seq 1 15); do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ 后端已启动: http://localhost:8000"
        break
    fi
    sleep 1
done

# 2. 启动 Cloudflare 隧道
echo "🌐 启动 Cloudflare 公网隧道..."
cloudflared tunnel --url http://localhost:8000 2>&1 | tee /tmp/cf_output.txt &
CF_PID=$!

# 等待隧道 URL
echo "⏳ 等待公网 URL..."
for i in $(seq 1 20); do
    URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cf_output.txt 2>/dev/null | head -1)
    if [ -n "$URL" ]; then
        break
    fi
    sleep 1
done

echo ""
echo "================================"
echo "✅ 系统已启动！"
echo ""
echo "📋 公网 URL:  $URL"
echo "📋 健康检查:  $URL/health"
echo "📋 API 文档:  $URL/docs"
echo "📋 Webhook:   $URL/api/v1/chat/douyin/webhook"
echo "📋 聊天测试:  $URL/api/v1/chat/test"
echo ""
echo "⚠️  请将以下 URL 配置到抖音开放平台 Webhook:"
echo "    $URL/api/v1/chat/douyin/webhook"
echo ""
echo "⚠️  请更新小程序 API 地址:"
echo "    miniprogram/utils/api.js → getApiBaseUrl()"
echo "    return '$URL/api/v1'"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo "================================"

# 等待退出
trap "kill $BACKEND_PID $CF_PID 2>/dev/null; echo '🛑 已停止所有服务'; exit 0" INT TERM
wait
