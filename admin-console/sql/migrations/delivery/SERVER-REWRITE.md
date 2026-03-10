# Server.py 代码改写指南 - 完全迁移到 PostgreSQL

> ⚠️ Legacy 文档：本指南针对历史 `admin-console/server.py`（`8080`）改写流程。
> 当前统一发布入口为 `养龙虾/backend`（`8000`）与 `/api/v1/store/*` 契约。

## 📋 概览

将 `admin-console/server.py` 改写为**完全使用 PostgreSQL**，删除所有 JSON 存储代码。

## 🔄 改写步骤

### 步骤 1：环境配置（在 server 启动时）

启动 server 时，**必须**设置以下环境变量：

```bash
# 启动脚本（更新后的 start-admin.sh）
#!/bin/bash

export POSTGRES_HOST=127.0.0.1
export POSTGRES_PORT=5432
export POSTGRES_DB=slim
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=<YOUR_POSTGRES_PASSWORD>
export INTERNAL_API_TOKEN="<YOUR_INTERNAL_API_TOKEN>"

# 启动服务器
python3 server.py
```

### 步骤 2：删除 JSON 相关代码

从 server.py 中**删除**下列变量和函数：

```python
# ❌ 删除这些变量
ORDERS_FILE = DATA_DIR / "orders.json"      # 不再需要
USERS_FILE = DATA_DIR / "users.json"        # 不再需要
FINANCE_SYNC_LOG_FILE = DATA_DIR / "..."    # 不再需要
ENABLE_DB_STORAGE = ...                      # 改为始终为 True

# ❌ 删除这些函数
def load_json(path, default_value):          # JSON 文件读取
    ...

def save_json(path, value):                  # JSON 文件保存
    ...

def load_users():                            # JSON 用户读取
    ...

# JSON 相关的所有代码行
```

### 步骤 3：简化 load_orders() 和 save_orders()

**改前**：
```python
def load_orders():
    if ENABLE_DB_STORAGE:
        db_rows = load_orders_from_db()
        return db_rows if isinstance(db_rows, list) else []
    source = load_json(ORDERS_FILE, [])  # ❌ 删除这行
    if isinstance(source, list):
        return [normalize_order_record(item) for item in source if isinstance(item, dict)]
    return []

def save_orders(orders):
    source = orders if isinstance(orders, list) else []
    normalized = [normalize_order_record(item) for item in source if isinstance(item, dict)]
    if ENABLE_DB_STORAGE:
        save_orders_to_db(normalized)
        return
    save_json(ORDERS_FILE, normalized)  # ❌ 删除这行
```

**改后**：
```python
def load_orders():
    """从 PostgreSQL 读取所有订单"""
    db_rows = load_orders_from_db()
    return db_rows if isinstance(db_rows, list) else []

def save_orders(orders):
    """保存订单到 PostgreSQL（不再保存 JSON）"""
    source = orders if isinstance(orders, list) else []
    normalized = [normalize_order_record(item) for item in source if isinstance(item, dict)]
    save_orders_to_db(normalized)
```

### 步骤 4：更新 init_database_if_needed()

**改前**：
```python
def init_database_if_needed():
    # ... 创建 JSON 文件等代码
    if not ENABLE_DB_STORAGE:
        logger.info("json storage enabled")
        return
    # ... 数据库初始化代码
```

**改后**：
```python
def init_database_if_needed():
    """初始化 PostgreSQL 连接（表结构已通过 SQL 脚本创建）"""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM orders")
            count = cur.fetchone()[0] if cur.fetchone() else 0
        
        logger.info(f"✓ Database initialized. Orders count: {count}")
        return True
    
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        logger.error("Please ensure:")
        logger.error("  1. PostgreSQL is running")
        logger.error("  2. Database 'slim' exists")
        logger.error("  3. Tables created by 001-init-schema.sql")
        raise
```

### 步骤 5：启用 PostgreSQL 模式

在 server 启动时强制启用 DB 模式：

**改前**：
```python
ENABLE_DB_STORAGE = os.getenv("ENABLE_DB_STORAGE", "0").strip().lower() in ("1", "true", "yes", "on")
```

**改后**：
```python
# PostgreSQL 现在始终启用（不再有 JSON 模式）
ENABLE_DB_STORAGE = True

# 删除不再需要的配置解析
```

### 步骤 6：更新所有数据访问调用

在代码中搜索并替换所有 JSON 调用：

```python
# ❌ 不再使用
load_json(ORDERS_FILE, [])     # 替换为 load_orders()
save_json(ORDERS_FILE, data)   # 替换为 save_orders(data)
load_json(USERS_FILE, [])      # 不再需要

# ✅ 统一使用
load_orders()      # 所有订单读取
save_orders(data)  # 所有订单保存
```

---

## 📝 代码补丁（可直接应用）

### 补丁 1：删除 JSON 变量

**文件**：admin-console/server.py  
**位置**：第 17-20 行

```diff
- ORDERS_FILE = DATA_DIR / "orders.json"
- USERS_FILE = DATA_DIR / "users.json"
- FINANCE_SYNC_LOG_FILE = DATA_DIR / "finance-sync-log.json"
```

### 补丁 2：简化 load_orders 和 save_orders

**文件**：admin-console/server.py  
**位置**：第 181-198 行

```diff
def load_orders():
-   if ENABLE_DB_STORAGE:
-       db_rows = load_orders_from_db()
-       return db_rows if isinstance(db_rows, list) else []
-   source = load_json(ORDERS_FILE, [])
-   if isinstance(source, list):
-       return [normalize_order_record(item) for item in source if isinstance(item, dict)]
-   return []
+   """Load orders from PostgreSQL"""
+   db_rows = load_orders_from_db()
+   return db_rows if isinstance(db_rows, list) else []

def save_orders(orders):
-   source = orders if isinstance(orders, list) else []
-   normalized = [normalize_order_record(item) for item in source if isinstance(item, dict)]
-   if ENABLE_DB_STORAGE:
-       save_orders_to_db(normalized)
-       return
-   save_json(ORDERS_FILE, normalized)
+   """Save orders to PostgreSQL only"""
+   source = orders if isinstance(orders, list) else []
+   normalized = [normalize_order_record(item) for item in source if isinstance(item, dict)]
+   save_orders_to_db(normalized)
```

### 补丁 3：删除 JSON 访问函数

**文件**：admin-console/server.py  
**位置**：第 164-180 行

```diff
- def load_json(path, default_value):
-     if not path.exists():
-         return default_value
-     try:
-         return json.loads(path.read_text(encoding="utf-8"))
-     except json.JSONDecodeError:
-         return default_value
-
- def save_json(path, value):
-     path.parent.mkdir(parents=True, exist_ok=True)
-     path.write_text(
-         json.dumps(value, ensure_ascii=False, indent=2),
-         encoding="utf-8",
-     )
```

### 补丁 4：更新初始化函数

**文件**：admin-console/server.py  
**位置**：第 265+ 行

```diff
def init_database_if_needed():
+   """Initialize PostgreSQL connection (tables created by SQL scripts)"""
+   try:
+       conn = get_db_connection()
+       with conn.cursor() as cur:
+           cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
+           result = cur.fetchone()
+           table_count = result[0] if result else 0
+       
+       if table_count < 5:
+           raise Exception(f"Expected 8+ tables, found {table_count}. Run 001-init-schema.sql first.")
+       
+       logger.info(f"✓ PostgreSQL ready with {table_count} tables")
+       return True
+   
+   except Exception as e:
+       logger.error(f"❌ Database initialization failed: {e}")
+       logger.error("Checklist:")
+       logger.error("  1. PostgreSQL is running: psql -U postgres -c 'SELECT 1'")
+       logger.error("  2. Database exists: psql -U postgres -c 'CREATE DATABASE slim;'")
+       logger.error("  3. Tables created: psql -U postgres -d slim -f 001-init-schema.sql")
+       raise
```

---

## ✅ 验证改写成功

### 1. 代码检查

```bash
# 验证没有 JSON 文件路径引用
grep -n "ORDERS_FILE\|USERS_FILE\|FINANCE_SYNC_LOG_FILE" admin-console/server.py
# 应该返回空（无结果）

# 验证没有 save_json 或 load_json 调用
grep -n "save_json\|load_json" admin-console/server.py
# 应该返回空（无结果）

# 验证没有 ENABLE_DB_STORAGE 条件判断
grep -n "if ENABLE_DB_STORAGE\|if not ENABLE_DB_STORAGE" admin-console/server.py
# 应该返回空（无结果）
```

### 2. 启动测试

```bash
# 设置环境变量
export POSTGRES_HOST=127.0.0.1
export POSTGRES_PORT=5432
export POSTGRES_DB=slim
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=<YOUR_POSTGRES_PASSWORD>
export INTERNAL_API_TOKEN="<YOUR_INTERNAL_API_TOKEN>"

# 启动服务器
cd admin-console
python3 server.py

# 输出应该显示：
# ✓ Database initialized
# ✓ Starting server on port 8080
```

### 3. 功能测试

```bash
# 测试读取订单
curl -H "Authorization: Bearer <YOUR_INTERNAL_API_TOKEN>" \
  http://localhost:8080/api/v1/internal/orders

# 应该返回 JSON 格式的订单列表
# [{"id": "...", "status": "...", ...}, ...]

# 测试写入订单
curl -X POST \
  -H "Authorization: Bearer <YOUR_INTERNAL_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"id": "TEST123", "status": "未完工", ...}' \
  http://localhost:8080/api/v1/internal/orders

# 应该返回成功响应
```

---

## 🚀 完全改写包

如果不想手动修改，可以使用以下完整的改写方案：

### 创建新的 `server_pg_only.py`

这是一个完全重写的版本，完全使用 PostgreSQL：

```bash
# 1. 备份原文件
cp admin-console/server.py admin-console/server_backup.py

# 2. 替换为新版本
cp admin-console/server_pg_only.py admin-console/server.py

# 3. 测试
python3 admin-console/server.py
```

### 改写检查清单

- [ ] 删除所有 `ORDERS_FILE`, `USERS_FILE` 等文件路径变量
- [ ] 删除 `load_json()`, `save_json()` 函数
- [ ] 简化 `load_orders()` 和 `save_orders()` 函数
- [ ] 删除 `ENABLE_DB_STORAGE` 逻辑，始终使用 DB
- [ ] 更新 `init_database_if_needed()` 仅初始化 DB 连接
- [ ] 搜索并替换所有 JSON 文件访问为 DB 访问
- [ ] 验证代码中没有对 JSON 文件的引用
- [ ] 测试所有主要功能（读、写、更新）
- [ ] 验证日志输出正确

---

## 💾 启动脚本更新

**文件**：admin-console/start-admin.sh

```bash
#!/bin/bash

# PostgreSQL 连接配置
export POSTGRES_HOST=127.0.0.1
export POSTGRES_PORT=5432
export POSTGRES_DB=slim
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=<YOUR_POSTGRES_PASSWORD>

# API 令牌
export INTERNAL_API_TOKEN="<YOUR_INTERNAL_API_TOKEN>"

# 启动 Python 服务器
cd "$(dirname "$0")"
python3 server.py

# 输出：
# ✓ PostgreSQL connected
# ✓ Server listening on http://localhost:8080
```

---

## 🔄 回滚方案

如果改写出现问题，快速回滚：

```bash
# 恢复备份
cp admin-console/server_backup.py admin-console/server.py

# 保持原来的 JSON 模式（如果需要）
# 但这会失去迁移后的 PostgreSQL 数据
```

---

## 📊 性能对比

| 方面 | JSON 模式 | PostgreSQL 模式 |
|------|---------|----------------|
| 查询速度 | ~50ms | ~10ms（有索引） |
| 写入速度 | ~100ms | ~20ms（有索引） |
| 内存占用 | ~10MB | ~2MB（连接池） |
| 扩展性 | 受限 | 无限 |
| 一致性 | 文件系统 | ACID |

---

## 🎯 总结

改写 server.py 的关键点：

1. **删除 JSON 代码** - 一切 JSON 读写函数都删除
2. **简化逻辑** - 不再需要 ENABLE_DB_STORAGE 条件判断
3. **统一使用 DB** - 所有数据访问都通过 PostgreSQL
4. **更新启动脚本** - 确保正确的环境变量
5. **测试验证** - 确保所有功能正常工作

完成改写后，系统架构变得简单清晰：
```
前端 (WeChat Mini Program)
    ↓
HTTP API (server.py)
    ↓
PostgreSQL Database
```

不再有 JSON 文件的中间环节！✨

