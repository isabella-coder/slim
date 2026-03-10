/**
 * 微信小程序 API 函数
 */

/**
 * 发起网络请求
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const token = getToken()
    const headers = {
      'Content-Type': 'application/json'
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const optionHeaders = options.header && typeof options.header === 'object' ? options.header : {}
    const mergedHeaders = {
      ...headers,
      ...optionHeaders,
    }
    const requestOptions = { ...options }
    delete requestOptions.header

    wx.request({
      url: `${getApiBaseUrl()}${url}`,
      ...requestOptions,
      header: mergedHeaders,
      success: (res) => {
        const body = res && res.data ? res.data : {}
        if (res.statusCode === 200 && body.code === 0) {
          resolve(body.data)
        } else {
          reject(new Error(body.message || `请求失败(${res.statusCode})`))
        }
      },
      fail: reject
    })
  })
}

/**
 * 获取 API 基础 URL
 * 开发环境: http://localhost:8000/api/v1
 * 线上环境: 替换为你的公网域名
 */
function getApiBaseUrl() {
  const customBaseUrl = wx.getStorageSync('api_base_url')
  if (customBaseUrl) {
    return customBaseUrl
  }

  // 开发默认走本地后端；真机联调请通过 api_base_url 覆盖成公网地址
  return 'http://127.0.0.1:8000/api/v1'
}

/**
 * 获取存储的 Token
 */
function getToken() {
  return wx.getStorageSync('token') || ''
}

/**
 * 线索相关 API
 */
const leadApi = {
  // 获取线索列表
  async getLeads(params) {
    return request('/leads', { method: 'GET', data: params })
  },

  // 获取线索详情
  async getLeadDetail(leadId) {
    return request(`/leads/${leadId}`, { method: 'GET' })
  },

  // 记录首响
  async firstReply(leadId, actorId) {
    return request(`/leads/${leadId}/first-reply`, {
      method: 'POST',
      data: { actor_id: actorId, actor_type: 'sales' }
    })
  },

  // 发起加微信
  async wechatInvite(leadId, method = 'customer_sent') {
    return request(`/leads/${leadId}/wechat-invite`, {
      method: 'POST',
      data: {
        actor_id: wx.getStorageSync('sales_id'),
        actor_type: 'sales',
        method: method
      }
    })
  },

  // 更新微信状态
  async updateWechatStatus(leadId, status) {
    return request(`/leads/${leadId}/wechat-status`, {
      method: 'PATCH',
      data: {
        wechat_status: status,
        actor_id: wx.getStorageSync('sales_id'),
        actor_type: 'sales'
      }
    })
  }
}

/**
 * 统计相关 API
 */
const statsApi = {
  // 获取日报统计
  async getDaily(date, storeCode) {
    const currentStoreCode = storeCode || wx.getStorageSync('store_code') || ''
    const data = await request('/stats/daily', {
      method: 'GET',
      data: {
        stat_date: date,
        store_code: currentStoreCode
      }
    })

    // 兼容后端返回 by_store 聚合格式
    if (data && data.by_store && Array.isArray(data.by_store)) {
      if (currentStoreCode) {
        const hit = data.by_store.find(item => item.store_code === currentStoreCode)
        return hit || {}
      }
      return data.by_store[0] || {}
    }
    return data || {}
  },

  // 获取按销售拆分的当日报表
  async getDailyBySales(date, storeCode) {
    const currentStoreCode = storeCode || wx.getStorageSync('store_code') || ''
    const data = await request('/stats/daily-by-sales', {
      method: 'GET',
      data: {
        stat_date: date,
        store_code: currentStoreCode
      }
    })
    return data || {}
  }
}

/**
 * 认证相关 API
 */
const authApi = {
  async getSalesOptions() {
    const data = await request('/auth/sales', { method: 'GET' })
    return data && data.items ? data.items : []
  },

  async login(salesId, password) {
    return request('/auth/login', {
      method: 'POST',
      data: {
        sales_id: salesId,
        password: password
      }
    })
  },

  async me() {
    return request('/auth/me', { method: 'GET' })
  }
}

/**
 * 通知相关功能
 */
function showNotification(message, type = 'info') {
  const iconMap = {
    success: 'success',
    error: 'error',
    info: 'none'
  }
  
  wx.showToast({
    title: message,
    icon: iconMap[type],
    duration: 2000
  })
}

/**
 * 本地存储工具
 */
const storage = {
  setItem(key, value) {
    wx.setStorageSync(key, value)
  },
  getItem(key) {
    return wx.getStorageSync(key)
  },
  removeItem(key) {
    wx.removeStorageSync(key)
  },
  clear() {
    wx.clearStorageSync()
  }
}

module.exports = {
  request,
  leadApi,
  statsApi,
  authApi,
  showNotification,
  storage
}
