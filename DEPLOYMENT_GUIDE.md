# 蔚蓝工单系统 - 开发与部署指南

## 📋 目录

1. [本地开发环境](#本地开发环境)
2. [小程序开发](#小程序开发)
3. [生产部署](#生产部署)
4. [故障排查](#故障排查)
5. [维护与备份](#维护与备份)

---

## 本地开发环境

### 快速启动

```bash
# 一键启动所有服务
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program
bash START_SYSTEM.sh
```

### 手动启动

#### 1. 启动PostgreSQL容器
```bash
alias docker='/Applications/Docker.app/Contents/Resources/bin/docker'
docker run --name postgres-slim \
  -e POSTGRES_PASSWORD=<YOUR_POSTGRES_PASSWORD> \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  -d postgres:15
```

#### 2. 启动后端服务
```bash
cd /Users/yushuai/Documents/Playground/养龙虾/backend
source ../.venv/bin/activate
INTERNAL_API_TOKEN="<YOUR_INTERNAL_API_TOKEN>" \
  uvicorn app.main:app --host 0.0.0.0 --port 8000
```

#### 3. 验证服务
```bash
# 检查API
curl -s http://127.0.0.1:8000/api/v1/store/internal/orders \
  -H "Authorization: Bearer <YOUR_INTERNAL_API_TOKEN>" | python3 -m json.tool

# 系统健康检查
bash HEALTH_CHECK.sh
```

---

## 小程序开发

### 开发环境配置

**文件**: `config/finance.config.js`

```javascript
// 自动使用 localhost:8000 (开发环境)
const ENV_BASE_URL = {
  develop: 'http://127.0.0.1:8000',  // ← 自动使用
  trial: 'https://your-domain.com',
  release: 'https://your-domain.com'
};
```

### 在微信开发者工具中开发

1. **打开项目**
   ```
  项目路径: /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program
   ```

2. **配置代理域名（可选）**
   - 详情 → 本地设置
   - 勾选 "不校验合法域名、web-view..."
   - 这样允许 http://127.0.0.1 用于开发

3. **编译或预览**
   - Mac: Cmd+Shift+P
   - Windows: Ctrl+Shift+P

4. **查看日志**
   - 工具 → 开发者工具 → 控制台
   - 查看网络请求和错误信息

### 常用页面

| 页面 | 文件 | 用途 |
|------|------|------|
| 订单列表 | pages/order-list/order-list | 查看所有订单 |
| 订单详情 | pages/order-detail/order-detail | 编辑订单信息 |
| 创建订单 | pages/film-order/film-order | 创建新订单 |
| 派工管理 | pages/dispatch-board/dispatch-board | 分配技师 |
| 追踪提醒 | pages/followup-reminder/followup-reminder | 客户跟进 |

---

## 生产部署

> 标准发布入口请优先参考：`docs/统一发布流程.md`

### 前置条件

1. **云服务器** (推荐阿里云、腾讯云)
   - OS: Linux (Ubuntu 20.04 或以上)
   - CPU: 2核+
   - RAM: 4GB+
   - 存储: 100GB+

2. **域名和HTTPS**
   - 已备案的域名
   - SSL证书 (可用Let's Encrypt免费获取)
   - 配置DNS指向服务器IP

3. **安装依赖**
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install -y python3 python3-pip postgresql-client
   pip3 install psycopg
   
   # Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```

### 部署步骤

#### 推荐：一键发布脚本（本地执行）

```bash
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program

export DEPLOY_HOST="your-server-ip"
export DEPLOY_USER="your-ssh-user"
export INTERNAL_API_TOKEN="<YOUR_INTERNAL_API_TOKEN>"
export DOMAIN="your-domain.com"   # 可选，但建议填写用于公网验活

# 如果数据库在云上（RDS/独立DB主机），额外设置：
# export USE_EXTERNAL_DB=1
# export POSTGRES_HOST="your-db-host"
# export POSTGRES_PORT="5432"
# export POSTGRES_DB="slim"
# export POSTGRES_USER="postgres"

bash DEPLOY_PRODUCTION.sh
```

说明：
- 脚本会先检查本地代码并 `git push origin main`（可用 `--no-push` 跳过）。
- 远端会自动 `git pull`、创建/复用虚拟环境、安装依赖、写入 `systemd`、重启服务并做 `/health` 验活。
- 数据库准备（RDS 或自建 PostgreSQL）需要提前完成，并通过 `DATABASE_URL` 或 `DB_*` 变量提供连接信息。
- 若远端仓库目录有未提交改动，脚本会停止，避免覆盖线上手工改动。

#### 发布前一键检查（建议先执行）

```bash
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program
export INTERNAL_API_TOKEN="<YOUR_INTERNAL_API_TOKEN>"
export BASE_URL="http://127.0.0.1:8000"
MODE=release bash scripts/release_preflight.sh
```

说明：
- 该脚本会自动执行接口连通检查与 `scripts/smoke_api.sh`。
- 通过后再执行 `DEPLOY_PRODUCTION.sh`，可降低发布失败风险。

#### Step 1: 上传项目
```bash
# 在你的开发机上
scp -r /Users/yushuai/Documents/Playground/养龙虾 \
  user@your-server:/opt/ylx

ssh user@your-server
cd /opt/ylx
```

#### Step 2: 启动PostgreSQL（推荐用Docker）
```bash
docker run --name postgres-slim \
  -e POSTGRES_PASSWORD=your_secure_password \
  -p 5432:5432 \
  -v /data/postgres:/var/lib/postgresql/data \
  -d postgres:15

# 初始化数据库
python3 admin-console/sql/migrations/delivery/init-db.py
python3 admin-console/sql/migrations/delivery/migrate-all-data.py
```

#### Step 3: 启动后端（使用systemd）
```bash
# 创建systemd服务文件
sudo tee /etc/systemd/system/ylx-backend.service << EOF
[Unit]
Description=YLX Unified Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ylx/backend
Environment="INTERNAL_API_TOKEN=your_secure_token"
Environment="DB_HOST=localhost"
Environment="DB_PORT=5432"
Environment="DB_USER=postgres"
Environment="DB_PASSWORD=your_secure_password"
Environment="DB_NAME=slim"
ExecStart=/opt/ylx/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable ylx-backend
sudo systemctl start ylx-backend
```

#### Step 4: 配置Nginx反向代理
```bash
sudo tee /etc/nginx/sites-available/car-film << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    
    # 自动跳转HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL证书（用Let's Encrypt）
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # 代理到后端
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/car-film /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Step 5: 生成SSL证书（Let's Encrypt）
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
```

#### Step 6: 更新小程序配置
修改 `config/finance.config.js`:
```javascript
const ENV_BASE_URL = {
  develop: 'http://127.0.0.1:8000',
  trial: 'https://your-domain.com',     // ← 体验版
  release: 'https://your-domain.com'    // ← 正式版
};
```

#### Step 7: 验证部署
```bash
# 检查服务状态
sudo systemctl status ylx-backend

# 测试API
curl https://your-domain.com/api/v1/store/internal/orders \
  -H "Authorization: Bearer <YOUR_INTERNAL_API_TOKEN>"

# 查看日志
sudo journalctl -u ylx-backend -f
```

---

## 故障排查

### PostgreSQL问题

**问题**: Cannot connect to PostgreSQL
```bash
# 检查容器
docker ps | grep postgres-slim

# 重启容器
docker restart postgres-slim

# 查看日志
docker logs postgres-slim
```

**问题**: Database locked / Transaction timeout
```bash
# 连接到数据库
docker exec -it postgres-slim psql -U postgres slim

# 检查活跃连接
SELECT * FROM pg_stat_activity;

# 优雅关闭超时连接
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE datname = 'slim' AND pid != pg_backend_pid();
```

### 后端服务问题

**问题**: Port 8000 already in use
```bash
lsof -i :8000 | grep Python | awk '{print $2}' | xargs kill -9
```

**问题**: 500 Internal Server Error
```bash
# 检查服务日志
tail -50 /tmp/car_film_server.log

# 查看详细堆栈跟踪
# 在server.py中添加: import traceback; traceback.print_exc()
```

**问题**: API 返回 401 Unauthorized
```bash
# 确保token正确
Authorization: Bearer <YOUR_INTERNAL_API_TOKEN>

# 或设置环境变量
export INTERNAL_API_TOKEN="your-token"
python3 admin-console/server.py
```

### 小程序问题

**问题**: 小程序无法连接到后端
- 确保后端正在运行: `sudo systemctl status ylx-backend`
- 确保防火墙允许HTTPS (443端口): `sudo ufw allow 443`
- 检查DNS: `nslookup your-domain.com`
- 在微信开发者工具中启用"使用HTTP代理"进行调试

**问题**: 数据加载缓慢
- 增加数据库连接数: 修改 `server.py` 中的连接池大小
- 添加数据库索引: 执行 `005-post-migration-index.sql`
- 使用CDN加速静态资源

---

## 维护与备份

### 定期备份

```bash
# 每日备份（放入crontab）
0 2 * * * bash /opt/ylx/BACKUP_DATABASE.sh /backups

# 或手动备份
bash BACKUP_DATABASE.sh /backups
```

### 恢复数据

```bash
bash RESTORE_DATABASE.sh /backups/slim_backup_20260308_172105.sql
```

### 性能监控

```bash
# 执行健康检查
bash HEALTH_CHECK.sh

# 监控数据库大小
docker exec postgres-slim psql -U postgres slim -c \
  "SELECT pg_size_pretty(pg_database_size('slim'))"

# 监控后端进程
# 在生产环境中使用: Prometheus + Grafana
```

### 升级与维护

```bash
# 检查PostgreSQL版本
docker exec postgres-slim psql -U postgres --version

# 升级Python依赖
pip3 install --upgrade psycopg requests

# 检查代码更新
cd /opt/ylx
git status
git pull  # 如果使用Git版本控制
```

---

## 环境变量参考

### 后端配置

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| INTERNAL_API_TOKEN | API认证token | "" | <YOUR_INTERNAL_API_TOKEN> |
| ENABLE_DB_STORAGE | 启用数据库存储 | True | 1 或 true |
| POSTGRES_HOST | 数据库主机 | 127.0.0.1 | localhost |
| POSTGRES_PORT | 数据库端口 | 5432 | 5432 |
| POSTGRES_DB | 数据库名 | slim | slim |
| POSTGRES_USER | 数据库用户 | postgres | postgres |
| POSTGRES_PASSWORD | 数据库密码 | "" | your_password |

### 小程序配置

修改 `config/finance.config.js`:
```javascript
const financeConfig = {
  enabled: true,
  mockMode: false,
  baseUrl: '',  // 留空，自动选择开发/测试/正式环境
  apiToken: '<YOUR_INTERNAL_API_TOKEN>',
  extraHeaders: {},
  timeout: 10000
};
```

---

## 支持与反馈

- 遇到问题？查看 [MIGRATION_COMPLETE.md](./MIGRATION_COMPLETE.md)
- 需要帮助？查看各个脚本的注释
- 想贡献代码？提交Pull Request

---

**上次更新**: 2026-03-08
**状态**: ✅ 生产就绪
