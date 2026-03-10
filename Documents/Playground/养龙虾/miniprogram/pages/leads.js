const { leadApi } = require('../utils/api')

Page({
  data: {
    leads: [],
    loading: false,
    currentTab: 'all',
    startDate: '',
    endDate: '',
    today: '',
    page: 1,
    pageSize: 20,
    hasMore: true,
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'assigned', label: '已分配' },
      { key: 'first_reply', label: '待加微' },
      { key: 'wechat_invited', label: '确认中' },
      { key: 'completed', label: '已完成' }
    ]
  },

  onLoad() {
    this.setData({ today: this.formatDate(new Date()) })

    const app = getApp()
    if (!app.requireLogin()) {
      return
    }
    this.loadLeads()
  },

  onShow() {
    const app = getApp()
    if (!app.requireLogin()) {
      return
    }

    if (this.data.leads.length === 0 && !this.data.loading) {
      this.loadLeads()
      return
    }

    // 从详情页返回时刷新
    if (this._needRefresh) {
      this._needRefresh = false
      this.refreshList()
    }
  },

  onPullDownRefresh() {
    const app = getApp()
    if (!app.requireLogin()) {
      wx.stopPullDownRefresh()
      return
    }
    this.refreshList().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.currentTab) return
    this.setData({
      currentTab: tab,
      leads: [],
      page: 1,
      hasMore: true
    })
    this.loadLeads()
  },

  async refreshList() {
    this.setData({ page: 1, hasMore: true, leads: [] })
    await this.loadLeads()
  },

  onStartDateChange(e) {
    const startDate = e.detail.value
    const endDate = this.data.endDate

    if (endDate && startDate > endDate) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
      return
    }

    this.setData({ startDate })
  },

  onEndDateChange(e) {
    const endDate = e.detail.value
    const startDate = this.data.startDate

    if (startDate && endDate < startDate) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' })
      return
    }

    this.setData({ endDate })
  },

  async applyDateFilter() {
    await this.refreshList()
  },

  async clearDateFilter() {
    this.setData({ startDate: '', endDate: '' })
    await this.refreshList()
  },

  async loadLeads() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const salesId = wx.getStorageSync('sales_id')
      const params = {
        assigned_to: salesId,
        page: this.data.page,
        page_size: this.data.pageSize
      }

      if (this.data.currentTab !== 'all') {
        params.status = this.data.currentTab
      }

      if (this.data.startDate) {
        params.created_from = this.data.startDate
      }
      if (this.data.endDate) {
        params.created_to = this.data.endDate
      }

      const data = await leadApi.getLeads(params)
      const items = (data.items || []).map(item => ({
        ...item,
        timeDisplay: this.formatRelativeTime(item.created_at),
        platformLabel: item.platform === 'douyin' ? '抖音' : '小红书',
        statusLabel: this.getStatusLabel(item.status)
      }))

      this.setData({
        leads: this.data.page === 1 ? items : [...this.data.leads, ...items],
        hasMore: items.length >= this.data.pageSize
      })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }

    this.setData({ loading: false })
  },

  loadMore() {
    this.setData({ page: this.data.page + 1 })
    this.loadLeads()
  },

  goToDetail(e) {
    const leadId = e.currentTarget.dataset.id
    this._needRefresh = true
    wx.navigateTo({ url: `/pages/lead-detail?id=${leadId}` })
  },

  async quickFirstReply(e) {
    const leadId = e.currentTarget.dataset.id
    const salesId = wx.getStorageSync('sales_id')

    wx.showModal({
      title: '确认首响',
      content: '点击确认将记录首响时间，用于 1 分钟 SLA 考核',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await leadApi.firstReply(leadId, salesId)
          wx.showToast({ title: '首响已记录 ✓', icon: 'success' })
          this.refreshList()
        } catch (e) {
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  getStatusLabel(status) {
    const map = {
      'created': '新线索',
      'assigned': '待首响',
      'first_reply': '待加微',
      'wechat_invited': '确认中',
      'completed': '已完成'
    }
    return map[status] || status
  },

  formatRelativeTime(dateStr) {
    if (!dateStr) return ''
    const now = Date.now()
    const ts = new Date(dateStr).getTime()
    const diff = Math.floor((now - ts) / 1000)

    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
    return `${Math.floor(diff / 86400)}天前`
  },

  formatDate(d) {
    const year = d.getFullYear()
    const month = `${d.getMonth() + 1}`.padStart(2, '0')
    const day = `${d.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  }
})
