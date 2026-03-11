const { isVersionConflictError, getCurrentVersion } = require('./store-error')
const { getFinanceConfig } = require('../../config/finance.config')
const { getMiniAuthSession } = require('../mini-auth')

function getStoreApiBaseUrl() {
  const customBaseUrl = wx.getStorageSync('store_api_base_url')
  const fallbackBaseUrl = getFinanceConfig().baseUrl
  return String(customBaseUrl || fallbackBaseUrl || 'http://127.0.0.1:8000').replace(/\/+$/, '')
}

function requestStore(path, options = {}) {
  return new Promise((resolve, reject) => {
    const session = getMiniAuthSession()
    const token = String((session && session.token) || '').trim()
    if (!token) {
      reject(new Error('请先登录经营系统账号'))
      return
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Api-Token': token,
    }

    wx.request({
      url: `${getStoreApiBaseUrl()}${path}`,
      method: options.method || 'GET',
      header: headers,
      data: options.data || {},
      timeout: 12000,
      success: (res) => {
        const body = res && res.data ? res.data : {}
        const ok = (res.statusCode >= 200 && res.statusCode < 300) && (body.success === true || body.ok === true || body.code === 0)
        if (!ok) {
          const err = new Error(body.message || `经营系统请求失败(${res.statusCode})`)
          err.statusCode = Number(res.statusCode || 0)
          err.code = body.code
          err.response = body
          if (body.currentVersion !== undefined) {
            err.currentVersion = Number(body.currentVersion)
          }
          reject(err)
          return
        }
        resolve(body)
      },
      fail: (error) => {
        reject(new Error((error && error.errMsg) || '经营系统网络请求失败'))
      }
    })
  })
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKeyword(value) {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase()
}

function normalizeOrderItem(item) {
  const source = item && typeof item === 'object' ? item : {}
  const priceSummary = source.priceSummary && typeof source.priceSummary === 'object' ? source.priceSummary : {}
  const totalPrice = Number(priceSummary.totalPrice)
  const version = Number(source.version)
  return {
    ...source,
    id: normalizeText(source.id),
    serviceType: normalizeText(source.serviceType || 'FILM') || 'FILM',
    status: normalizeText(source.status || '未完工') || '未完工',
    customerName: normalizeText(source.customerName),
    phone: normalizeText(source.phone),
    plateNumber: normalizeText(source.plateNumber),
    carModel: normalizeText(source.carModel),
    salesBrandText: normalizeText(source.salesBrandText),
    store: normalizeText(source.store),
    packageLabel: normalizeText(source.packageLabel),
    packageDesc: normalizeText(source.packageDesc),
    appointmentDate: normalizeText(source.appointmentDate),
    appointmentTime: normalizeText(source.appointmentTime),
    createdAt: normalizeText(source.createdAt),
    updatedAt: normalizeText(source.updatedAt),
    version: Number.isFinite(version) ? version : 0,
    priceSummary: {
      ...priceSummary,
      totalPrice: Number.isFinite(totalPrice) ? totalPrice : 0,
    }
  }
}

function matchKeyword(order, keyword) {
  const source = normalizeKeyword(keyword)
  if (!source) {
    return true
  }

  const fields = [
    order.id,
    order.customerName,
    order.phone,
    order.plateNumber,
    order.carModel,
    order.salesBrandText,
    order.packageLabel,
  ]

  return fields.some((field) => normalizeKeyword(field).includes(source))
}

function matchMine(order, role, salesName) {
  if (role !== 'sales' && role !== 'technician') {
    return true
  }
  const owner = normalizeKeyword(order.salesBrandText)
  const me = normalizeKeyword(salesName)
  if (!me) {
    return false
  }
  return owner === me
}

function sortOrders(orders) {
  return orders.slice().sort((a, b) => {
    const at = Date.parse(a.updatedAt || a.createdAt || '') || 0
    const bt = Date.parse(b.updatedAt || b.createdAt || '') || 0
    return bt - at
  })
}

function buildStats(orders) {
  const list = Array.isArray(orders) ? orders : []
  return {
    total: list.length,
    pending: list.filter((item) => item.status === '未完工').length,
    confirmed: list.filter((item) => item.status === '已完工').length,
    cancelled: list.filter((item) => item.status === '已取消').length,
  }
}

const storeApi = {
  async getOrders(params = {}) {
    const role = String(params.role || 'sales').toLowerCase()
    const view = String(params.view || 'ALL').toUpperCase()
    const status = String(params.status || 'ALL')
    const keyword = String(params.keyword || '')
    const session = getMiniAuthSession()
    const sessionName = String((session && session.user && session.user.name) || '')
    const salesName = String(params.salesName || sessionName || wx.getStorageSync('sales_name') || '')

    const data = await requestStore('/api/v1/store/orders', { method: 'GET' })
    const source = Array.isArray(data.items) ? data.items : []
    const normalized = source.map(normalizeOrderItem).filter((item) => item.id)

    let result = normalized
    if (status !== 'ALL') {
      result = result.filter((item) => item.status === status)
    }
    if (view === 'MINE') {
      result = result.filter((item) => matchMine(item, role, salesName))
    }
    result = result.filter((item) => matchKeyword(item, keyword))
    result = sortOrders(result)

    return {
      items: result,
      stats: buildStats(result),
    }
  },

  async getOrderDetail(orderId, params = {}) {
    const targetId = normalizeText(orderId)
    if (!targetId) {
      throw new Error('缺少订单ID')
    }

    const { items } = await this.getOrders({
      ...params,
      status: 'ALL',
      view: 'ALL',
    })

    const item = items.find((entry) => entry.id === targetId)
    if (!item) {
      throw new Error('订单不存在或无权限查看')
    }

    return item
  },

  async updateOrder(orderId, payload = {}) {
    const targetId = normalizeText(orderId)
    if (!targetId) {
      throw new Error('缺少订单ID')
    }

    const body = payload && typeof payload === 'object' ? payload : {}
    const version = Number(body.version)
    if (!Number.isFinite(version)) {
      throw new Error('缺少订单版本号，请先刷新后重试')
    }

    const patch = {
      version,
    }

    if (body.status !== undefined) {
      patch.status = normalizeText(body.status)
    }
    if (body.remark !== undefined) {
      patch.remark = normalizeText(body.remark)
    }
    if (body.appointmentDate !== undefined) {
      patch.appointmentDate = normalizeText(body.appointmentDate)
    }
    if (body.appointmentTime !== undefined) {
      patch.appointmentTime = normalizeText(body.appointmentTime)
    }

    let data
    try {
      data = await requestStore(`/api/v1/store/orders/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        data: patch,
      })
    } catch (error) {
      if (isVersionConflictError(error)) {
        const currentVersion = getCurrentVersion(error)
        if (currentVersion !== null) {
          throw new Error(`订单已被他人更新（最新版本 ${currentVersion}），请刷新后重试`)
        }
        throw new Error('订单已被他人更新，请刷新后重试')
      }
      throw error
    }

    return normalizeOrderItem(data.item || {})
  }
}

module.exports = {
  storeApi,
  getStoreApiBaseUrl,
}
