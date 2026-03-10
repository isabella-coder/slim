# API 接口规范文档

## 1. 基础信息

- **Base URL**: `http://localhost:8000/api/v1` (开发环境)
- **Content-Type**: `application/json`
- **认证**: JWT Token (header: `Authorization: Bearer {token}`)
- **状态码**: RESTful 标准

## 2. 响应格式标准

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    // 业务数据
  },
  "timestamp": "2026-03-09T10:30:00Z"
}
```

### 错误响应

```json
{
  "code": 400,
  "message": "Invalid account_code",
  "detail": "Account DY-BOP-001 not found or inactive",
  "timestamp": "2026-03-09T10:30:00Z"
}
```

## 3. 核心 API 端点

### 3.1 账号管理 API

#### 创建账号
```
POST /accounts
Content-Type: application/json

Request:
{
  "account_code": "DY-BOP-001",
  "platform": "douyin",
  "source_channel": "live",
  "account_name": "抖音直播BOP",
  "store_code": "BOP",
  "bot_instance_id": "Bot-DY-BOP"
}

Response 201:
{
  "code": 0,
  "data": {
    "account_code": "DY-BOP-001",
    "platform": "douyin",
    "source_channel": "live",
    "store_code": "BOP",
    "bot_instance_id": "Bot-DY-BOP",
    "is_active": true,
    "created_at": "2026-03-09T10:00:00Z"
  }
}
```

#### 查询账号列表
```
GET /accounts?store_code=BOP&platform=douyin

Response 200:
{
  "code": 0,
  "data": {
    "total": 2,
    "page": 1,
    "page_size": 10,
    "items": [
      {
        "account_code": "DY-BOP-001",
        "platform": "douyin",
        "source_channel": "live",
        "store_code": "BOP",
        "bot_instance_id": "Bot-DY-BOP",
        "is_active": true
      }
    ]
  }
}
```

#### 查看账号详情
```
GET /accounts/{account_code}

Response 200:
{
  "code": 0,
  "data": {
    "account_code": "DY-BOP-001",
    "platform": "douyin",
    "source_channel": "live",
    "account_name": "抖音直播BOP",
    "store_code": "BOP",
    "bot_instance_id": "Bot-DY-BOP",
    "is_active": true,
    "created_at": "2026-03-09T10:00:00Z",
    "updated_at": "2026-03-09T10:00:00Z"
  }
}
```

### 3.2 线索管理 API

#### 创建线索（OpenClaw 调用）
```
POST /leads
Content-Type: application/json

Request:
{
  "platform": "douyin",
  "source_channel": "live",
  "account_code": "DY-BOP-001",
  "customer_nickname": "小王",
  "car_model": "宝马X5",
  "service_type": "隐形车衣",
  "budget_range": "8000-12000",
  "consultation_topic": "pricing_and_installation",
  "conversation_summary": "客户咨询BMW X5隐形车衣价格和施工周期，表示对车衣感兴趣"
}

Response 201:
{
  "code": 0,
  "data": {
    "lead_id": "lead_20260309_001",
    "platform": "douyin",
    "account_code": "DY-BOP-001",
    "store_code": "BOP",
    "customer_nickname": "小王",
    "car_model": "宝马X5",
    "service_type": "隐形车衣",
    "budget_range": "8000-12000",
    "assigned_to": {
      "sales_id": "Sales1",
      "sales_name": "李明",
      "sales_wechat": "liming"
    },
    "assigned_at": "2026-03-09T10:30:00Z",
    "status": "pending_first_reply",
    "sla_1m_deadline": "2026-03-09T10:31:00Z",
    "sla_3m_deadline": "2026-03-09T10:33:00Z",
    "sla_10m_deadline": "2026-03-09T10:40:00Z",
    "wechat_status": "pending"
  }
}
```

#### 查询线索列表
```
GET /leads?store_code=BOP&status=pending_first_reply&date_from=2026-03-08&date_to=2026-03-09

Query Params:
  store_code: string (optional)
  assigned_to: string (optional)
  status: string (optional)
  wechat_status: string (optional)
  platform: string (optional)
  source_channel: string (optional)
  date_from: date (optional)
  date_to: date (optional)
  page: int = 1
  page_size: int = 20

Response 200:
{
  "code": 0,
  "data": {
    "total": 45,
    "page": 1,
    "page_size": 20,
    "items": [
      {
        "lead_id": "lead_001",
        "customer_nickname": "小王",
        "car_model": "宝马X5",
        "service_type": "隐形车衣",
        "platform": "douyin",
        "source_channel": "live",
        "assigned_to": "Sales1",
        "assigned_at": "2026-03-09T10:30:00Z",
        "status": "pending_first_reply",
        "wechat_status": "pending",
        "sla_1m_status": "pending",
        "created_at": "2026-03-09T10:30:00Z"
      }
    ]
  }
}
```

#### 查看线索详情
```
GET /leads/{lead_id}

Response 200:
{
  "code": 0,
  "data": {
    "lead_id": "lead_001",
    "platform": "douyin",
    "source_channel": "live",
    "account_code": "DY-BOP-001",
    "store_code": "BOP",
    "customer_nickname": "小王",
    "customer_contact": "13800138000",
    "car_model": "宝马X5",
    "service_type": "隐形车衣",
    "budget_range": "8000-12000",
    "conversation_summary": "...",
    "assigned_to": {
      "sales_id": "Sales1",
      "sales_name": "李明",
      "wechat_id": "liming"
    },
    "assigned_at": "2026-03-09T10:30:00Z",
    "status": "pending_first_reply",
    "sla_1m_status": "pending",
    "sla_3m_status": "pending",
    "sla_10m_status": "pending",
    "first_reply_at": null,
    "wechat_invited_at": null,
    "wechat_result_at": null,
    "wechat_status": "pending",
    "transfer_count": 0,
    "escalation_count": 0,
    "timeline": [
      {
        "timeline_id": "tl_001",
        "event_type": "created",
        "event_at": "2026-03-09T10:30:00Z",
        "actor_type": "bot",
        "description": "线索创建"
      }
    ],
    "created_at": "2026-03-09T10:30:00Z",
    "updated_at": "2026-03-09T10:30:00Z"
  }
}
```

#### 记录首响
```
POST /leads/{lead_id}/first-reply
Content-Type: application/json

Request:
{
  "actor_id": "Sales1",
  "actor_type": "sales",  # "sales" or "bot"
  "description": "销售在企业微信回复了客户"
}

Response 200:
{
  "code": 0,
  "data": {
    "lead_id": "lead_001",
    "first_reply_at": "2026-03-09T10:31:00Z",
    "sla_1m_status": "pass",
    "status": "now_assigned",
    "next_action": "发起加微信申请"
  }
}
```

#### 记录加微信发起
```
POST /leads/{lead_id}/wechat-invite
Content-Type: application/json

Request:
{
  "actor_id": "Sales1",
  "actor_type": "sales",
  "method": "customer_sent",  # "customer_sent" or "sales_sent" or "link"
  "description": "销售发送微信二维码给客户"
}

Response 200:
{
  "code": 0,
  "data": {
    "lead_id": "lead_001",
    "wechat_invited_at": "2026-03-09T10:32:00Z",
    "wechat_status": "sales_sent",
    "sla_3m_status": "pass",
    "status": "wechat_invited"
  }
}
```

#### 更新微信状态
```
PATCH /leads/{lead_id}/wechat-status
Content-Type: application/json

Request:
{
  "wechat_status": "success",  # pending / invited / customer_sent / sales_sent / success / refused / failed
  "actor_id": "Sales1",
  "actor_type": "sales",
  "confirmed_at": "2026-03-09T10:38:00Z",
  "notes": "客户已通过微信扫描二维码添加了销售微信号"
}

Response 200:
{
  "code": 0,
  "data": {
    "lead_id": "lead_001",
    "wechat_result_at": "2026-03-09T10:38:00Z",
    "wechat_status": "success",
    "sla_10m_status": "pass",
    "status": "completed"
  }
}
```

### 3.3 统计报表 API

#### 日报统计
```
GET /stats/daily?store_code=BOP&date=2026-03-09

Query Params:
  store_code: string (optional, 不填则返回所有店铺)
  date: date

Response 200:
{
  "code": 0,
  "data": {
    "stat_date": "2026-03-09",
    "by_store": [
      {
        "store_code": "BOP",
        "store_name": "BOP保镖隐形车衣店",
        "lead_count": 25,
        "first_reply_count": 24,
        "first_reply_rate": 96.0,
        "wechat_invite_count": 20,
        "wechat_invite_rate": 80.0,
        "wechat_success_count": 18,
        "wechat_success_rate": 72.0,
        "sla_1m_pass": 24,
        "sla_1m_fail": 1,
        "sla_3m_pass": 20,
        "sla_3m_fail": 5,
        "sla_10m_pass": 18,
        "sla_10m_fail": 7
      },
      {
        "store_code": "LM",
        "store_name": "龙膜专营店",
        "lead_count": 18,
        "first_reply_count": 17,
        "first_reply_rate": 94.4,
        "...": "..."
      }
    ],
    "by_channel": [
      {
        "platform": "douyin",
        "source_channel": "live",
        "lead_count": 15,
        "first_reply_count": 14,
        "first_reply_rate": 93.3
      }
    ]
  }
}
```

#### 按销售统计
```
GET /stats/by-sales?store_code=BOP&date_from=2026-03-01&date_to=2026-03-09

Response 200:
{
  "code": 0,
  "data": {
    "store_code": "BOP",
    "period": {
      "from": "2026-03-01",
      "to": "2026-03-09"
    },
    "sales": [
      {
        "sales_id": "Sales1",
        "sales_name": "李明",
        "assigned_count": 30,
        "first_reply_count": 29,
        "first_reply_rate": 96.7,
        "wechat_success_count": 22,
        "wechat_success_rate": 73.3,
        "sla_1m_pass_rate": 96.7,
        "sla_3m_pass_rate": 83.3,
        "sla_10m_pass_rate": 73.3
      }
    ]
  }
}
```

#### SLA 统计
```
GET /stats/sla?store_code=BOP&date=2026-03-09

Response 200:
{
  "code": 0,
  "data": {
    "date": "2026-03-09",
    "store_code": "BOP",
    "sla_1m": {
      "pass": 24,
      "fail": 1,
      "pass_rate": 96.0
    },
    "sla_3m": {
      "pass": 20,
      "fail": 5,
      "pass_rate": 80.0
    },
    "sla_10m": {
      "pass": 18,
      "fail": 7,
      "pass_rate": 72.0
    },
    "pending": 3
  }
}
```

### 3.4 企业微信推送 API (内部)

#### 推送新线索通知
```
POST /wecom/notify/new-lead
Content-Type: application/json

Internal API (由系统自动调用)

Request:
{
  "lead_id": "lead_001",
  "recipient_type": "person",
  "recipient_id": "Sales1",
  "also_notify_group": true,
  "group_id": "BOP_GROUP"
}

Response 200:
{
  "code": 0,
  "data": {
    "message_id": "msg_001",
    "sent_at": "2026-03-09T10:30:00Z",
    "recipients": ["Sales1", "BOP_GROUP"]
  }
}
```

### 3.5 OpenClaw 集成 API

#### 接收 OpenClaw 回调
```
POST /openclaw/webhook
Content-Type: application/json
X-Signature: 签名

Request:
{
  "bot_instance_id": "Bot-DY-BOP",
  "customer_id": "cust_001",
  "platform_message_id": "msg_12345",
  "customer_message": "你们BOP的隐形车衣价格多少？",
  "bot_response": "您好！欢迎咨询BOP隐形车衣服务....",
  "extracted_data": {
    "intent": "pricing_inquiry",
    "car_model": "宝马X5",
    "service_type": "隐形车衣",
    "budget_estimation": "5000-10000",
    "sentiment": "interested"
  },
  "next_action": "clarify_needs",
  "timestamp": "2026-03-09T10:30:00Z"
}

Response 200:
{
  "code": 0,
  "data": {
    "webhook_id": "wh_001",
    "processed": true,
    "lead_id": "lead_001",
    "action": "lead_created_and_assigned"
  }
}
```

## 4. 错误代码表

| 代码 | 含义 | HTTP状态码 |
|------|------|-----------|
| 0 | 成功 | 200 |
| 400 | 参数验证错误 | 400 |
| 401 | 未认证 | 401 |
| 403 | 无权限 | 403 |
| 404 | 资源不存在 | 404 |
| 409 | 业务冲突（如账号已存在） | 409 |
| 422 | 业务规则错误（如账号不能跨店） | 422 |
| 500 | 服务器错误 | 500 |

## 5. 认证&授权

### JWT Token

```
Authorization: Bearer eyJhbGc...

token 包含的信息：
{
  "sub": "sales_id or admin_id",
  "role": "sales | admin | manager",
  "store_code": "BOP | LM",
  "exp": 1234567890,
  "iat": 1234567800
}
```

### 权限规则

- **销售角色**：
  - 只能查看自己分配到的线索
  - 只能修改自己的线索状态（首响、加微信状态）
  - 不能跨店查看
  
- **店长角色**：
  - 可以查看本店所有线索
  - 可以查看本店销售的统计数据
  - 可以转派、升级线索
  
- **管理员角色**：
  - 全系统可见
  - 可以管理账号、销售、机器人配置
  - 可以查看所有统计报表

## 6. 使用示例（cURL）

### 创建线索

```bash
curl -X POST http://localhost:8000/api/v1/leads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{
    "platform": "douyin",
    "source_channel": "live",
    "account_code": "DY-BOP-001",
    "customer_nickname": "小王",
    "car_model": "宝马X5",
    "service_type": "隐形车衣",
    "budget_range": "8000-12000",
    "conversation_summary": "客户咨询隐形车衣价格和施工周期"
  }'
```

### 记录首响

```bash
curl -X POST http://localhost:8000/api/v1/leads/lead_001/first-reply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{
    "actor_id": "Sales1",
    "actor_type": "sales"
  }'
```

### 查询今日报表

```bash
curl -X GET "http://localhost:8000/api/v1/stats/daily?store_code=BOP&date=2026-03-09" \
  -H "Authorization: Bearer {TOKEN}"
```

---

下一步：[后端快速开发指南](../backend/README.md)
