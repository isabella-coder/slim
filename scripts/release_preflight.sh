#!/usr/bin/env bash

set -euo pipefail

MODE="${MODE:-release}"
BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
INTERNAL_API_TOKEN="${INTERNAL_API_TOKEN:-}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${PROJECT_DIR}/config/finance.config.js"
SMOKE_SCRIPT="${PROJECT_DIR}/scripts/smoke_api.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}▶${NC} $1"
}

log_ok() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_fail() {
  echo -e "${RED}✗${NC} $1"
}

fail() {
  log_fail "$1"
  exit 1
}

check_commands() {
  log_info "检查本机依赖命令..."
  local required=(git curl python3)
  local missing=()
  local cmd
  for cmd in "${required[@]}"; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      missing+=("${cmd}")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    fail "缺少命令: ${missing[*]}"
  fi
  log_ok "基础命令可用"
}

check_env() {
  log_info "检查必要环境变量..."
  if [ -z "${INTERNAL_API_TOKEN}" ]; then
    fail "缺少 INTERNAL_API_TOKEN（请先 export INTERNAL_API_TOKEN='<token>'）"
  fi
  log_ok "INTERNAL_API_TOKEN 已设置"
}

check_git_state() {
  log_info "检查 Git 分支与工作区..."
  cd "${PROJECT_DIR}"
  local branch
  branch="$(git branch --show-current)"
  if [ "${branch}" != "main" ]; then
    log_warn "当前分支是 ${branch}，建议在 main 发布"
  else
    log_ok "当前分支为 main"
  fi

  if [ -n "$(git status --porcelain)" ]; then
    log_warn "工作区存在未提交改动，发布前请确认是否符合预期"
  else
    log_ok "工作区干净"
  fi
}

extract_env_url() {
  local env_name="$1"
  python3 - "${CONFIG_FILE}" "${env_name}" <<'PY'
import re
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
env_name = sys.argv[2]
text = config_path.read_text(encoding="utf-8")
pattern = re.compile(rf"{re.escape(env_name)}\s*:\s*'([^']*)'")
match = pattern.search(text)
print(match.group(1).strip() if match else "")
PY
}

is_local_url() {
  local value
  value="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  case "${value}" in
    *127.0.0.1*|*localhost*) return 0 ;;
    *) return 1 ;;
  esac
}

check_mini_program_config() {
  log_info "检查小程序环境地址配置..."
  if [ ! -f "${CONFIG_FILE}" ]; then
    fail "未找到配置文件: ${CONFIG_FILE}"
  fi

  local develop_url trial_url release_url
  develop_url="$(extract_env_url "develop")"
  trial_url="$(extract_env_url "trial")"
  release_url="$(extract_env_url "release")"

  if [ -z "${develop_url}" ] || [ -z "${trial_url}" ] || [ -z "${release_url}" ]; then
    fail "config/finance.config.js 的 ENV_BASE_URL 配置不完整"
  fi

  log_ok "develop=${develop_url}"
  log_ok "trial=${trial_url}"
  log_ok "release=${release_url}"

  if [ "${MODE}" = "release" ]; then
    if is_local_url "${trial_url}" || is_local_url "${release_url}"; then
      fail "release 模式下，trial/release 不能是 localhost 或 127.0.0.1"
    fi
    if [[ ! "${trial_url}" =~ ^https:// ]]; then
      fail "release 模式下，trial 必须使用 https://"
    fi
    if [[ ! "${release_url}" =~ ^https:// ]]; then
      fail "release 模式下，release 必须使用 https://"
    fi
    log_ok "release 模式域名检查通过"
  else
    log_warn "当前 MODE=${MODE}，跳过 trial/release 强约束检查"
  fi
}

check_api_connectivity() {
  log_info "检查后端接口连通 (${BASE_URL})..."
  local health_json
  if ! health_json="$(curl -fsS --max-time 5 "${BASE_URL}/health")"; then
    fail "无法访问 ${BASE_URL}/health"
  fi
  printf '%s' "${health_json}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('status') == 'ok'"
  log_ok "/health 正常"

  local orders_json
  if ! orders_json="$(curl -fsS --max-time 10 "${BASE_URL}/api/v1/store/internal/orders" \
    -H "Authorization: Bearer ${INTERNAL_API_TOKEN}")"; then
    fail "无法访问内部订单接口，请检查 BASE_URL 和 INTERNAL_API_TOKEN"
  fi
  printf '%s' "${orders_json}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('success') is True; assert isinstance(d.get('items'), list)"
  local count
  count="$(printf '%s' "${orders_json}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('items') or []))")"
  log_ok "内部订单接口正常 (orders=${count})"
}

run_smoke() {
  log_info "执行最小冒烟测试脚本..."
  if [ ! -x "${SMOKE_SCRIPT}" ]; then
    fail "未找到可执行的脚本: ${SMOKE_SCRIPT}"
  fi
  BASE_URL="${BASE_URL}" INTERNAL_API_TOKEN="${INTERNAL_API_TOKEN}" bash "${SMOKE_SCRIPT}"
  log_ok "冒烟测试通过"
}

main() {
  echo ""
  echo "========================================"
  echo "发布前检查 (release preflight)"
  echo "MODE=${MODE}"
  echo "BASE_URL=${BASE_URL}"
  echo "========================================"
  echo ""

  check_commands
  check_env
  check_git_state
  check_mini_program_config
  check_api_connectivity
  run_smoke

  echo ""
  log_ok "发布前检查全部通过，可执行 DEPLOY_PRODUCTION.sh"
  echo ""
}

main "$@"
