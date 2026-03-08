#!/bin/bash
# ============================================================================
# Docker PostgreSQL 快速启动脚本
# ============================================================================
# 用途：一键启动 PostgreSQL 容器进行数据库迁移测试
# 前置条件：Docker Desktop 已安装并运行
# 执行方式：bash docker-postgres-start.sh

set -euo pipefail

# ============================================================================
# 配置
# ============================================================================
CONTAINER_NAME="postgres-slim"
POSTGRES_VERSION="15-alpine"
POSTGRES_PORT="5432"
POSTGRES_DB="slim"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
DATA_VOLUME="${HOME}/docker-volumes/postgres-slim"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# 函数
# ============================================================================

print_status() {
  echo -e "${BLUE}▶${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

wait_for_postgres() {
  print_status "等待 PostgreSQL 启动..."
  local max_attempts=30
  local attempt=0
  
  while [ $attempt -lt $max_attempts ]; do
    if docker exec $CONTAINER_NAME pg_isready -U $POSTGRES_USER > /dev/null 2>&1; then
      print_success "PostgreSQL 已就绪"
      return 0
    fi
    
    attempt=$((attempt + 1))
    echo -n "."
    sleep 1
  done
  
  print_error "PostgreSQL 启动超时"
  return 1
}

# ============================================================================
# 主流程
# ============================================================================

main() {
  print_status "Docker PostgreSQL 启动工具"
  echo ""
  
  # 检查 Docker
  if ! command -v docker &> /dev/null; then
    print_error "Docker 未安装或不在 PATH 中"
    exit 1
  fi
  
  print_success "Docker 已安装: $(docker --version)"
  
  # 检查 Docker daemon 运行状态
  if ! docker ps > /dev/null 2>&1; then
    print_error "Docker daemon 未运行，请启动 Docker Desktop"
    exit 1
  fi
  
  print_success "Docker daemon 正在运行"
  
  # 检查现有容器
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    print_warning "容器 '$CONTAINER_NAME' 已存在"
    
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
      print_status "容器已在运行，跳过启动"
      print_success "PostgreSQL 已就绪"
      print_commands_help
      return 0
    else
      read -p "要重新启动现有容器吗？(y/n) " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker start $CONTAINER_NAME
        wait_for_postgres
      fi
      print_commands_help
      return 0
    fi
  fi
  
  # 创建数据卷目录
  print_status "创建数据卷目录: $DATA_VOLUME"
  mkdir -p "$DATA_VOLUME"
  print_success "数据卷目录就绪"
  
  # 启动容器
  print_status "启动 PostgreSQL 容器..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e POSTGRES_DB="$POSTGRES_DB" \
    -e POSTGRES_USER="$POSTGRES_USER" \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -p "$POSTGRES_PORT:5432" \
    -v "$DATA_VOLUME":/var/lib/postgresql/data \
    --health-cmd='pg_isready -U postgres' \
    --health-interval=10s \
    --health-timeout=5s \
    --health-retries=5 \
    "postgres:$POSTGRES_VERSION"
  
  print_success "容器已启动: $CONTAINER_NAME"
  
  # 等待启动完成
  wait_for_postgres
  
  echo ""
  print_status "访问 PostgreSQL："
  echo "  Host:     127.0.0.1"
  echo "  Port:     $POSTGRES_PORT"
  echo "  Database: $POSTGRES_DB"
  echo "  User:     $POSTGRES_USER"
  echo "  Password: $POSTGRES_PASSWORD"
  
  echo ""
  print_commands_help
}

print_commands_help() {
  echo ""
  print_status "常用命令："
  echo ""
  echo "  进入容器 psql："
  echo "    docker exec -it $CONTAINER_NAME psql -U $POSTGRES_USER -d $POSTGRES_DB"
  echo ""
  echo "  执行迁移脚本："
  echo "    psql -h 127.0.0.1 -U $POSTGRES_USER -d $POSTGRES_DB -f 001-init-schema.sql"
  echo ""
  echo "  查看日志："
  echo "    docker logs -f $CONTAINER_NAME"
  echo ""
  echo "  停止容器："
  echo "    docker stop $CONTAINER_NAME"
  echo ""
  echo "  删除容器："
  echo "    docker rm $CONTAINER_NAME"
  echo ""
  echo "  完整删除（含数据）："
  echo "    docker rm -v $CONTAINER_NAME"
  echo ""
}

# ============================================================================
# 执行
# ============================================================================

main "$@"
