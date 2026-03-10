const { storeApi } = require('../../../../utils/adapters/store-api')
const {
  getCurrentRole,
  canBatchEditOrderRole,
  canUseMineOrderView,
  canEditOrder,
} = require('../../../../utils/adapters/store-permission')
const { normalizeErrorMessage, isVersionConflictError } = require('../../../../utils/adapters/store-error')
const { storeAuditApi } = require('../../../../utils/adapters/store-audit')

Page({
  data: {
    role: 'sales',
    canBatchEditRole: false,
    viewTabs: [],
    currentView: 'ALL',
    statusTabs: [
      { label: '全部', value: 'ALL' },
      { label: '未完工', value: '未完工' },
      { label: '已完工', value: '已完工' },
      { label: '已取消', value: '已取消' }
    ],
    currentStatus: 'ALL',
    keyword: '',
    batchMode: false,
    selectedIds: [],
    batchUpdating: false,
    batchResultVisible: false,
    batchResultTitle: '',
    batchResultSummary: '',
    batchResultItems: [],
    batchResultDisplayItems: [],
    batchResultFilter: 'ALL',
    batchResultIssueCount: 0,
    batchResultFailCount: 0,
    batchResultReasonStats: [],
    batchResultFailedIds: [],
    batchResultTargetStatus: '',
    loading: false,
    statusUpdatingId: '',
    errorText: '',
    orders: [],
    stats: {
      total: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0
    },
    searchTimer: null,
  },

  onLoad() {
    this.initRoleView()
  },

  onShow() {
    this.initRoleView()
    this.loadOrders()
  },

  onUnload() {
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh())
  },

  initRoleView() {
    const role = getCurrentRole()
    const canBatchEditRole = canBatchEditOrderRole(role)
    const viewTabs = canUseMineOrderView(role)
      ? [{ label: '全部订单', value: 'ALL' }, { label: '我的订单', value: 'MINE' }]
      : [{ label: '全部订单', value: 'ALL' }]

    const defaultView = canUseMineOrderView(role) ? 'MINE' : 'ALL'
    const localFilters = this.getSavedFilters(role)
    const currentView = viewTabs.some((item) => item.value === localFilters.currentView)
      ? localFilters.currentView
      : defaultView
    const currentStatus = this.data.statusTabs.some((item) => item.value === localFilters.currentStatus)
      ? localFilters.currentStatus
      : 'ALL'

    this.setData({
      role,
      canBatchEditRole,
      viewTabs,
      currentView,
      currentStatus,
      keyword: localFilters.keyword || '',
    })
  },

  async loadOrders() {
    this.setData({ loading: true, errorText: '' })
    try {
      const result = await storeApi.getOrders({
        role: this.data.role,
        view: this.data.currentView,
        status: this.data.currentStatus,
        keyword: this.data.keyword,
      })

      const items = (result.items || []).map((item) => ({
        ...item,
        canQuickEdit: this.canQuickEdit(item),
      }))

      const selectedSet = new Set(this.data.selectedIds)
      const selectedIds = items.filter((item) => selectedSet.has(item.id)).map((item) => item.id)
      const markedItems = items.map((item) => ({
        ...item,
        selected: selectedIds.includes(item.id),
      }))

      this.setData({
        orders: markedItems,
        selectedIds,
        stats: result.stats || {},
      })
    } catch (error) {
      this.setData({
        errorText: error.message || '订单加载失败',
        orders: [],
      })
    }
    this.setData({ loading: false })
  },

  onViewTabChange(e) {
    const view = e.currentTarget.dataset.view
    if (!view || view === this.data.currentView) {
      return
    }
    this.setData({ currentView: view })
    this.persistFilters()
    this.loadOrders()
  },

  onStatusTabChange(e) {
    const status = e.currentTarget.dataset.status
    if (!status || status === this.data.currentStatus) {
      return
    }
    this.setData({ currentStatus: status })
    this.persistFilters()
    this.loadOrders()
  },

  onSearchInput(e) {
    const keyword = e.detail.value || ''
    this.setData({ keyword })
    this.persistFilters()

    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }

    const timer = setTimeout(() => {
      this.loadOrders()
    }, 280)
    this.setData({ searchTimer: timer })
  },

  clearKeyword() {
    if (!this.data.keyword) {
      return
    }
    this.setData({ keyword: '' })
    this.persistFilters()
    this.loadOrders()
  },

  toggleBatchMode() {
    if (!this.data.canBatchEditRole) {
      wx.showToast({ title: '当前角色不可批量修改', icon: 'none' })
      return
    }

    const nextMode = !this.data.batchMode
    this.setData({
      batchMode: nextMode,
      selectedIds: [],
      batchResultVisible: false,
      batchResultItems: [],
      batchResultDisplayItems: [],
      batchResultFailedIds: [],
      orders: (this.data.orders || []).map((item) => ({
        ...item,
        selected: false,
      })),
    })
  },

  onToggleSelect(e) {
    if (!this.data.batchMode) {
      return
    }
    const id = e.currentTarget.dataset.id
    const order = (this.data.orders || []).find((item) => item.id === id)
    if (!order || !order.canQuickEdit) {
      return
    }

    const set = new Set(this.data.selectedIds || [])
    if (set.has(id)) {
      set.delete(id)
    } else {
      set.add(id)
    }
    this.updateSelection(Array.from(set))
  },

  selectAllEditable() {
    if (!this.data.batchMode) {
      return
    }
    const ids = (this.data.orders || []).filter((item) => item.canQuickEdit).map((item) => item.id)
    this.updateSelection(ids)
  },

  clearSelection() {
    this.updateSelection([])
  },

  updateSelection(selectedIds) {
    const selectedSet = new Set(selectedIds)
    this.setData({
      selectedIds,
      orders: (this.data.orders || []).map((item) => ({
        ...item,
        selected: selectedSet.has(item.id),
      })),
    })
  },

  canQuickEdit(order) {
    return canEditOrder(this.data.role, order)
  },

  async onQuickStatusTap(e) {
    const id = e.currentTarget.dataset.id
    const order = (this.data.orders || []).find((item) => item.id === id)
    if (!order) {
      return
    }
    if (!this.canQuickEdit(order)) {
      wx.showToast({ title: '当前账号无权限', icon: 'none' })
      return
    }

    const options = ['未完工', '已完工', '已取消']
    wx.showActionSheet({
      itemList: options,
      success: async (res) => {
        const target = options[Number(res.tapIndex)]
        if (!target || target === order.status) {
          return
        }

        this.setData({ statusUpdatingId: order.id })
        try {
          await storeApi.updateOrder(order.id, {
            version: order.version,
            status: target,
            remark: order.remark || '',
          })
          storeAuditApi.logOrderOperation({
            target_id: order.id,
            action: 'quick_status_update',
            result: 'success',
            before_status: order.status || '',
            after_status: target,
            source: 'order-list',
          })
          await this.loadOrders()
          wx.showToast({ title: '状态已更新', icon: 'success' })
        } catch (error) {
          storeAuditApi.logOrderOperation({
            target_id: order.id,
            action: 'quick_status_update',
            result: 'failed',
            before_status: order.status || '',
            after_status: target,
            error_code: String((error && error.code) || ''),
            error_message: normalizeErrorMessage(error, '更新失败'),
            source: 'order-list',
          })
          wx.showToast({ title: error.message || '更新失败', icon: 'none' })
        }
        this.setData({ statusUpdatingId: '' })
      }
    })
  },

  onBatchStatusTap() {
    if (!this.data.batchMode) {
      return
    }
    if (this.data.batchUpdating) {
      return
    }

    const selected = this.data.selectedIds || []
    if (selected.length === 0) {
      wx.showToast({ title: '请先选择订单', icon: 'none' })
      return
    }

    const options = ['未完工', '已完工', '已取消']
    wx.showActionSheet({
      itemList: options,
      success: (res) => {
        const targetStatus = options[Number(res.tapIndex)]
        if (!targetStatus) {
          return
        }
        this.applyBatchStatus(targetStatus)
      }
    })
  },

  normalizeBatchError(error) {
    if (isVersionConflictError(error)) {
      return '版本冲突，请下拉刷新后重试'
    }
    return normalizeErrorMessage(error, '更新失败')
  },

  closeBatchResult() {
    this.setData({ batchResultVisible: false })
  },

  onBatchResultFilterChange(e) {
    const targetFilter = String(e.currentTarget.dataset.filter || 'ALL').toUpperCase()
    if (!targetFilter || targetFilter === this.data.batchResultFilter) {
      return
    }

    const displayItems = this.buildBatchResultDisplayItems(this.data.batchResultItems, targetFilter)
    this.setData({
      batchResultFilter: targetFilter,
      batchResultDisplayItems: displayItems,
    })
  },

  buildBatchResultDisplayItems(allItems, filter) {
    const source = Array.isArray(allItems) ? allItems : []
    const target = filter === 'FAIL'
      ? source.filter((item) => item.level === 'fail')
      : source

    const maxVisible = 30
    const capped = target.slice(0, maxVisible)
    if (target.length > maxVisible) {
      capped.push({
        id: '...',
        level: 'skip',
        message: `还有 ${target.length - maxVisible} 条未展示`,
      })
    }
    return capped
  },

  classifyBatchResultReason(item) {
    const text = String((item && item.message) || '').toLowerCase()
    if (text.includes('版本') || text.includes('冲突') || text.includes('conflict') || text.includes('version')) {
      return 'VERSION_CONFLICT'
    }
    if (text.includes('权限')) {
      return 'NO_PERMISSION'
    }
    if (text.includes('网络') || text.includes('超时') || text.includes('请求失败')) {
      return 'NETWORK'
    }
    if (text.includes('已是目标状态')) {
      return 'ALREADY_TARGET'
    }
    if (text.includes('已变化') || text.includes('刷新')) {
      return 'DATA_CHANGED'
    }
    return 'OTHER'
  },

  buildBatchResultReasonStats(items) {
    const source = Array.isArray(items) ? items : []
    const labels = {
      VERSION_CONFLICT: '版本冲突',
      NO_PERMISSION: '权限不足',
      NETWORK: '网络异常',
      ALREADY_TARGET: '已是目标状态',
      DATA_CHANGED: '数据已变化',
      OTHER: '其他原因',
    }

    const counter = {}
    source.forEach((item) => {
      const key = this.classifyBatchResultReason(item)
      counter[key] = (counter[key] || 0) + 1
    })

    return Object.keys(counter)
      .map((key) => ({ key, label: labels[key] || '其他原因', count: counter[key] }))
      .sort((a, b) => b.count - a.count)
  },

  refreshFromBatchResult() {
    this.loadOrders()
  },

  async retryFailedBatch() {
    if (this.data.batchUpdating) {
      return
    }
    const failedIds = this.data.batchResultFailedIds || []
    const targetStatus = this.data.batchResultTargetStatus
    if (!failedIds.length || !targetStatus) {
      wx.showToast({ title: '暂无可重试项', icon: 'none' })
      return
    }

    wx.showModal({
      title: '重试失败项',
      content: `将重试 ${failedIds.length} 条失败订单，目标状态：${targetStatus}`,
      confirmText: '开始重试',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        await this.loadOrders()
        await this.applyBatchStatus(targetStatus, {
          orderIds: failedIds,
          retryMode: true,
        })
      }
    })
  },

  async applyBatchStatus(targetStatus, options = {}) {
    const selectedIds = Array.isArray(options.orderIds) && options.orderIds.length
      ? options.orderIds.slice()
      : (this.data.selectedIds || [])
    const retryMode = options.retryMode === true
    const orderMap = new Map((this.data.orders || []).map((item) => [item.id, item]))

    let successCount = 0
    let failCount = 0
    let skipCount = 0
    const resultItems = []
    const failedIds = []
    this.setData({
      batchUpdating: true,
      batchResultVisible: false,
    })

    for (const id of selectedIds) {
      const order = orderMap.get(id)
      if (!order) {
        skipCount += 1
        resultItems.push({ id, level: 'skip', message: '订单已变化，请刷新后重试' })
        storeAuditApi.logOrderOperation({
          target_id: id,
          action: 'batch_status_update',
          result: 'skipped',
          after_status: targetStatus,
          error_code: 'ORDER_NOT_FOUND_IN_VIEW',
          error_message: '订单已变化，请刷新后重试',
          source: retryMode ? 'order-list-batch-retry' : 'order-list-batch',
        })
        continue
      }

      if (!order.canQuickEdit) {
        skipCount += 1
        resultItems.push({ id, level: 'skip', message: '当前账号无权限修改此订单' })
        storeAuditApi.logOrderOperation({
          target_id: id,
          action: 'batch_status_update',
          result: 'skipped',
          before_status: order.status || '',
          after_status: targetStatus,
          error_code: 'NO_PERMISSION',
          error_message: '当前账号无权限修改此订单',
          source: retryMode ? 'order-list-batch-retry' : 'order-list-batch',
        })
        continue
      }

      if (order.status === targetStatus) {
        skipCount += 1
        resultItems.push({ id, level: 'skip', message: '已是目标状态，已跳过' })
        storeAuditApi.logOrderOperation({
          target_id: id,
          action: 'batch_status_update',
          result: 'skipped',
          before_status: order.status || '',
          after_status: targetStatus,
          error_code: 'ALREADY_TARGET',
          error_message: '已是目标状态，已跳过',
          source: retryMode ? 'order-list-batch-retry' : 'order-list-batch',
        })
        continue
      }

      try {
        await storeApi.updateOrder(order.id, {
          version: order.version,
          status: targetStatus,
          remark: order.remark || '',
        })
        successCount += 1
        storeAuditApi.logOrderOperation({
          target_id: order.id,
          action: 'batch_status_update',
          result: 'success',
          before_status: order.status || '',
          after_status: targetStatus,
          source: retryMode ? 'order-list-batch-retry' : 'order-list-batch',
          metadata: {
            retry_mode: retryMode,
          },
        })
      } catch (error) {
        failCount += 1
        failedIds.push(id)
        const errorMessage = this.normalizeBatchError(error)
        resultItems.push({
          id,
          level: 'fail',
          message: errorMessage,
        })
        storeAuditApi.logOrderOperation({
          target_id: id,
          action: 'batch_status_update',
          result: 'failed',
          before_status: order.status || '',
          after_status: targetStatus,
          error_code: String((error && error.code) || ''),
          error_message: errorMessage,
          source: retryMode ? 'order-list-batch-retry' : 'order-list-batch',
          metadata: {
            retry_mode: retryMode,
          },
        })
      }
    }

    await this.loadOrders()
    const defaultFilter = failCount > 0 ? 'FAIL' : 'ALL'
    const displayItems = this.buildBatchResultDisplayItems(resultItems, defaultFilter)
    const reasonStats = this.buildBatchResultReasonStats(resultItems)

    this.setData({
      batchUpdating: false,
      batchResultVisible: true,
      batchResultTitle: retryMode ? `重试批量改为「${targetStatus}」` : `批量改为「${targetStatus}」`,
      batchResultSummary: `成功 ${successCount}，失败 ${failCount}，跳过 ${skipCount}`,
      batchResultItems: resultItems,
      batchResultDisplayItems: displayItems,
      batchResultFilter: defaultFilter,
      batchResultIssueCount: resultItems.length,
      batchResultFailCount: failCount,
      batchResultReasonStats: reasonStats,
      batchResultFailedIds: failedIds,
      batchResultTargetStatus: targetStatus,
    })

    const message = failCount > 0 || skipCount > 0
      ? `批量完成：成功${successCount}，失败${failCount}，跳过${skipCount}`
      : `批量完成：成功${successCount}`
    wx.showToast({ title: message, icon: 'none' })
    if (!retryMode) {
      this.clearSelection()
    }
  },

  getFilterStorageKey(role) {
    return `store_order_list_filters_${role || 'sales'}`
  },

  getSavedFilters(role) {
    const saved = wx.getStorageSync(this.getFilterStorageKey(role)) || {}
    return {
      currentView: String(saved.currentView || ''),
      currentStatus: String(saved.currentStatus || ''),
      keyword: String(saved.keyword || ''),
    }
  },

  persistFilters() {
    wx.setStorageSync(this.getFilterStorageKey(this.data.role), {
      currentView: this.data.currentView,
      currentStatus: this.data.currentStatus,
      keyword: this.data.keyword,
    })
  },

  goDetail(e) {
    if (this.data.batchMode) {
      return
    }
    const id = e.currentTarget.dataset.id
    if (!id) {
      return
    }
    wx.navigateTo({ url: `/subpackages/store/pages/order-detail/index?id=${id}` })
  }
})
