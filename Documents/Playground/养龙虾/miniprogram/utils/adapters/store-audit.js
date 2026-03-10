const { request } = require('../api')
const { getCurrentRole } = require('./store-permission')

function normalizeAuditItem(item) {
  const source = item && typeof item === 'object' ? item : {}
  return {
    auditId: String(source.audit_id || ''),
    storeCode: String(source.store_code || ''),
    actorSalesId: String(source.actor_sales_id || ''),
    actorSalesName: String(source.actor_sales_name || ''),
    actorRole: String(source.actor_role || ''),
    targetType: String(source.target_type || 'order'),
    targetId: String(source.target_id || ''),
    action: String(source.action || ''),
    result: String(source.result || ''),
    beforeStatus: String(source.before_status || ''),
    afterStatus: String(source.after_status || ''),
    errorCode: String(source.error_code || ''),
    errorMessage: String(source.error_message || ''),
    source: String(source.source || ''),
    metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
    createdAt: String(source.created_at || ''),
  }
}

const storeAuditApi = {
  async logOrderOperation(payload = {}) {
    const targetId = String(payload.target_id || '').trim()
    const action = String(payload.action || '').trim()
    const result = String(payload.result || '').trim().toLowerCase()

    if (!targetId || !action || !result) {
      return false
    }

    const body = {
      target_type: String(payload.target_type || 'order').trim() || 'order',
      target_id: targetId,
      action,
      result,
      before_status: payload.before_status || '',
      after_status: payload.after_status || '',
      error_code: payload.error_code || '',
      error_message: payload.error_message || '',
      source: payload.source || 'miniprogram-store',
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    }

    try {
      await request('/audit/order-ops', {
        method: 'POST',
        data: body,
        header: {
          'X-Actor-Role': getCurrentRole(),
        }
      })
      return true
    } catch (error) {
      console.warn('写入订单审计失败（已忽略）', error)
      return false
    }
  },

  async listOrderOperations(params = {}) {
    const page = Number(params.page || 1)
    const pageSize = Number(params.page_size || params.pageSize || 20)
    const query = {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      page_size: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    }

    const targetId = String(params.target_id || params.targetId || '').trim()
    const actorSalesId = String(params.actor_sales_id || params.actorSalesId || '').trim()
    const action = String(params.action || '').trim()
    const result = String(params.result || '').trim().toLowerCase()
    const createdFrom = String(params.created_from || params.createdFrom || '').trim()
    const createdTo = String(params.created_to || params.createdTo || '').trim()

    if (targetId) {
      query.target_id = targetId
    }
    if (actorSalesId) {
      query.actor_sales_id = actorSalesId
    }
    if (action) {
      query.action = action
    }
    if (result && result !== 'all') {
      query.result = result
    }
    if (createdFrom) {
      query.created_from = createdFrom
    }
    if (createdTo) {
      query.created_to = createdTo
    }

    const data = await request('/audit/order-ops', {
      method: 'GET',
      data: query,
    })

    const items = Array.isArray(data && data.items) ? data.items.map(normalizeAuditItem) : []
    return {
      total: Number(data && data.total) || 0,
      page: Number(data && data.page) || query.page,
      pageSize: Number(data && data.page_size) || query.page_size,
      items,
    }
  },

  async getOrderOperationSummary(params = {}) {
    const query = {}
    const targetId = String(params.target_id || params.targetId || '').trim()
    const actorSalesId = String(params.actor_sales_id || params.actorSalesId || '').trim()
    const action = String(params.action || '').trim()
    const result = String(params.result || '').trim().toLowerCase()
    const createdFrom = String(params.created_from || params.createdFrom || '').trim()
    const createdTo = String(params.created_to || params.createdTo || '').trim()

    if (targetId) {
      query.target_id = targetId
    }
    if (actorSalesId) {
      query.actor_sales_id = actorSalesId
    }
    if (action) {
      query.action = action
    }
    if (result && result !== 'all') {
      query.result = result
    }
    if (createdFrom) {
      query.created_from = createdFrom
    }
    if (createdTo) {
      query.created_to = createdTo
    }

    const data = await request('/audit/order-ops/summary', {
      method: 'GET',
      data: query,
    })

    return {
      total: Number(data && data.total) || 0,
      successCount: Number(data && data.success_count) || 0,
      failedCount: Number(data && data.failed_count) || 0,
      skippedCount: Number(data && data.skipped_count) || 0,
      actionStats: Array.isArray(data && data.action_stats) ? data.action_stats : [],
      errorTypeStats: Array.isArray(data && data.error_type_stats) ? data.error_type_stats : [],
    }
  },

  async exportOrderOperationsCsv(params = {}) {
    const query = {}
    const targetId = String(params.target_id || params.targetId || '').trim()
    const actorSalesId = String(params.actor_sales_id || params.actorSalesId || '').trim()
    const action = String(params.action || '').trim()
    const result = String(params.result || '').trim().toLowerCase()
    const createdFrom = String(params.created_from || params.createdFrom || '').trim()
    const createdTo = String(params.created_to || params.createdTo || '').trim()
    const maxRows = Number(params.max_rows || params.maxRows || 2000)

    if (targetId) {
      query.target_id = targetId
    }
    if (actorSalesId) {
      query.actor_sales_id = actorSalesId
    }
    if (action) {
      query.action = action
    }
    if (result && result !== 'all') {
      query.result = result
    }
    if (createdFrom) {
      query.created_from = createdFrom
    }
    if (createdTo) {
      query.created_to = createdTo
    }
    if (Number.isFinite(maxRows) && maxRows > 0) {
      query.max_rows = Math.min(10000, Math.max(1, Math.floor(maxRows)))
    }

    const data = await request('/audit/order-ops/export', {
      method: 'GET',
      data: query,
    })

    return {
      filename: String(data && data.filename) || 'order_audit.csv',
      rows: Number(data && data.rows) || 0,
      maxRows: Number(data && data.max_rows) || 0,
      csv: String(data && data.csv) || '',
    }
  }
}

module.exports = {
  storeAuditApi,
}
