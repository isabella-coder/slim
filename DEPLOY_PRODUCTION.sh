#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
用法:
  DEPLOY_HOST=<服务器IP或域名> \
  DEPLOY_USER=<SSH用户> \
  INTERNAL_API_TOKEN=<后端API Token> \
  POSTGRES_PASSWORD=<PostgreSQL密码> \
  DOMAIN=<公网域名, 可选> \
  bash DEPLOY_PRODUCTION.sh [--no-push] [--bootstrap-db]

可选环境变量:
  APP_DIR=/opt/car-film-mini-program
  REPO_URL=git@github.com:isabella-coder/slim.git
  BRANCH=main
  SERVICE_NAME=car-film
  SSH_PORT=22
  ENABLE_PUSH=1
  BOOTSTRAP_DB=0

参数说明:
  --no-push       跳过本地 git push，直接远端部署
  --bootstrap-db  在远端执行 init-db.py + migrate-all-data.py（首次部署建议开启）
EOF
}

APP_DIR="${APP_DIR:-/opt/car-film-mini-program}"
REPO_URL="${REPO_URL:-git@github.com:isabella-coder/slim.git}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="${SERVICE_NAME:-car-film}"
SSH_PORT="${SSH_PORT:-22}"
ENABLE_PUSH="${ENABLE_PUSH:-1}"
BOOTSTRAP_DB="${BOOTSTRAP_DB:-0}"

while [ $# -gt 0 ]; do
  case "$1" in
    --no-push)
      ENABLE_PUSH=0
      ;;
    --bootstrap-db)
      BOOTSTRAP_DB=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

required_vars=(DEPLOY_HOST DEPLOY_USER INTERNAL_API_TOKEN POSTGRES_PASSWORD)
for var_name in "${required_vars[@]}"; do
  if [ -z "${!var_name:-}" ]; then
    echo "缺少必填环境变量: ${var_name}"
    usage
    exit 1
  fi
done

if ! command -v git >/dev/null 2>&1; then
  echo "本机缺少 git"
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "本机缺少 ssh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

if [ "${ENABLE_PUSH}" = "1" ]; then
  current_branch="$(git branch --show-current)"
  if [ "${current_branch}" != "${BRANCH}" ]; then
    echo "当前分支是 ${current_branch}，请切换到 ${BRANCH} 再发布。"
    exit 1
  fi

  if [ -n "$(git status --porcelain)" ]; then
    echo "检测到未提交变更，请先 commit 再发布。"
    git status --short
    exit 1
  fi

  echo "推送 ${BRANCH} 到 origin..."
  git push origin "${BRANCH}"
fi

echo "开始部署到 ${DEPLOY_USER}@${DEPLOY_HOST}:${APP_DIR}"
ssh -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" 'bash -s' -- \
  "${APP_DIR}" \
  "${REPO_URL}" \
  "${BRANCH}" \
  "${SERVICE_NAME}" \
  "${INTERNAL_API_TOKEN}" \
  "${POSTGRES_PASSWORD}" \
  "${BOOTSTRAP_DB}" \
  "${DOMAIN:-}" <<'REMOTE_SCRIPT'
set -euo pipefail

APP_DIR="$1"
REPO_URL="$2"
BRANCH="$3"
SERVICE_NAME="$4"
INTERNAL_API_TOKEN="$5"
POSTGRES_PASSWORD="$6"
BOOTSTRAP_DB="$7"
DOMAIN="$8"

if ! command -v docker >/dev/null 2>&1; then
  echo "远端缺少 docker，请先安装 Docker。"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "远端缺少 python3，请先安装。"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "远端缺少 git，请先安装。"
  exit 1
fi

if ! python3 -c "import psycopg" >/dev/null 2>&1; then
  echo "远端缺少 psycopg，请先执行: python3 -m pip install psycopg[binary]"
  exit 1
fi

mkdir -p "$(dirname "${APP_DIR}")"
if [ ! -d "${APP_DIR}/.git" ]; then
  git clone "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"
if [ -n "$(git status --porcelain)" ]; then
  echo "远端代码目录有未提交变更，已停止部署：${APP_DIR}"
  git status --short
  exit 1
fi

git fetch --all --prune
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

if docker ps -a --format '{{.Names}}' | grep -q '^postgres-slim$'; then
  if ! docker ps --format '{{.Names}}' | grep -q '^postgres-slim$'; then
    docker start postgres-slim >/dev/null
  fi
else
  docker run --name postgres-slim \
    -e POSTGRES_DB=slim \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    -p 5432:5432 \
    -v /data/postgres:/var/lib/postgresql/data \
    -d postgres:15 >/dev/null
fi

attempt=0
until docker exec postgres-slim pg_isready -U postgres >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -gt 60 ]; then
    echo "PostgreSQL 启动超时。"
    exit 1
  fi
  sleep 1
done

if [ "${BOOTSTRAP_DB}" = "1" ]; then
  echo "执行数据库初始化与迁移..."
  POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5432 POSTGRES_DB=slim POSTGRES_USER=postgres POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    python3 admin-console/sql/migrations/delivery/init-db.py
  POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5432 POSTGRES_DB=slim POSTGRES_USER=postgres POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    python3 admin-console/sql/migrations/delivery/migrate-all-data.py
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "远端缺少 sudo，无法写入 systemd 配置。"
  exit 1
fi

sudo tee "/etc/${SERVICE_NAME}.env" >/dev/null <<EOF
ENABLE_DB_STORAGE=1
INTERNAL_API_TOKEN=${INTERNAL_API_TOKEN}
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=slim
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
EOF
sudo chmod 600 "/etc/${SERVICE_NAME}.env"

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Car Film Backend
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=/etc/${SERVICE_NAME}.env
ExecStart=/usr/bin/python3 ${APP_DIR}/admin-console/server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}" >/dev/null
sudo systemctl restart "${SERVICE_NAME}"
sudo systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,12p'

echo "验证本机 API..."
curl -fsS --max-time 10 \
  -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" \
  "http://127.0.0.1:8080/api/v1/internal/orders" >/dev/null

if [ -n "${DOMAIN}" ]; then
  echo "验证公网 API..."
  curl -fsS --max-time 15 \
    -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" \
    "https://${DOMAIN}/api/v1/internal/orders" >/dev/null
fi

echo "远端部署完成。"
REMOTE_SCRIPT

echo "发布完成。"
echo "下一步请在微信开发者工具上传版本并提交审核。"
