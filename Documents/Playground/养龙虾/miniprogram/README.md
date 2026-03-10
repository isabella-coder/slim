小程序项目说明

## 项目结构

```
miniprogram/
├── pages/
│   ├── index/          # 首页
│   ├── leads/          # 线索列表
│   └── profile/        # 个人信息
├── components/         # 可复用组件
├── utils/
│   └── api.js         # API 封装
├── app.json           # 小程序配置
├── app.js             # 小程序主文件
├── app.wxss           # 全局样式
└── project.config.json # 项目配置
```

## 快速开始

1. 在微信开发者工具中打开此目录
2. 填写 AppID（后续获取）
3. 点击"编译"预览

## 核心页面

### 首页 (pages/index)
- 展示今日线索数量
- 显示关键指标（首响率、微信率等）
- 快速操作按钮

### 线索列表 (pages/leads)
- 显示分配给当前销售的线索
- 支持状态筛选
- 点击进入详情

### 线索详情
- 显示完整线索信息
- 支持记录首响、加微信、确认状态等操作

### 个人信息 (pages/profile)
- 显示销售信息
- 查看个人统计数据
- 退出登录

### 登录页 (pages/login)
- 选择销售账号并输入密码登录
- 支持“记住账号”
- 登录后自动绑定门店与销售身份

## API 集成

所有 API 调用已在 `utils/api.js` 中封装：

```javascript
import { leadApi, statsApi } from '../../utils/api'

// 获取线索列表
const leads = await leadApi.getLeads({ status: 'pending_first_reply' })

// 记录首响
await leadApi.firstReply(leadId, salesId)

// 更新微信状态
await leadApi.updateWechatStatus(leadId, 'success')
```

## 权限请求

在 app.json 中配置的权限：
- 用户信息（昵称、头像等）

## 开发指南

### 页面间通信

使用全局 App 对象传递数据：

```javascript
const app = getApp()
app.globalData.userInfo = someData
```

### 本地存储

使用 storage 工具或 wx.setStorageSync：

```javascript
import { storage } from '../../utils/api'

storage.setItem('token', tokenValue)
const token = storage.getItem('token')
```

### 显示通知

```javascript
import { showNotification } from '../../utils/api'

showNotification('操作成功', 'success')
showNotification('操作失败', 'error')
```

## 后续功能

- [x] 登录认证页面
- [x] 线索详情页
- [ ] 消息推送
- [ ] 离线数据支持
- [ ] 数据同步

## 调试技巧

1. 在微信开发者工具中使用 Console 查看日志
2. 使用 Network 标签查看 API 请求
3. 使用 Storage 标签查看本地数据

---

项目版本: 1.0.0
最后更新: 2026-03-09
