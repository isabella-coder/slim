const { storeAuditApi } = require('../../../../utils/adapters/store-audit')
const { authApi } = require('../../../../utils/api')
const { getCurrentRole } = require('../../../../utils/adapters/store-permission')

Page({
  data: {
    datePresets: [
      { label: '今天', value: 'TODAY' },
      { label: '近7天', value: 'LAST_7' },
      { label: '近30天', value: 'LAST_30' },
    ],
    currentDatePreset: 'LAST_7',
    createdFrom: '',
    createdTo: '',
    resultTabs: [
      { label: '全部', value: 'ALL' },
      { label: '成功', value: 'success' },
      { label: '失败', value: 'failed' },
      { label: '跳过', value: 'skipped' },
    ],
    actionTabs: [
      { label: '全部操作', value: 'ALL' },
      { label: '快捷改状态', value: 'quick_status_update' },
      { label: '批量改状态', value: 'batch_status_update' },
      { label: '详情页保存', value: 'detail_save_update' },
    ],
    currentResult: 'ALL',
    currentAction: 'ALL',
    salesOptions: [
      { label: '全部执行人', value: '' },
    ],
    salesOptionLabels: ['全部执行人'],
    selectedSalesIndex: 0,
    selectedSalesId: '',
    role: 'sales',
    hasRestoredFilters: false,
    exportLoading: false,
    exportMode: '',
    keyword: '',
    summaryLoading: false,
    summary: {
      total: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      actionStats: [],
      errorTypeStats: [],
    },
    loading: false,
    loadingMore: false,
    finished: false,
    errorText: '',
    page: 1,
    pageSize: 20,
    total: 0,
    items: [],
  },

  onLoad() {
    const role = getCurrentRole()
    this.setData({ role })
    this.initDateRange()
    this.restoreFilters()
    this.loadSalesOptions()
  },

  onShow() {
    this.reload()
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.loadAudits(false)
  },

  onResultTabChange(e) {
    const value = String(e.currentTarget.dataset.value || 'ALL')
    if (!value || value === this.data.currentResult) {
      return
    }
    this.setData({ currentResult: value })
    this.persistFilters()
    this.reload()
  },

  onActionTabChange(e) {
    const value = String(e.currentTarget.dataset.value || 'ALL')
    if (!value || value === this.data.currentAction) {
      return
    }
    this.setData({ currentAction: value })
    this.persistFilters()
    this.reload()
  },

  onSalesPickerChange(e) {
    const index = Number(e.detail.value || 0)
    if (!Number.isFinite(index) || index === this.data.selectedSalesIndex) {
      return
    }
    const selected = this.data.salesOptions[index] || { value: '' }
    this.setData({
      selectedSalesIndex: index,
      selectedSalesId: String(selected.value || ''),
    })
    this.persistFilters()
    this.reload()
  },

  onDatePresetTap(e) {
    const preset = String(e.currentTarget.dataset.value || '')
    if (!preset) {
      return
    }
    this.applyDatePreset(preset)
    this.persistFilters()
    this.reload()
  },

  onCreatedFromChange(e) {
    const value = String(e.detail.value || '')
    this.setData({
      createdFrom: value,
      currentDatePreset: 'CUSTOM',
    })
    this.persistFilters()
  },

  onCreatedToChange(e) {
    const value = String(e.detail.value || '')
    this.setData({
      createdTo: value,
      currentDatePreset: 'CUSTOM',
    })
    this.persistFilters()
  },

  onApplyDateTap() {
    this.persistFilters()
    this.reload()
  },

  onResetFiltersTap() {
    const role = this.data.role || getCurrentRole()
    const selfSalesId = role === 'sales' ? String(wx.getStorageSync('sales_id') || '').trim() : ''
    const options = this.data.salesOptions || []
    let selectedSalesIndex = 0
    if (selfSalesId) {
      const hitIndex = options.findIndex((item) => String((item && item.value) || '') === selfSalesId)
      if (hitIndex >= 0) {
        selectedSalesIndex = hitIndex
      }
    }
    const selectedSalesId = String((options[selectedSalesIndex] && options[selectedSalesIndex].value) || '')

    this.applyDatePreset('LAST_7')
    this.setData({
      currentResult: 'ALL',
      currentAction: 'ALL',
      keyword: '',
      selectedSalesIndex,
      selectedSalesId,
    })
    this.persistFilters()
    this.reload()
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' })
    this.persistFilters()
  },

  clearKeyword() {
    if (!this.data.keyword) {
      return
    }
    this.setData({ keyword: '' })
    this.persistFilters()
    this.reload()
  },

  onSearchTap() {
    this.reload()
  },

  async reload() {
    if (!this.validateDateRange()) {
      return
    }
    await Promise.all([
      this.loadSummary(),
      this.loadAudits(true),
    ])
  },

  formatDate(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  getDateOffset(days) {
    const date = new Date()
    date.setDate(date.getDate() + Number(days || 0))
    return this.formatDate(date)
  },

  initDateRange() {
    this.applyDatePreset('LAST_7')
  },

  applyDatePreset(preset) {
    const today = this.getDateOffset(0)
    let createdFrom = today
    if (preset === 'LAST_7') {
      createdFrom = this.getDateOffset(-6)
    } else if (preset === 'LAST_30') {
      createdFrom = this.getDateOffset(-29)
    }

    this.setData({
      currentDatePreset: preset,
      createdFrom,
      createdTo: today,
    })
  },

  getFilterStorageKey() {
    return `store_order_audit_filters_${this.data.role || 'sales'}`
  },

  restoreFilters() {
    if (this.data.hasRestoredFilters) {
      return
    }

    const saved = wx.getStorageSync(this.getFilterStorageKey()) || {}
    const createdFrom = String(saved.createdFrom || this.data.createdFrom || '')
    const createdTo = String(saved.createdTo || this.data.createdTo || '')
    const currentDatePreset = String(saved.currentDatePreset || this.data.currentDatePreset || 'LAST_7')
    const currentResult = String(saved.currentResult || this.data.currentResult || 'ALL')
    const currentAction = String(saved.currentAction || this.data.currentAction || 'ALL')
    const keyword = String(saved.keyword || this.data.keyword || '')
    const selectedSalesId = String(saved.selectedSalesId || '')

    this.setData({
      createdFrom,
      createdTo,
      currentDatePreset,
      currentResult,
      currentAction,
      keyword,
      selectedSalesId,
      hasRestoredFilters: true,
    })
  },

  persistFilters() {
    wx.setStorageSync(this.getFilterStorageKey(), {
      createdFrom: this.data.createdFrom,
      createdTo: this.data.createdTo,
      currentDatePreset: this.data.currentDatePreset,
      currentResult: this.data.currentResult,
      currentAction: this.data.currentAction,
      keyword: this.data.keyword,
      selectedSalesId: this.data.selectedSalesId,
    })
  },

  validateDateRange() {
    const createdFrom = String(this.data.createdFrom || '')
    const createdTo = String(this.data.createdTo || '')
    if (!createdFrom || !createdTo) {
      wx.showToast({ title: '请选择起止日期', icon: 'none' })
      return false
    }
    if (createdFrom > createdTo) {
      wx.showToast({ title: '起始日期不能大于结束日期', icon: 'none' })
      return false
    }
    return true
  },

  buildQueryFilters() {
    const selected = this.data.salesOptions[this.data.selectedSalesIndex] || { value: '' }
    return {
      result: this.data.currentResult,
      action: this.data.currentAction,
      actor_sales_id: String(selected.value || ''),
      target_id: String(this.data.keyword || '').trim(),
      created_from: this.data.createdFrom,
      created_to: this.data.createdTo,
    }
  },

  async exportCsvWithFilters(extraFilters = {}, mode = 'all') {
    if (this.data.exportLoading) {
      return
    }
    if (!this.validateDateRange()) {
      return
    }

    this.setData({ exportLoading: true, exportMode: mode })
    try {
      const filters = {
        ...this.buildQueryFilters(),
        ...extraFilters,
      }
      const exported = await storeAuditApi.exportOrderOperationsCsv({
        ...filters,
        max_rows: 5000,
      })

      const csvText = String(exported.csv || '')
      if (!csvText.trim()) {
        wx.showToast({ title: '当前筛选无可导出数据', icon: 'none' })
        return
      }

      const safeFileName = String(exported.filename || 'order_audit.csv').replace(/[^a-zA-Z0-9_.-]/g, '_')
      const filePath = `${wx.env.USER_DATA_PATH}/${safeFileName}`
      const fs = wx.getFileSystemManager()
      fs.writeFile({
        filePath,
        data: `\ufeff${csvText}`,
        encoding: 'utf8',
        success: () => {
          wx.openDocument({
            filePath,
            showMenu: true,
            fileType: 'csv',
            success: () => {
              wx.showToast({ title: `已导出 ${exported.rows} 条`, icon: 'none' })
            },
            fail: () => {
              wx.setClipboardData({
                data: csvText,
                success: () => {
                  wx.showModal({
                    title: '导出成功',
                    content: `文件已保存：${safeFileName}\n已回退复制 CSV 到剪贴板`,
                    showCancel: false,
                    confirmText: '知道了',
                  })
                }
              })
            }
          })
        },
        fail: () => {
          wx.setClipboardData({
            data: csvText,
            success: () => {
              wx.showModal({
                title: '导出成功',
                content: `文件写入失败，已复制 CSV 到剪贴板\n文件名：${safeFileName}\n记录数：${exported.rows}`,
                showCancel: false,
                confirmText: '知道了',
              })
            }
          })
        },
      })
    } catch (error) {
      wx.showToast({ title: String((error && error.message) || '导出失败'), icon: 'none' })
    }
    this.setData({ exportLoading: false, exportMode: '' })
  },

  async onExportCsvTap() {
    await this.exportCsvWithFilters({}, 'all')
  },

  async onExportFailedTap() {
    await this.exportCsvWithFilters({ result: 'failed' }, 'failed')
  },

  async onExportSkippedTap() {
    await this.exportCsvWithFilters({ result: 'skipped' }, 'skipped')
  },

  async loadSalesOptions() {
    try {
      const items = await authApi.getSalesOptions()
      const options = [{ label: '全部执行人', value: '' }]
      ;(items || []).forEach((item) => {
        const salesId = String(item.sales_id || '').trim()
        if (!salesId) {
          return
        }
        const salesName = String(item.sales_name || salesId).trim()
        const storeCode = String(item.store_code || '').trim()
        options.push({
          label: storeCode ? `${salesName} (${salesId}/${storeCode})` : `${salesName} (${salesId})`,
          value: salesId,
        })
      })

      const labels = options.map((item) => item.label)
      const role = getCurrentRole()
      const selfSalesId = String(wx.getStorageSync('sales_id') || '').trim()
      const selectedValue = String(this.data.selectedSalesId || '')
      let selectedSalesIndex = options.findIndex((item) => String(item.value || '') === selectedValue)
      if (selectedSalesIndex < 0 && role === 'sales' && selfSalesId) {
        selectedSalesIndex = options.findIndex((item) => String(item.value || '') === selfSalesId)
      }
      if (selectedSalesIndex < 0) {
        selectedSalesIndex = 0
      }
      const selectedSalesId = String((options[selectedSalesIndex] && options[selectedSalesIndex].value) || '')

      this.setData({
        salesOptions: options,
        salesOptionLabels: labels,
        selectedSalesIndex,
        selectedSalesId,
      })
      this.persistFilters()
    } catch (error) {
      console.warn('加载执行人列表失败', error)
    }
  },

  mapActionStatClass(action) {
    const target = String(action || '').trim()
    if (target === 'quick_status_update') {
      return 'action-quick'
    }
    if (target === 'batch_status_update') {
      return 'action-batch'
    }
    if (target === 'detail_save_update') {
      return 'action-detail'
    }
    return 'action-default'
  },

  mapErrorTypeClass(type) {
    const target = String(type || '').toUpperCase()
    if (target === 'VERSION_CONFLICT') {
      return 'reason-version'
    }
    if (target === 'NO_PERMISSION') {
      return 'reason-permission'
    }
    if (target === 'NETWORK') {
      return 'reason-network'
    }
    return 'reason-default'
  },

  async loadSummary() {
    this.setData({ summaryLoading: true })
    try {
      const summary = await storeAuditApi.getOrderOperationSummary(this.buildQueryFilters())
      const errorTypeStats = (summary.errorTypeStats || []).map((item) => ({
        ...item,
        className: this.mapErrorTypeClass(item.type),
      }))
      const actionStats = (summary.actionStats || []).map((item) => ({
        ...item,
        className: this.mapActionStatClass(item.action),
      }))
      this.setData({
        summary: {
          ...summary,
          actionStats,
          errorTypeStats,
        },
      })
    } catch (error) {
      console.warn('审计汇总加载失败', error)
      this.setData({
        summary: {
          total: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
          actionStats: [],
          errorTypeStats: [],
        },
      })
    }
    this.setData({ summaryLoading: false })
  },

  mapActionLabel(action) {
    const target = String(action || '').trim()
    const map = {
      quick_status_update: '快捷改状态',
      batch_status_update: '批量改状态',
      detail_save_update: '详情页保存',
    }
    return map[target] || target || '未命名操作'
  },

  mapResultMeta(result) {
    const target = String(result || '').toLowerCase()
    if (target === 'success') {
      return { label: '成功', className: 'tag-success' }
    }
    if (target === 'failed') {
      return { label: '失败', className: 'tag-failed' }
    }
    if (target === 'skipped') {
      return { label: '跳过', className: 'tag-skipped' }
    }
    return { label: target || '未知', className: 'tag-skipped' }
  },

  formatTimeText(raw) {
    const text = String(raw || '').trim()
    if (!text) {
      return '-'
    }
    const source = text.endsWith('Z') ? text : `${text}Z`
    const date = new Date(source)
    if (Number.isNaN(date.getTime())) {
      return text
    }

    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
  },

  mapAuditItem(item) {
    const resultMeta = this.mapResultMeta(item.result)
    const beforeStatus = String(item.beforeStatus || '').trim() || '-'
    const afterStatus = String(item.afterStatus || '').trim() || '-'
    const errorCode = String(item.errorCode || '').trim()
    const errorMessage = String(item.errorMessage || '').trim()
    const hasError = !!(errorCode || errorMessage)

    return {
      ...item,
      actionLabel: this.mapActionLabel(item.action),
      resultLabel: resultMeta.label,
      resultClassName: resultMeta.className,
      createdAtText: this.formatTimeText(item.createdAt),
      statusText: `${beforeStatus} -> ${afterStatus}`,
      hasError,
      errorText: [errorCode, errorMessage].filter(Boolean).join(' | '),
      actorText: item.actorSalesName
        ? `${item.actorSalesName}(${item.actorSalesId || '-'})`
        : (item.actorSalesId || '-'),
    }
  },

  async loadAudits(reset = false) {
    if (reset) {
      if (this.data.loading) {
        return
      }
      this.setData({
        loading: true,
        loadingMore: false,
        errorText: '',
        finished: false,
      })
    } else {
      if (this.data.loadingMore || this.data.loading || this.data.finished) {
        return
      }
      this.setData({ loadingMore: true, errorText: '' })
    }

    const nextPage = reset ? 1 : this.data.page + 1
    try {
      const result = await storeAuditApi.listOrderOperations({
        ...this.buildQueryFilters(),
        page: nextPage,
        page_size: this.data.pageSize,
      })

      const newItems = (result.items || []).map((item) => this.mapAuditItem(item))
      const merged = reset ? newItems : this.data.items.concat(newItems)
      const finished = merged.length >= Number(result.total || 0) || newItems.length < this.data.pageSize

      this.setData({
        page: Number(result.page || nextPage),
        total: Number(result.total || 0),
        items: merged,
        finished,
      })
    } catch (error) {
      this.setData({
        errorText: String((error && error.message) || '审计加载失败'),
      })
    }

    this.setData({
      loading: false,
      loadingMore: false,
    })
  }
})
