#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
用法（统一 8000 后端发布）:
  DEPLOY_HOST=<服务器IP或域名> \
  DEPLOY_USER=<SSH用户> \
  INTERNAL_API_TOKEN=<内部接口Token> \
  bash DEPLOY_PRODUCTION.sh [--no-push]

可选环境变量:
  APP_DIR=/opt/ylx
  BACKEND_DIR=backend
  REPO_URL=<git仓库地址>
  BRANCH=main
  SERVICE_NAME=ylx-backend
  SSH_PORT=22
  ENABLE_PUSH=1
  PYTHON_BIN=python3
  VENV_DIR=.venv
  UVICORN_HOST=0.0.0.0
  UVICORN_PORT=8000
  DOMAIN=<公网域名, 可选>
  LOCAL_REPO_SCOPE=<可选，默认当前脚本所在目录>

  # 以下变量若存在会自动写入 /etc/<SERVICE_NAME>.env
  DATABASE_URL
  DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME
  DB_SSL_MODE DB_CONNECT_TIMEOUT
  DOUYIN_APP_ID DOUYIN_APP_SECRET DOUYIN_WEBHOOK_VERIFY_TOKEN
  MINIPROGRAM_SALES_PASSWORD
  MINIPROGRAM_TOKEN_EXPIRE_MINUTES
  MINIPROGRAM_LOGIN_MAX_RETRIES
  MINIPROGRAM_LOGIN_WINDOW_MINUTES
  MINIPROGRAM_LOGIN_BLOCK_MINUTES

参数说明:
  --no-push   跳过本地 git push，直接远端部署
EOF
}

APP_DIR="${APP_DIR:-/opt/ylx}"
BACKEND_DIR="${BACKEND_DIR:-backend}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="${SERVICE_NAME:-ylx-backend}"
SSH_PORT="${SSH_PORT:-22}"
ENABLE_PUSH="${ENABLE_PUSH:-1}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${VENV_DIR:-.venv}"
UVICORN_HOST="${UVICORN_HOST:-0.0.0.0}"
UVICORN_PORT="${UVICORN_PORT:-8000}"
DOMAIN="${DOMAIN:-}"
LOCAL_REPO_SCOPE="${LOCAL_REPO_SCOPE:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --no-push)
      ENABLE_PUSH=0
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

required_vars=(DEPLOY_HOST DEPLOY_USER INTERNAL_API_TOKEN)
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

LOCAL_REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${LOCAL_REPO_SCOPE}" ] && [ -n "${LOCAL_REPO_ROOT}" ]; then
  case "${SCRIPT_DIR}" in
    "${LOCAL_REPO_ROOT}"/*)
      LOCAL_REPO_SCOPE="${SCRIPT_DIR#${LOCAL_REPO_ROOT}/}"
      ;;
    *)
      LOCAL_REPO_SCOPE=""
      ;;
  esac
fi

if [ -n "${LOCAL_REPO_ROOT}" ] && [ -z "${REPO_URL}" ]; then
  REPO_URL="$(git -C "${LOCAL_REPO_ROOT}" config --get remote.origin.url || true)"
fi

if [ "${ENABLE_PUSH}" = "1" ]; then
  if [ -z "${LOCAL_REPO_ROOT}" ]; then
    echo "当前目录不在 git 仓库中，无法执行 push。可使用 --no-push。"
    exit 1
  fi

  current_branch="$(git -C "${LOCAL_REPO_ROOT}" branch --show-current)"
  if [ "${current_branch}" != "${BRANCH}" ]; then
    echo "当前分支是 ${current_branch}，请切换到 ${BRANCH} 再发布。"
    exit 1
  fi

  STATUS_PATHSPEC=()
  if [ -n "${LOCAL_REPO_SCOPE}" ] && [ -d "${LOCAL_REPO_ROOT}/${LOCAL_REPO_SCOPE}" ]; then
    STATUS_PATHSPEC=(-- "${LOCAL_REPO_SCOPE}")
  fi

  if [ -n "$(git -C "${LOCAL_REPO_ROOT}" status --porcelain "${STATUS_PATHSPEC[@]}")" ]; then
    echo "检测到发布范围内未提交变更，请先 commit 再发布。"
    git -C "${LOCAL_REPO_ROOT}" status --short "${STATUS_PATHSPEC[@]}"
    exit 1
  fi

  if [ -z "${REPO_URL}" ]; then
    echo "无法自动识别 REPO_URL，请显式导出 REPO_URL 后重试。"
    exit 1
  fi

  echo "推送 ${BRANCH} 到 origin..."
  git -C "${LOCAL_REPO_ROOT}" push origin "${BRANCH}"
fi

ENV_TMP="$(mktemp)"
append_env_line() {
  local key="$1"
  local value="${!key:-}"
  if [ -n "${value}" ]; then
    # Use shell escaping for systemd EnvironmentFile safety.
    printf "%s=%q\n" "${key}" "${value}" >> "${ENV_TMP}"
  fi
}

FORWARD_ENV_VARS=(
  INTERNAL_API_TOKEN
  DATABASE_URL
  DB_HOST
  DB_PORT
  DB_USER
  DB_PASSWORD
  DB_NAME
  DB_SSL_MODE
  DB_CONNECT_TIMEOUT
  DOUYIN_APP_ID
  DOUYIN_APP_SECRET
  DOUYIN_WEBHOOK_VERIFY_TOKEN
  MINIPROGRAM_SALES_PASSWORD
  MINIPROGRAM_TOKEN_EXPIRE_MINUTES
  MINIPROGRAM_LOGIN_MAX_RETRIES
  MINIPROGRAM_LOGIN_WINDOW_MINUTES
  MINIPROGRAM_LOGIN_BLOCK_MINUTES
)

for env_key in "${FORWARD_ENV_VARS[@]}"; do
  append_env_line "${env_key}"
done

if [ ! -s "${ENV_TMP}" ]; then
  echo "环境文件内容为空，至少应包含 INTERNAL_API_TOKEN。"
  rm -f "${ENV_TMP}"
  exit 1
fi

ENV_B64="$(base64 < "${ENV_TMP}")"
rm -f "${ENV_TMP}"

echo "开始部署统一后端到 ${DEPLOY_USER}@${DEPLOY_HOST}:${APP_DIR}/${BACKEND_DIR}"
ssh -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" 'bash -s' -- \
  "${APP_DIR}" \
  "${BACKEND_DIR}" \
  "${REPO_URL}" \
  "${BRANCH}" \
  "${SERVICE_NAME}" \
  "${PYTHON_BIN}" \
  "${VENV_DIR}" \
  "${UVICORN_HOST}" \
  "${UVICORN_PORT}" \
  "${DOMAIN}" \
  "${ENV_B64}" <<'REMOTE_SCRIPT'
set -euo pipefail

APP_DIR="$1"
BACKEND_DIR="$2"
REPO_URL="$3"
BRANCH="$4"
SERVICE_NAME="$5"
PYTHON_BIN="$6"
VENV_DIR="$7"
UVICORN_HOST="$8"
UVICORN_PORT="$9"
DOMAIN="${10}"
ENV_B64="${11}"

if ! command -v git >/dev/null 2>&1; then
  echo "远端缺少 git，请先安装。"
  exit 1
fi

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "远端缺少 ${PYTHON_BIN}，请先安装。"
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "远端缺少 sudo，无法写入 systemd 配置。"
  exit 1
fi

mkdir -p "$(dirname "${APP_DIR}")"
if [ ! -d "${APP_DIR}/.git" ]; then
  if [ -z "${REPO_URL}" ]; then
    echo "远端目录不存在且未提供 REPO_URL，无法克隆代码。"
    exit 1
  fi
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

if [ ! -d "${APP_DIR}/${BACKEND_DIR}" ]; then
  echo "远端后端目录不存在: ${APP_DIR}/${BACKEND_DIR}"
  exit 1
fi

if [ ! -d "${APP_DIR}/${VENV_DIR}" ]; then
  "${PYTHON_BIN}" -m venv "${APP_DIR}/${VENV_DIR}"
fi

"${APP_DIR}/${VENV_DIR}/bin/pip" install -r "${APP_DIR}/${BACKEND_DIR}/requirements.txt"

printf '%s' "${ENV_B64}" | base64 --decode | sudo tee "/etc/${SERVICE_NAME}.env" >/dev/null
sudo chmod 600 "/etc/${SERVICE_NAME}.env"

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=YXL Unified Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/${BACKEND_DIR}
EnvironmentFile=/etc/${SERVICE_NAME}.env
ExecStart=${APP_DIR}/${VENV_DIR}/bin/uvicorn app.main:app --host ${UVICORN_HOST} --port ${UVICORN_PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}" >/dev/null
sudo systemctl restart "${SERVICE_NAME}"
sudo systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,12p'

echo "验证本机健康检查..."
curl -fsS --max-time 10 "http://127.0.0.1:${UVICORN_PORT}/health" >/dev/null

if [ -n "${DOMAIN}" ]; then
  echo "验证公网健康检查..."
  curl -fsS --max-time 15 "https://${DOMAIN}/health" >/dev/null
fi

echo "远端部署完成。"
REMOTE_SCRIPT

echo "发布完成。"
echo "统一后端地址: http://<server-ip>:${UVICORN_PORT}"
echo "健康检查: /health"
echo "统一经营接口前缀: /api/v1/store"
