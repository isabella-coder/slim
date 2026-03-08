#!/bin/bash
# ============================================================================
# 一键数据库迁移执行脚本
# ============================================================================
# 用途：自动化执行完整的数据库迁移流程
# 前置条件：PostgreSQL 已启动，psql 工具已安装
# 执行方式：bash run-migration.sh

set -euo pipefail

# ============================================================================
# 配置
# ============================================================================
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-slim}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

MIGRATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${MIGRATION_DIR}/migration_${TIMESTAMP}.log"
REPORT_FILE="${MIGRATION_DIR}/migration_report_${TIMESTAMP}.txt"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# 函数
# ============================================================================

log() {
  local level=$1
  shift
  local message="$@"
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_FILE"
}

print_status() {
  echo -e "${BLUE}▶${NC} $1"
  log "INFO" "$1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
  log "SUCCESS" "$1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
  log "WARNING" "$1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
  log "ERROR" "$1"
}

check_postgres() {
  print_status "检查 PostgreSQL 连接..."
  
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" -d postgres -c "SELECT 1" > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    print_success "PostgreSQL 连接成功"
    return 0
  else
    print_error "PostgreSQL 连接失败"
    echo "  检查参数："
    echo "    Host:     $POSTGRES_HOST"
    echo "    Port:     $POSTGRES_PORT"
    echo "    User:     $POSTGRES_USER"
    echo "    Database: $POSTGRES_DB"
    return 1
  fi
}

check_scripts() {
  print_status "检查迁移脚本..."
  
  local scripts=(
    "001-init-schema.sql"
    "002-migrate-users.sql"
    "003-migrate-orders.sql"
    "004-migrate-finance.sql"
    "005-post-migration-index.sql"
  )
  
  for script in "${scripts[@]}"; do
    if [ ! -f "$MIGRATION_DIR/$script" ]; then
      print_error "缺少脚本: $script"
      return 1
    fi
  done
  
  print_success "所有脚本已就位"
  return 0
}

create_database() {
  print_status "创建数据库 '$POSTGRES_DB' (如果不存在)..."
  
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" -d postgres \
    -c "CREATE DATABASE $POSTGRES_DB;" 2>/dev/null || true
  
  print_success "数据库已就绪"
}

run_migration_script() {
  local script=$1
  local name=$2
  
  print_status "执行: $name ($script)..."
  
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -f "$MIGRATION_DIR/$script" >> "$LOG_FILE" 2>&1
  
  if [ $? -eq 0 ]; then
    print_success "$name 完成"
    return 0
  else
    print_error "$name 失败，查看日志: $LOG_FILE"
    return 1
  fi
}

generate_report() {
  print_status "生成迁移报告..."
  
  {
    echo "============================================"
    echo "数据库迁移报告"
    echo "============================================"
    echo "时间: $(date)"
    echo "Host: $POSTGRES_HOST:$POSTGRES_PORT"
    echo "Database: $POSTGRES_DB"
    echo ""
    
    echo "表统计："
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" \
      -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "
        SELECT 'users: ' || COUNT(*) FROM users
        UNION ALL
        SELECT 'orders: ' || COUNT(*) FROM orders
        UNION ALL
        SELECT 'order_dispatches: ' || COUNT(*) FROM order_dispatches
        UNION ALL
        SELECT 'order_work_parts: ' || COUNT(*) FROM order_work_parts
        UNION ALL
        SELECT 'followups: ' || COUNT(*) FROM followups
        UNION ALL
        SELECT 'finance_sync_logs: ' || COUNT(*) FROM finance_sync_logs
        UNION ALL
        SELECT 'audit_logs: ' || COUNT(*) FROM audit_logs
      " 2>/dev/null || echo "报告生成失败"
    
    echo ""
    echo "金额汇总："
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" \
      -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "
        SELECT 'Orders Total: ' || COALESCE(SUM(total_price), 0) FROM orders
      " 2>/dev/null || echo "报告生成失败"
    
    echo ""
    echo "============================================"
  } | tee "$REPORT_FILE"
  
  print_success "报告已生成: $REPORT_FILE"
}

# ============================================================================
# 主流程
# ============================================================================

main() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║   数据库迁移自动化脚本                 ║${NC}"
  echo -e "${BLUE}║   car-film-mini-program                ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
  echo ""
  
  print_status "开始迁移流程..."
  echo ""
  
  # 步骤 1: 验证前置条件
  if ! check_postgres; then
    print_error "迁移中止"
    exit 1
  fi
  
  if ! check_scripts; then
    print_error "迁移中止"
    exit 1
  fi
  
  # 步骤 2: 创建数据库
  create_database
  
  # 步骤 3: 执行迁移脚本
  echo ""
  print_status "执行迁移脚本（5个阶段）..."
  echo ""
  
  run_migration_script "001-init-schema.sql" "01. 初始化表结构" || exit 1
  run_migration_script "002-migrate-users.sql" "02. 迁移用户数据" || exit 1
  run_migration_script "003-migrate-orders.sql" "03. 迁移订单数据" || exit 1
  run_migration_script "004-migrate-finance.sql" "04. 迁移财务日志" || exit 1
  run_migration_script "005-post-migration-index.sql" "05. 性能优化索引" || exit 1
  
  # 步骤 4: 生成报告
  echo ""
  generate_report
  
  # 步骤 5: 总结
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   ✓ 迁移完成                           ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
  echo ""
  
  print_success "日志已保存: $LOG_FILE"
  print_success "报告已保存: $REPORT_FILE"
  
  echo ""
  print_status "后续步骤："
  echo "  1. 查看报告: cat $REPORT_FILE"
  echo "  2. 验证数据: psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB"
  echo "  3. 运行校验: python3 reconcile_db_vs_json.py --dsn postgresql://..."
  echo ""
}

# ============================================================================
# 错误处理
# ============================================================================

trap 'print_error "迁移因错误中止，查看日志: $LOG_FILE"' ERR

# ============================================================================
# 执行
# ============================================================================

# 重定向所有输出到日志和终端
mkdir -p "$(dirname "$LOG_FILE")"
main "$@"
