# 🎯 云服务器正式部署 - 完整清单

> 按照这份清单，您可以在 **2-3 小时内** 完成生产环境部署

---

## 📋 部署五大阶段

### 🟦 第 1 阶段：准备工作 (30 分钟)

#### 检查列表
- [ ] ✅ 本地项目测试成功 (已完成)
- [ ] ⏳ 选购云服务器 (阿里云或腾讯云)
- [ ] ⏳ 购买域名 (可选，但推荐)
- [ ] ⏳ 记录服务器信息 (IP、用户、密码)

#### 您需要的信息
```
┌─ 云服务器信息
├─ 公网 IP:        [等待您提供]
├─ SSH 用户:       [通常是 ubuntu]
├─ SSH 密码:       [您的密码]
└─ 地域:          [您选择的地域]

┌─ 域名信息 (可选)
├─ 域名:          [等待 - 可选]
├─ 备案状态:       [国内需要备案]
└─ 域名注册商:     [阿里云/腾讯云等]

┌─ API 配置
├─ INTERNAL_API_TOKEN: [自己设置，例: your-secret-token-2026]
├─ DATABASE_URL:       [建议填写，例: postgresql+psycopg://user:pass@host:5432/dbname]
└─ DOMAIN:            [您的域名，例: film.yourcompany.com]
```

**现在就做**: 
1. 打开浏览器
2. 点击 [CLOUD_PURCHASE_GUIDE.md](./CLOUD_PURCHASE_GUIDE.md) 
3. 按照指南购买云服务器

---

### 🟩 第 2 阶段：环境配置 (30-45 分钟) - 自动化

**前置**: 已购买云服务器并记录 IP 和登录信息

#### 执行自动化部署脚本

```bash
# 第 1 步：在本地电脑上，设置环境变量
export DEPLOY_HOST="47.98.123.45"                    # ← 改成您的服务器 IP
export DEPLOY_USER="ubuntu"                          # ← 改成您的 SSH 用户名
export INTERNAL_API_TOKEN="your-secret-token-2026"  # ← 修改为秘密 token
export DATABASE_URL="postgresql+psycopg://user:pass@host:5432/dbname" # ← 建议配置
export DOMAIN="film.yourcompany.com"                # ← 改成您的域名 (可选)

# 第 2 步：执行部署脚本（统一后端 8000）
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program
bash DEPLOY_PRODUCTION.sh

# 脚本将自动执行:
# ✅ SSH 连接到服务器
# ✅ 远端拉取最新代码 (git pull)
# ✅ 创建/复用 Python 虚拟环境
# ✅ 安装后端依赖 (requirements.txt)
# ✅ 写入 systemd 环境文件
# ✅ 启动后端 API 服务
# ✅ 执行 /health 验活
```

**如果脚本成功**: ✅ 跳到第 3 阶段
**如果脚本失败**: 📖 先看 [统一发布流程](./docs/统一发布流程.md) 的故障排查

#### 检查列表
- [ ] 脚本运行成功
- [ ] 无 ERROR 提示
- [ ] 后端服务启动成功 (`ylx-backend`)
- [ ] `/health` 返回 200
- [ ] 业务接口能正常返回数据

---

### 🟨 第 3 阶段：域名配置 (15-30 分钟)

**前置**: 已购买域名 (如果跳过此步，可用 IP 地址临时访问)

#### DNS 配置

1. **登录域名管理平台** (阿里云/腾讯云)
2. **找到 DNS 解析**
3. **添加 A 记录**:
   ```
   主机记录: @ (或 www)
   记录类型: A
   记录值: 您的服务器IP (例: 47.98.123.45)
   TTL: 600 秒
   ```
4. **保存**
5. **等待 DNS 生效** (通常 5-10 分钟，最多 48 小时)

#### 验证 DNS

```bash
# 等 DNS 生效后，在本地运行:
nslookup your-domain.com
# 应该显示您的服务器 IP

dig your-domain.com
# 应该显示 A 记录指向您的 IP
```

#### 检查列表
- [ ] DNS 记录已添加
- [ ] DNS 已生效 (nslookup 返回正确 IP)
- [ ] 可用 ping 命令验证
- [ ] HTTPS 证书自动申请成功

---

### 🟦 第 4 阶段：小程序配置 (15 分钟)

**前置**: 域名 DNS 已生效 (或使用 IP 地址)

#### 更新小程序配置

1. **编辑文件**: `config/finance.config.js`

```javascript
// 修改这部分
const ENV_BASE_URL = {
  develop: 'http://127.0.0.1:8000',                    // 本地开发
  trial: 'https://your-domain.com',                    // ← 改成您的域名
  release: 'https://your-domain.com'                   // ← 改成您的域名
};

// 或如果没有域名，用 IP:
const ENV_BASE_URL = {
  develop: 'http://127.0.0.1:8000',
  trial: 'https://47.98.123.45',                      // ← 用 IP 代替
  release: 'https://47.98.123.45'
};
```

2. **提交代码到服务器**:
```bash
# 在本地电脑上
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program
git add config/finance.config.js
git commit -m "Update API endpoint to production"
git push origin main

# 在服务器上拉取最新代码
ssh ubuntu@your.server.ip
cd /opt/ylx
git pull origin main
sudo systemctl restart ylx-backend
```

3. **在微信公众平台配置**:
   - 登录 https://mp.weixin.qq.com 
   - 开发 → 开发设置
   - 服务器域名 → 修改
   - 添加域名: `your-domain.com`
   - 上传 SSL 证书文件 (位置: `/etc/letsencrypt/live/your-domain.com/`)
   - 保存

#### 检查列表
- [ ] 小程序配置文件已更新
- [ ] 代码已上传到服务器
- [ ] 后端服务已重启
- [ ] 微信小程序后台已配置服务器域名

---

### 🟩 第 5 阶段：功能验证与上线 (30 分钟)

#### 验证 API 连接

```bash
# 在本地或服务器上测试
# 使用域名
curl https://your-domain.com/api/v1/store/internal/orders \
  -H "Authorization: Bearer your-secret-token-2026" \
  -H "Content-Type: application/json"

# 或使用 IP
curl https://47.98.123.45/api/v1/store/internal/orders \
  -H "Authorization: Bearer your-secret-token-2026" \
  -H "Content-Type: application/json" \
  -k  # -k 跳过 SSL 验证（仅用于 IP 测试）

# 应该返回类似:
{
  "success": true,
  "items": [
    { "order_id": "TEST20260305001", ... },
    { "order_id": "TEST20260305002", ... },
    ...
  ]
}
```

#### 在微信开发者工具中测试

1. **打开微信开发者工具**
2. **导入项目** (本地项目)
3. **编译或预览**
4. **导航到订单列表页**
5. **观察**:
   - ✅ 页面能加载
   - ✅ 网络请求能发送 (看 Network 面板)
   - ✅ 25 条订单能显示
   - ✅ API 返回正确数据

#### 在真实手机上测试

1. **在微信开发者工具中生成预览二维码**
2. **用微信扫描二维码**
3. **体验版小程序打开**
4. **验证功能**:
   - ✅ 订单列表能加载
   - ✅ 可以进入订单详情
   - ✅ 可以创建新订单
   - ✅ 可以派工和完工

#### 检查清单
- [ ] API 返回正确的 JSON 数据
- [ ] HTTPS 证书有效 (绿色锁标志)
- [ ] 小程序能连接 API
- [ ] 小程序显示 25 条订单
- [ ] CRUD 操作都能正常进行
- [ ] 数据实时同步

---

## 🎉 部署成功的标志

如果您看到以下情况，恭喜！部署成功了！🎊

```
✅ 网络
   - HTTPS 证书有效 (绿色锁)
   - 域名能正常访问
   - DNS 指向正确

✅ 数据库
   - PostgreSQL 容器运行中
   - 20 个用户，25 个订单，12 条日志
   - 数据完整无误

✅ 后端 API
   - 能返回 25 条订单
   - 响应时间 < 100ms
   - 无错误日志

✅ 小程序
   - 能连接到 API
   - 能显示订单列表
   - 能执行 CRUD 操作
   - 网络请求正常

✅ 上线条件
   - 所有以上都满足
   - 已做基础安全检查
   - 已备份数据库
   - 已配置监控告警
```

---

## 📞 部署卡住了？

### 编译失败
→ 参考 `docs/统一发布流程.md` 的故障排查

### API 无法连接
→ 运行 `sudo systemctl status ylx-backend` 看后端服务状态

### HTTPS 证书申请失败
→ 检查 DNS 是否生效、域名是否正确

### 数据库无法连接
→ 运行 `docker ps` 看 PostgreSQL 是否运行

---

## 🚀 部署命令总结

### 快速启动脚本
```bash
# 本地启动开发环境
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program
bash START_SYSTEM.sh

# 生产环境部署 (在本地执行，远端自动部署)
bash DEPLOY_PRODUCTION.sh
```

### 快速验证脚本
```bash
# 本地
bash HEALTH_CHECK.sh

# 远程 (SSH 到服务器)
sudo systemctl status ylx-backend
curl https://your-domain.com/api/v1/store/internal/orders \
  -H "Authorization: Bearer token"
```

### 快速备份脚本
```bash
bash BACKUP_DATABASE.sh
```

---

## 📅 时间估算

| 阶段 | 耗时 | 说明 |
|------|------|------|
| 准备工作 | 30分钟 | 购买云服务器 |
| 环境配置 | 30-45分钟 | 自动化部署脚本 |
| 域名配置 | 15-30分钟 | DNS 生效需要等待 |
| 小程序配置 | 15分钟 | 更新配置文件 |
| 功能验证 | 30分钟 | 测试所有功能 |
| **总计** | **2-3 小时** | 不算 DNS 生效等待时间 |

---

## ✨ 成功框架

```
2026-3-9 本地开发环境 ✅
        ↓
2026-3-9 购买云服务器 ⏳ (您现在在这里)
        ↓
2026-3-10 生产环境部署 ⏳
        ↓
2026-3-10 小程序配置 ⏳
        ↓
2026-3-10 功能验证上线 ⏳
        ↓
2026-3-11 🎉 正式上线！
```

---

## 下一步

👉 **现在就去购买云服务器吧！**

参考: [CLOUD_PURCHASE_GUIDE.md](./CLOUD_PURCHASE_GUIDE.md)

购买完成后，告诉我:
- ✅ 选中的云厂商
- ✅ 服务器公网 IP  
- ✅ SSH 用户名
- ✅ SSH 密码

我会带您完成剩下的所有步骤！

---

**祝您部署顺利！🚀**

如有任何问题，参考 `docs/统一发布流程.md` 的故障排查，或告诉我具体的错误信息。
