# 🚀 云服务器自动化部署脚本

> ⚠️ Legacy 文档：本页描述的是 `admin-console:8080` 兼容部署链路。
> 统一发布请使用 `car-film-mini-program/DEPLOY_PRODUCTION.sh`（`8000` 后端）并参见 `car-film-mini-program/docs/统一发布流程.md`。
> 本文件为历史归档，以下命令可能已过期，不保证可直接执行。

> 历史说明：旧流程曾通过本文件记录一键部署步骤。

## 准备工作

在运行脚本前，您需要有：
1. ✅ 一台云服务器 (Ubuntu 20.04)
2. ✅ 服务器的公网 IP 地址
3. ✅ SSH 连接信息 (用户名、密码或密钥)
4. ✅ 一个域名 (可选，但建议有)

## 快速开始（推荐方式）

### 方式 A：使用自动化脚本部署（最简单）

```bash
# 在您本地电脑上执行

# 1. 设置环境变量
export DEPLOY_HOST="your.server.ip"           # 例: 47.98.123.45
export DEPLOY_USER="ubuntu"                   # 例: ubuntu (默认值)
export DEPLOY_PASSWORD="your_ssh_password"    # 例: 您的连接密码
export INTERNAL_API_TOKEN="dev-test-token-2026"
export POSTGRES_PASSWORD="your_secure_db_pass" # 例: Xy9#kL2$mN7@pQr1
export DOMAIN="your-domain.com"               # 例: film.yourcompany.com (可选)

# 2. 执行部署
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program
bash DEPLOY.sh   # 历史示例：当前 DEPLOY.sh 已默认阻断执行

# 脚本将自动：
# ✅ 连接到服务器
# ✅ 安装依赖
# ✅ 启动 PostgreSQL
# ✅ 迁移数据
# ✅ 配置 Nginx
# ✅ 配置 SSL
# ✅ 启动服务
# ✅ 验证部署
```

### 方式 B：手动分步部署（有问题时用）

如果自动化脚本失败，按下面步骤手动部署。

---

## 手动分步部署指南

### Step 1: SSH 连接到服务器

```bash
# 使用密码连接
ssh ubuntu@your.server.ip
# 输入密码后进入服务器

# 或者使用密钥对连接
ssh -i /path/to/your/key.pem ubuntu@your.server.ip
```

### Step 2: 更新系统

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y wget curl git
```

### Step 3: 安装依赖

```bash
# Python 和 pip
sudo apt install -y python3 python3-pip python3-venv

# Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Nginx
sudo apt install -y nginx

# Certbot (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx

# PostgreSQL 客户端
sudo apt install -y postgresql-client

# Supervisor (进程管理)
sudo apt install -y supervisor
```

### Step 4: 上传项目代码

在本地机器执行：
```bash
# 方式 1: 使用 scp 上传
scp -r /Users/yushuai/Documents/Playground/car-film-mini-program \
  ubuntu@your.server.ip:/opt/

# 方式 2: 使用 git clone (如果已 push 到仓库)
ssh ubuntu@your.server.ip
cd /opt
git clone https://your-repo-url.git car-film-mini-program
```

### Step 5: 启动 PostgreSQL

在服务器上运行：
```bash
# 创建数据目录
sudo mkdir -p /data/postgres
sudo chown -R 999:999 /data/postgres

# 启动 PostgreSQL 容器
docker run --name postgres-slim \
  -e POSTGRES_PASSWORD=your_secure_password \
  -p 5432:5432 \
  -v /data/postgres:/var/lib/postgresql/data \
  -d postgres:15

# 验证
docker ps | grep postgres
```

### Step 6: 初始化数据库和迁移数据

在服务器上运行：
```bash
cd /opt/car-film-mini-program

# 初始化数据库
python3 admin-console/sql/migrations/delivery/init-db.py

# 迁移数据
python3 admin-console/sql/migrations/delivery/migrate-all-data.py

# 验证
psql -h 127.0.0.1 -U postgres -d slim -c "SELECT COUNT(*) FROM orders;"
# 应该返回 25
```

### Step 7: 配置后端服务

创建 systemd 服务：
```bash
sudo tee /etc/systemd/system/car-film.service << 'EOF'
[Unit]
Description=Car Film Mini Program Backend
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/car-film-mini-program
Environment="INTERNAL_API_TOKEN=your_secure_token"
Environment="POSTGRES_PASSWORD=your_secure_db_password"
Environment="POSTGRES_HOST=127.0.0.1"
ExecStart=/usr/bin/python3 /opt/car-film-mini-program/admin-console/server.py
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable car-film
sudo systemctl start car-film

# 检查状态
sudo systemctl status car-film
sudo journalctl -u car-film -n 50 -f  # 查看日志

# 验证 API
curl -s http://127.0.0.1:8080/api/v1/internal/orders \
  -H "Authorization: Bearer your_secure_token" | head -20
```

### Step 8: 配置 Nginx 反向代理

```bash
# 创建 Nginx 配置
sudo tee /etc/nginx/sites-available/car-film << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    
    # 自动跳转 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL 证书路径（后面配置）
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # 应用设置
    application/json;
    
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/car-film /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### Step 9: 配置 SSL 证书 (Let's Encrypt)

```bash
# 生成 SSL 证书 (自动续约)
sudo certbot certonly --nginx -d your-domain.com

# 自动续约验证
sudo certbot renew --dry-run

# 如果出错，设置每周自动续约
sudo tee /etc/cron.weekly/certbot-renewal << 'EOF'
#!/bin/bash
/usr/bin/certbot renew --quiet
EOF
sudo chmod +x /etc/cron.weekly/certbot-renewal

# 验证 HTTPS
curl -s https://your-domain.com/api/v1/internal/orders \
  -H "Authorization: Bearer your_secure_token" \
  -k | head -20  # -k 跳过 SSL 验证（仅用于测试）
```

### Step 10: 配置防火墙

```bash
# 开放必要端口
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 5432/tcp  # 可选：PostgreSQL（仅内部）
sudo ufw enable
```

### Step 11: 配置域名 DNS

在您的域名注册商（如阿里云、腾讯云等）：
1. 登录域名管理后台
2. 找到 DNS 解析
3. 添加 A 记录：
   ```
   记录类型: A
   主机记录: @ (或 www)
   记录值: your.server.ip
   TTL: 600
   ```
4. 等待 DNS 生效 (通常 5-10 分钟)

验证 DNS：
```bash
nslookup your-domain.com
dig your-domain.com
```

---

## 配置小程序

修改 `config/finance.config.js`:
```javascript
const ENV_BASE_URL = {
  develop: 'http://127.0.0.1:8080',        // 本地开发
  trial: 'https://your-domain.com',        // 体验版
  release: 'https://your-domain.com'       // 正式版
};
```

在微信小程序后台配置服务器域名：
1. 登录微信公众平台
2. 小程序 → 设置 → 开发设置
3. 服务器域名：
   ```
   https://your-domain.com
   ```
4. 上传 SSL 证书（让我安全的密钥）

---

## 验证部署成果

```bash
# 1. 检查服务状态
sudo systemctl status car-film
sudo systemctl status nginx

# 2. 测试 API
curl https://your-domain.com/api/v1/internal/orders \
  -H "Authorization: Bearer your_secure_token"

# 3. 检查日志
sudo journalctl -u car-film -n 100 -f
tail -100 /var/log/nginx/error.log

# 4. 检查数据库
docker exec postgres-slim psql -U postgres -d slim -c \
  "SELECT COUNT(*) as count FROM orders;"
```

---

## 故障排查

### 问题 1: API 无法连接
```bash
# 检查服务是否运行
sudo systemctl status car-film

# 检查端口监听
sudo lsof -i :8080

# 查看日志
sudo journalctl -u car-film -n 50
```

### 问题 2: Nginx 反向代理失败
```bash
# 测试 Nginx 配置
sudo nginx -t

# 查看 Nginx 错误日志
tail -50 /var/log/nginx/error.log

# 重启 Nginx
sudo systemctl restart nginx
```

### 问题 3: 数据库连接失败
```bash
# 检查 Docker
docker ps | grep postgres

# 测试数据库连接
psql -h 127.0.0.1 -U postgres -d slim -c "SELECT 1;"

# 查看 Docker 日志
docker logs postgres-slim
```

### 问题 4: SSL 证书失败
```bash
# 检查证书状态
sudo certbot certificates

# 手动更新证书
sudo certbot renew --force-renewal

# 重启 Nginx
sudo systemctl restart nginx
```

---

## 性能优化（可选，后续做）

```bash
# 1. 启用 Gzip 压缩
sudo tee -a /etc/nginx/nginx.conf << 'EOF'
gzip on;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript;
EOF

# 2. 增加 PHP-FPM worker 数 (如果用 PHP)
# 3. 启用 Redis 缓存层
# 4. 配置 CDN
```

---

## 定期维护

```bash
# 每周更新系统
sudo apt update && sudo apt upgrade -y

# 每月备份数据库
bash /opt/car-film-mini-program/BACKUP_DATABASE.sh

# 每周检查日志
tail -100 /var/log/nginx/error.log

# 每月检查磁盘空间
df -h
```

---

## 成功标志

部署成功后，您应该能够：
✅ 访问 `https://your-domain.com/api/v1/internal/orders` 返回 25 条订单
✅ HTTPS 证书有效（绿色锁标志）
✅ 微信小程序能连接到 API
✅ 小程序显示 25 条订单
✅ 能够创建、编辑、删除订单

---

## 下一步

部署完成后，您可以：
1. 在微信小程序商城上线
2. 配置支付接口（微信支付）
3. 配置短信发送（验证码）
4. 启用监控和告警
5. 定期备份数据库

---

**部署过程中有问题？告诉我错误信息，我来帮您排查！**
