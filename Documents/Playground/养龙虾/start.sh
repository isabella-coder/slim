#!/bin/bash

# 养龙虾系统 - 一键启动脚本

set -e

PROJECT_NAME="养龙虾"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║           🚀 ${PROJECT_NAME} - 多渠道客资接入中台系统                 ║"
echo "║                     快速启动脚本                                     ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 步骤 1: 检查 Docker
echo -e "${YELLOW}[1] 检查 Docker 环境...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker 已就绪${NC}"

# 步骤 2: 启动数据库
echo ""
echo -e "${YELLOW}[2] 启动 PostgreSQL 数据库...${NC}"
cd "$PROJECT_DIR/backend"

if docker-compose ps | grep -q "postgres"; then
    echo -e "${GREEN}✓ 数据库已在运行${NC}"
else
    echo "启动 PostgreSQL 容器..."
    docker-compose up -d
    
    # 等待数据库就绪
    echo "等待数据库初始化..."
    sleep 5
    
    echo -e "${GREEN}✓ 数据库已启动${NC}"
fi

# 步骤 3: 检查 Python 环境
echo ""
echo -e "${YELLOW}[3] 检查 Python 环境...${NC}"

if [ ! -d ".venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv .venv
fi

# 激活虚拟环境
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
else
    echo -e "${RED}✗ Python 虚拟环境激活失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Python 环境已配置${NC}"

# 步骤 4: 安装 Python 依赖
echo ""
echo -e "${YELLOW}[4] 检查/安装 Python 依赖...${NC}"

if pip show fastapi > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 依赖已安装${NC}"
else
    echo "安装 Python 依赖..."
    pip install -q -r requirements.txt
    echo -e "${GREEN}✓ 依赖安装完毕${NC}"
fi

# 步骤 5: 验证数据库连接
echo ""
echo -e "${YELLOW}[5] 验证数据库连接...${NC}"

PYTHONPATH=$PROJECT_DIR/backend python3 << 'EOF'
import sys
try:
    from app.db import get_db, init_db
    from sqlalchemy import create_engine
    import os
    
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5432')
    db_user = os.getenv('DB_USER', 'xls_admin')
    db_password = os.getenv('DB_PASSWORD', 'xls_admin_2024')
    db_name = os.getenv('DB_NAME', 'xls_db')
    
    database_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    engine = create_engine(database_url)
    
    with engine.connect() as conn:
        pass
    
    # 初始化数据库
    init_db()
    
    print("✓ 数据库连接成功")
except Exception as e:
    print(f"✗ 数据库连接失败: {e}", file=sys.stderr)
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ 数据库验证失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 数据库验证通过${NC}"

# 步骤 6: 显示启动说明
echo ""
echo -e "${YELLOW}[6] 系统准备完毕！${NC}"
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                      📋 启动应用                                      ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}方式 1：启动 FastAPI 后端${NC}"
echo "  $ cd backend"
echo "  $ source .venv/bin/activate"
echo "  $ python app/main.py"
echo ""
echo "  访问: http://127.0.0.1:8000"
echo "  API 文档: http://127.0.0.1:8000/docs"
echo ""
echo -e "${GREEN}方式 2：启动 Admin Vue3 前端${NC}"
echo "  $ cd admin"
echo "  $ npm install  # 首次执行"
echo "  $ npm run dev"
echo ""
echo "  访问: http://localhost:3000"
echo ""
echo -e "${GREEN}方式 3：完整启动（需要两个终端）${NC}"
echo "  终端 1:"
echo "    $ cd backend && source .venv/bin/activate && python app/main.py"
echo ""
echo "  终端 2:"
echo "    $ cd admin && npm run dev"
echo ""
echo "  然后访问: http://localhost:3000"
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                    🧪 快速测试命令                                     ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "创建线索:"
echo '  curl -X POST http://localhost:8000/api/v1/leads \'
echo '    -H "Content-Type: application/json" \'
echo '    -d '"'"'{
echo '    "customer_nickname": "小王",
echo '    "car_model": "理想 ONE",
echo '    "service_type": "洗护",
echo '    "budget_range": "500-1000",
echo '    "platform": "douyin",
echo '    "account_code": "DY-BOP-001"
echo '  }'"'"
echo ""
echo "查询线索:"
echo '  curl http://localhost:8000/api/v1/leads?store_code=BOP'
echo ""
echo "查看统计:"
echo '  curl http://localhost:8000/api/v1/stats/daily?date=2025-03-09'
echo ""
echo "📚 更多信息请查看: QUICKSTART.md"
echo ""
echo -e "${GREEN}✓ 准备就绪！${NC}"
echo ""
