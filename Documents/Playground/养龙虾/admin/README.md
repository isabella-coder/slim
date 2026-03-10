// Vue 3 Admin 前端项目说明

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问：http://localhost:5173

### 3. 生产构建

```bash
npm run build
```

## 项目结构

```
admin/
├── src/
│   ├── pages/          # 页面组件
│   │   ├── Home.vue
│   │   ├── Accounts.vue
│   │   ├── Leads.vue
│   │   ├── LeadDetail.vue
│   │   ├── Allocation.vue
│   │   ├── StatsDaily.vue
│   │   ├── StatsSales.vue
│   │   └── StatsSla.vue
│   ├── components/     # 可复用组件
│   ├── utils/          # 工具函数
│   │   └── api.js      # API 请求封装
│   ├── stores/         # Pinia 状态管理
│   │   └── app.js
│   ├── router/         # 路由配置
│   │   └── index.js
│   ├── App.vue         # 根组件
│   └── main.js         # 应用入口
├── public/             # 静态资源
├── package.json
├── vite.config.js      # Vite 配置
├── index.html          # HTML 入口
└── README.md
```

## 技术栈

- **框架**：Vue 3
- **构建**：Vite
- **路由**：Vue Router 4
- **状态管理**：Pinia
- **HTTP 客户端**：Axios
- **UI 组件**：Element Plus
- **图表**：ECharts

## 待实现的页面

### 已完成
- ✅ Home.vue (首页)
- ✅ App.vue (主布局)

### 待实现
- ⏳ Accounts.vue (账号管理)
- ⏳ Leads.vue (线索中心)
- ⏳ LeadDetail.vue (线索详情)
- ⏳ Allocation.vue (分配管理)
- ⏳ StatsDaily.vue (日报统计)
- ⏳ StatsSales.vue (销售统计)
- ⏳ StatsSla.vue (SLA 统计)

## API 集成

所有 API 调用已在 `src/utils/api.js` 中封装，可以直接导入使用：

```javascript
import { accountApi, leadApi, statsApi } from '@/utils/api'

// 获取账号列表
const accounts = await accountApi.list({ store_code: 'BOP' })

// 获取线索列表
const leads = await leadApi.list({ status: 'pending_first_reply' })

// 获取日报统计
const stats = await statsApi.daily('2026-03-09', 'BOP')
```

## 开发指南

### 添加新页面

1. 在 `src/pages/` 中创建新的 .vue 文件
2. 在 `src/router/index.js` 中添加路由
3. 在 `src/App.vue` 中添加菜单项

### 状态管理

使用 Pinia 进行全局状态管理：

```javascript
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
appStore.setUser(userData)
appStore.setLoading(true)
```

## 常见命令

```bash
# 开发模式
npm run dev

# 生产构建
npm run build

# 预览生产构建
npm run preview

# 代码检查
npm run lint

# 代码格式化
npm run format

# 类型检查
npm run type-check
```

## 部署

### Docker 部署

```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 环境变量

创建 `.env` 文件：

```
VITE_API_BASE_URL=http://localhost:8000/api
VITE_APP_TITLE=上海两店客资中台系统
```

在代码中使用：

```javascript
import.meta.env.VITE_API_BASE_URL
```

## 下一步

1. ✅ 项目初始化完成
2. ⏳ 实现各个页面
3. ⏳ 集成后端 API
4. ⏳ 添加认证和权限控制
5. ⏳ 性能优化
6. ⏳ 部署到生产环境

## 相关文档

- 系统架构: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- API 规范: [../docs/API_SPEC.md](../docs/API_SPEC.md)
- 后端指南: [../backend/README.md](../backend/README.md)

---

项目版本: 1.0.0
最后更新: 2026-03-09
