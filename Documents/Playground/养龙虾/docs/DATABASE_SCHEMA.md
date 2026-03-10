# 数据库设计文档

## 1. 数据模型概览

```
┌─────────────────────┐
│  Account (账号表)   │ - 管理平台账号
└─────────────────────┘
          ↑
          │ 1:N
          │
┌─────────────────────┐      ┌──────────────────┐
│   Lead (线索表)     │←─────│ Bot (机器人表)   │
│ 核心业务数据        │      │ OpenClaw 实例    │
└─────────────────────┘      └──────────────────┘
          ↓
          │ 1:N
          │
┌─────────────────────┐
│ LeadTimeline        │ - 时效追踪
│ (时效追踪表)        │ - 状态变化历史
└─────────────────────┘

┌─────────────────────┐
│  Store (門店表)     │ - 存储门店信息
└─────────────────────┘

┌─────────────────────┐
│  Sales (销售表)     │ - 存储销售人员
└─────────────────────┘

┌─────────────────────┐
│ SalesAllocation     │ - 轮转指针
│ (分配轮转表)        │
└─────────────────────┘
```

## 2. 核心表结构

### 2.1 Store (门店表)

```sql
CREATE TABLE store (
    store_code VARCHAR(20) PRIMARY KEY,
    store_name VARCHAR(100) NOT NULL,
    address TEXT,
    region VARCHAR(50),
    main_service TEXT,
    wechat_group_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 初始数据
INSERT INTO store VALUES
  ('BOP', 'BOP 保镖隐形车衣店', '绥德路555号', '杨浦区', 
   '车衣、隐形车衣、漆面保护', 'wechat_group_1', NOW(), NOW()),
  ('LM', '龙膜专营店', '杨浦区', '杨浦区',
   '龙膜、玻璃膜、隔热膜、窗膜', 'wechat_group_2', NOW(), NOW());
```

### 2.2 Account (账号表)

```sql
CREATE TABLE account (
    account_code VARCHAR(30) PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,  -- 'douyin' / 'xiaohongshu'
    source_channel VARCHAR(20) NOT NULL,  -- 'live' / 'invest' / 'natural'
    account_name VARCHAR(100),
    store_code VARCHAR(20) NOT NULL,
    bot_instance_id VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    opened_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (store_code) REFERENCES store(store_code),
    INDEX idx_platform_store (platform, store_code)
);

-- 初始数据（4个账号）
INSERT INTO account VALUES
  ('DY-BOP-001', 'douyin', 'live', '抖音直播BOP', 'BOP', 'Bot-DY-BOP', TRUE, NOW(), NOW(), NOW()),
  ('DY-LM-001', 'douyin', 'live', '抖音直播龙膜', 'LM', 'Bot-DY-LM', TRUE, NOW(), NOW(), NOW()),
  ('XHS-BOP-001', 'xiaohongshu', 'natural', '小红书BOP', 'BOP', 'Bot-XHS-BOP', TRUE, NOW(), NOW(), NOW()),
  ('XHS-LM-001', 'xiaohongshu', 'natural', '小红书龙膜', 'LM', 'Bot-XHS-LM', TRUE, NOW(), NOW(), NOW());
```

### 2.3 Sales (销售表)

```sql
CREATE TABLE sales (
    sales_id VARCHAR(20) PRIMARY KEY,
    sales_name VARCHAR(50) NOT NULL,
    store_code VARCHAR(20) NOT NULL,
    wechat_id VARCHAR(100),
    mobile VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (store_code) REFERENCES store(store_code),
    INDEX idx_store (store_code)
);

-- 初始数据（BOP 3人 + 龙膜 2人）
INSERT INTO sales VALUES
  ('Sales1', '李明', 'BOP', 'liming', '13800000001', TRUE, NOW(), NOW()),
  ('Sales2', '王芳', 'BOP', 'wangfang', '13800000002', TRUE, NOW(), NOW()),
  ('Sales3', '张三', 'BOP', 'zhangsan', '13800000003', TRUE, NOW(), NOW()),
  ('Sales4', '李四', 'LM', 'lisi', '13800000004', TRUE, NOW(), NOW()),
  ('Sales5', '王五', 'LM', 'wangwu', '13800000005', TRUE, NOW(), NOW());
```

### 2.4 Bot (机器人表)

```sql
CREATE TABLE bot (
    bot_instance_id VARCHAR(50) PRIMARY KEY,
    platform VARCHAR(20),
    store_code VARCHAR(20) NOT NULL,
    bot_name VARCHAR(100),
    personality_style VARCHAR(20),  -- 'direct' / 'consultant' / 'lifestyle'
    system_prompt TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (store_code) REFERENCES store(store_code)
);

-- 初始数据
INSERT INTO bot VALUES
  ('Bot-DY-BOP', 'douyin', 'BOP', '抖音BOP智能助手', 'direct',
   '你是BOP保镖隐形车衣店的顾问，专业、高效、直接...', TRUE, NOW()),
  ('Bot-DY-LM', 'douyin', 'LM', '抖音龙膜智能助手', 'direct',
   '你是龙膜专营店的顾问，专业、贴心、实用...', TRUE, NOW()),
  ('Bot-XHS-BOP', 'xiaohongshu', 'BOP', '小红书BOP助手', 'lifestyle',
   '你是BOP的生活方式顾问，温暖、博学、有品味...', TRUE, NOW()),
  ('Bot-XHS-LM', 'xiaohongshu', 'LM', '小红书龙膜助手', 'lifestyle',
   '你是龙膜的贴心顾问，专业知识+口碑分享...', TRUE, NOW());
```

### 2.5 Lead (线索表 - 核心表)

```sql
CREATE TABLE lead (
    lead_id VARCHAR(50) PRIMARY KEY,
    
    -- 来源信息（硬绑定）
    platform VARCHAR(20) NOT NULL,        -- 'douyin' / 'xiaohongshu'
    source_channel VARCHAR(20),           -- 'live' / 'invest' / 'natural'
    account_code VARCHAR(30) NOT NULL,
    bot_instance_id VARCHAR(50),
    store_code VARCHAR(20) NOT NULL,
    
    -- 客户信息
    customer_nickname VARCHAR(100),
    customer_contact VARCHAR(20),         -- 可选 (微信号/电话)
    
    -- 需求信息（由机器人识别和提取）
    car_model VARCHAR(100),               -- 车型
    service_type VARCHAR(50),             -- 服务类型（车衣/龙膜等）
    budget_range VARCHAR(50),             -- 预算范围
    consultation_topic TEXT,              -- 咨询代码/分类
    conversation_summary TEXT,            -- 聊天摘要
    
    -- 分配信息
    assigned_sales_id VARCHAR(20),
    assigned_at TIMESTAMP,
    
    -- 时效追踪
    first_reply_at TIMESTAMP,             -- 首响时间
    wechat_invited_at TIMESTAMP,          -- 发起加微信时间
    wechat_result_at TIMESTAMP,           -- 确认结果时间
    
    -- 微信状态
    wechat_status VARCHAR(20) DEFAULT 'pending',
    -- pending / invited / customer_sent / sales_sent / success / refused / failed
    
    -- SLA 状态
    sla_1m_status VARCHAR(10) DEFAULT 'pending',  -- 'pass' / 'fail' / 'pending'
    sla_3m_status VARCHAR(10) DEFAULT 'pending',
    sla_10m_status VARCHAR(10) DEFAULT 'pending',
    
    -- 状态管理
    status VARCHAR(20) DEFAULT 'created',  
    -- created / first_reply / wechat_invited / wechat_success / completed
    
    -- 转派和升级
    transfer_count INT DEFAULT 0,         -- 转派次数
    escalation_count INT DEFAULT 0,       -- 升级次数
    escalated_to VARCHAR(100),            -- 升级给谁
    escalation_reason TEXT,
    
    -- 系统字段
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 约束和索引
    FOREIGN KEY (store_code) REFERENCES store(store_code),
    FOREIGN KEY (account_code) REFERENCES account(account_code),
    FOREIGN KEY (bot_instance_id) REFERENCES bot(bot_instance_id),
    FOREIGN KEY (assigned_sales_id) REFERENCES sales(sales_id),
    
    INDEX idx_store_created (store_code, created_at DESC),
    INDEX idx_account_created (account_code, created_at DESC),
    INDEX idx_sales_created (assigned_sales_id, created_at DESC),
    INDEX idx_status (status),
    INDEX idx_wechat_status (wechat_status),
    INDEX idx_created_at (created_at DESC)
);
```

### 2.6 LeadTimeline (时效追踪表)

```sql
CREATE TABLE lead_timeline (
    timeline_id VARCHAR(50) PRIMARY KEY,
    lead_id VARCHAR(50) NOT NULL,
    
    -- 时间记录
    event_type VARCHAR(30),
    -- 'created' / 'assigned' / 'first_reply' / 'wechat_invited' / 
    -- 'wechat_result' / 'transferred' / 'escalated' / 'completed'
    
    event_at TIMESTAMP,
    actor_id VARCHAR(50),      -- 谁做的动作（销售/机器人）
    actor_type VARCHAR(20),    -- 'sales' / 'bot' / 'system'
    
    -- 计时信息
    duration_ms INT,           -- 距离上一个事件的毫秒数
    sla_target_ms INT,         -- SLA 目标毫秒数 (1分钟=60000等)
    sla_passed BOOLEAN,        -- 是否超过SLA
    
    -- 事件描述
    description TEXT,
    metadata JSON,             -- 额外数据 (如销售名、状态等)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (lead_id) REFERENCES lead(lead_id),
    INDEX idx_lead (lead_id),
    INDEX idx_event_type (event_type)
);
```

### 2.7 SalesAllocation (轮转指针表)

```sql
CREATE TABLE sales_allocation (
    allocation_id VARCHAR(50) PRIMARY KEY,
    store_code VARCHAR(20) NOT NULL,
    
    -- 当前轮转指针
    current_sales_index INT,   -- 0, 1, 2 (BOP) 或 0, 1 (龙膜)
    
    -- 上次分配时间和销售
    last_assigned_sales_id VARCHAR(20),
    last_assigned_at TIMESTAMP,
    
    -- 轮转配置
    rotation_count INT DEFAULT 0,  -- 完成的轮转周期数
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_store (store_code),
    FOREIGN KEY (store_code) REFERENCES store(store_code)
);

-- 初始数据
INSERT INTO sales_allocation VALUES
  ('BOP-ROTATION', 'BOP', 0, NULL, NULL, 0, NOW()),
  ('LM-ROTATION', 'LM', 0, NULL, NULL, 0, NOW());
```

### 2.8 DailyStats (日报表 - 聚合统计)

```sql
CREATE TABLE daily_stats (
    stat_id VARCHAR(50) PRIMARY KEY,
    stat_date DATE NOT NULL,
    
    -- 维度
    store_code VARCHAR(20),
    platform VARCHAR(20),
    source_channel VARCHAR(20),
    
    -- 统计数据
    lead_count INT DEFAULT 0,
    first_reply_count INT DEFAULT 0,
    wechat_invite_count INT DEFAULT 0,
    wechat_success_count INT DEFAULT 0,
    
    first_reply_rate DECIMAL(5, 2),      -- 百分比
    wechat_invite_rate DECIMAL(5, 2),
    wechat_success_rate DECIMAL(5, 2),
    
    sla_1m_pass_count INT DEFAULT 0,
    sla_3m_pass_count INT DEFAULT 0,
    sla_10m_pass_count INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_date_store (stat_date DESC, store_code),
    UNIQUE KEY uk_date_dimension (stat_date, store_code, platform, source_channel)
);
```

## 3. 轮转算法逻辑

### BOP 店轮转（3 人）

```
销售列表：[Sales1, Sales2, Sales3]

第1个线索 → 当前指针=0 → 分配给 Sales1 → 指针 += 1
第2个线索 → 当前指针=1 → 分配给 Sales2 → 指针 += 1
第3个线索 → 当前指针=2 → 分配给 Sales3 → 指针 += 1
第4个线索 → 当前指针=3 → 3 % 3 = 0 → 分配给 Sales1 → 指针 += 1
...

轮转周期 = 3
```

### 龙膜店轮转（2 人）

```
销售列表：[Sales4, Sales5]

第1个线索 → 当前指针=0 → 分配给 Sales4 → 指针 += 1
第2个线索 → 当前指针=1 → 分配给 Sales5 → 指针 += 1
第3个线索 → 当前指针=2 → 2 % 2 = 0 → 分配给 Sales4 → 指针 += 1
...

轮转周期 = 2
```

## 4. 关键模式和设计决策

### 4.1 账号硬绑定门店（核心）

```sql
-- 线索一旦创建，store_code 永远不能改变
-- 是根据 account_code 自动推导的，不能手工修改

INSERT INTO lead (lead_id, account_code, store_code, ...)
VALUES ('lead_001', 'DY-BOP-001', 'BOP', ...)
-- store_code 由 SELECT store_code FROM account WHERE account_code='DY-BOP-001'
```

### 4.2 时效永久化

```sql
-- 一旦设定，不允许修改
-- 例如 first_reply_at 只能从 NULL → 时间戳，不能修改
-- UPDATE trigger 应该拒绝修改

CREATE TRIGGER tr_prevent_timeline_edit
BEFORE UPDATE ON lead_timeline
FOR EACH ROW
BEGIN
  IF OLD.event_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Timeline data is immutable';
  END IF;
END;
```

### 4.3 状态机规范

```
lead.status 的允许转换：
created 
  → first_reply (first_reply_at 被设置)
  → wechat_invited (wechat_invited_at 被设置)
  → wechat_success (wechat_status = 'success')
  → completed

escalation 可能出现在任何阶段
transfer 可能出现在任何阶段
```

## 5. SQL 示例：关键查询

### 5.1 创建线索并自动分配

```sql
-- Step 1: 根据 account_code 确定 store_code
SELECT store_code INTO @store_code FROM account WHERE account_code = 'DY-BOP-001';

-- Step 2: 获取轮转指针
SELECT current_sales_index, 
       (SELECT sales_id FROM sales WHERE store_code = @store_code 
        ORDER BY sales_id LIMIT 1 OFFSET current_sales_index) AS next_sales
FROM sales_allocation WHERE store_code = @store_code;

-- Step 3: 插入线索
INSERT INTO lead (lead_id, platform, account_code, store_code, bot_instance_id,
                 customer_nickname, car_model, service_type, ..., 
                 assigned_sales_id, assigned_at, created_at)
VALUES (...);

-- Step 4: 更新轮转指针
UPDATE sales_allocation 
SET current_sales_index = (current_sales_index + 1) % 3,
    last_assigned_sales_id = @next_sales,
    last_assigned_at = NOW()
WHERE store_code = @store_code;

-- Step 5: 记录 timeline
INSERT INTO lead_timeline (timeline_id, lead_id, event_type, event_at, actor_type)
VALUES ('timeline_001', @lead_id, 'assigned', NOW(), 'system');
```

### 5.2 计算 SLA 状态

```sql
-- 检查 1 分钟 SLA
UPDATE lead 
SET sla_1m_status = CASE
  WHEN first_reply_at IS NULL AND TIMESTAMPDIFF(MINUTE, assigned_at, NOW()) > 1 
    THEN 'fail'
  WHEN first_reply_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, assigned_at, first_reply_at) <= 60
    THEN 'pass'
  ELSE 'fail'
END
WHERE assigned_at IS NOT NULL;

-- 检查 3 分钟 SLA
UPDATE lead
SET sla_3m_status = CASE
  WHEN wechat_invited_at IS NULL AND TIMESTAMPDIFF(MINUTE, assigned_at, NOW()) > 3
    THEN 'fail'
  WHEN wechat_invited_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, assigned_at, wechat_invited_at) <= 180
    THEN 'pass'
  ELSE 'fail'
END
WHERE assigned_at IS NOT NULL;
```

### 5.3 日报统计

```sql
INSERT INTO daily_stats (stat_date, store_code, platform, source_channel,
                         lead_count, first_reply_count, wechat_invite_count, ...)
SELECT 
  DATE(l.created_at) as stat_date,
  l.store_code,
  l.platform,
  l.source_channel,
  COUNT(*) as lead_count,
  SUM(CASE WHEN l.first_reply_at IS NOT NULL THEN 1 ELSE 0 END) as first_reply_count,
  SUM(CASE WHEN l.wechat_invited_at IS NOT NULL THEN 1 ELSE 0 END) as wechat_invite_count,
  SUM(CASE WHEN l.wechat_status = 'success' THEN 1 ELSE 0 END) as wechat_success_count
FROM lead l
WHERE DATE(l.created_at) = CURDATE()
GROUP BY DATE(l.created_at), l.store_code, l.platform, l.source_channel;
```

## 6. 数据初始化脚本

详见 [backend/app/db/init_db.py](../backend/app/db/init_db.py)

---

下一步：[API 规范文档](API_SPEC.md)
