#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if command -v python3 >/dev/null 2>&1; then
  python3 server.py
  exit 0
fi

if command -v python >/dev/null 2>&1; then
  python server.py
  exit 0
fi

echo "未检测到 Python，请先安装 Python 3。"
exit 1
