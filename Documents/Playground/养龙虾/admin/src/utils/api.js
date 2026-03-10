/**
 * API 请求封装
 */

import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    // TODO: 添加 Authorization header
    return config
  },
  error => Promise.reject(error)
)

// 响应拦截器
api.interceptors.response.use(
  response => {
    const { code, data } = response.data
    if (code !== 0) {
      // 错误处理
      console.error('API Error:', response.data)
    }
    return data
  },
  error => Promise.reject(error)
)

// ============ 账号 API ============

export const accountApi = {
  // 获取账号列表
  list(params) {
    return api.get('/accounts', { params })
  },
  // 创建账号
  create(data) {
    return api.post('/accounts', data)
  },
  // 查询账号详情
  get(accountCode) {
    return api.get(`/accounts/${accountCode}`)
  },
  // 更新账号
  update(accountCode, data) {
    return api.patch(`/accounts/${accountCode}`, data)
  },
  // 删除账号
  delete(accountCode) {
    return api.delete(`/accounts/${accountCode}`)
  },
}

// ============ 线索 API ============

export const leadApi = {
  // 获取线索列表
  list(params) {
    return api.get('/leads', { params })
  },
  // 创建线索 (OpenClaw 调用)
  create(data) {
    return api.post('/leads', data)
  },
  // 查询线索详情
  get(leadId) {
    return api.get(`/leads/${leadId}`)
  },
  // 记录首响
  firstReply(leadId, actorId = 'admin') {
    return api.post(`/leads/${leadId}/first-reply`, {
      actor_id: actorId
    })
  },
  // 记录加微信发起
  wechatInvite(leadId, method = 'link', actorId = 'admin') {
    return api.post(`/leads/${leadId}/wechat-invite`, {
      method,
      actor_id: actorId
    })
  },
  // 更新微信状态
  updateWechatStatus(leadId, newStatus, actorId = 'admin') {
    return api.patch(`/leads/${leadId}/wechat-status`, {
      new_status: newStatus,
      actor_id: actorId
    })
  },
}

// ============ 统计 API ============

export const statsApi = {
  // 日报统计
  daily(date, storeCode = null) {
    return api.get('/stats/daily', {
      params: { date, store_code: storeCode }
    })
  },
  // 按销售统计
  bySales(params) {
    return api.get('/stats/by-sales', { params })
  },
  // SLA 统计
  sla(params) {
    return api.get('/stats/sla', { params })
  },
}

// ============ 企业微信 API ============

export const wecomApi = {
  // 推送通知
  notify(data) {
    return api.post('/wecom/notify', data)
  },
}

export default api
