const { statsApi, leadApi } = require('../utils/api')

Page({
  data: {
    salesName: '',
    storeCode: '',
    reportDate: '',
    today: '',
    todayStats: {},
    weekStats: [],
    dailySummary: {},
    dailySalesStats: [],
    dailyReportLoading: false,
    dailyReportLoaded: false,
    dailyReportError: '',
    totalAssigned: 0,
    totalSuccess: 0,
    successRate: 0,
    sla1mRate: 0,
    loading: true
  },

  onLoad() {
    const today = this.formatDate(new Date())
    this.setData({
      salesName: wx.getStorageSync('sales_name') || '销售',
      storeCode: wx.getStorageSync('store_code') || '',
      reportDate: today,
      today: today
    })
  },

  onShow() {
    const app = getApp()
    if (!app.requireLogin()) {
      return
    }
    this.loadProfile()
  },

  onPullDownRefresh() {
    const app = getApp()
    if (!app.requireLogin()) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadProfile().then(() => wx.stopPullDownRefresh())
  },

  async loadProfile() {
    this.setData({ loading: true })
    try {
      await Promise.all([
        this.loadTodayStats(),
        this.loadMyStats(),
        this.loadDailySalesReport()
      ])
    } catch (e) {
      console.error('加载失败', e)
    }
    this.setData({ loading: false })
  },

  async loadTodayStats() {
    try {
      const today = this.formatDate(new Date())
      const storeCode = wx.getStorageSync('store_code') || ''
      const data = await statsApi.getDaily(today, storeCode)
      this.setData({ todayStats: data || {} })
    } catch (e) {
      console.error(e)
    }
  },

  async loadMyStats() {
    try {
      const salesId = wx.getStorageSync('sales_id')
      // 获取最近 7 天分配给我的线索统计
      const data = await leadApi.getLeads({
        assigned_to: salesId,
        page_size: 200
      })
      
      const items = data.items || []
      const totalAssigned = items.length
      const totalSuccess = items.filter(i => i.wechat_status === 'success').length
      const totalFirstReply = items.filter(i => i.first_reply_at).length
      const sla1mPass = items.filter(i => i.sla_1m_status === 'pass').length

      this.setData({
        totalAssigned,
        totalSuccess,
        successRate: totalAssigned > 0 ? ((totalSuccess / totalAssigned) * 100).toFixed(1) : 0,
        sla1mRate: totalFirstReply > 0 ? ((sla1mPass / totalFirstReply) * 100).toFixed(1) : 0
      })
    } catch (e) {
      console.error(e)
    }
  },

  async loadDailySalesReport() {
    this.setData({
      dailyReportLoading: true,
      dailyReportError: '',
    })
    try {
      const storeCode = wx.getStorageSync('store_code') || ''
      const data = await statsApi.getDailyBySales(this.data.reportDate, storeCode)
      const rows = (data.sales || []).map((item) => ({
        ...item,
        first_reply_rate_text: `${Number(item.first_reply_rate || 0).toFixed(1)}%`,
        wechat_success_rate_text: `${Number(item.wechat_success_rate || 0).toFixed(1)}%`
      }))

      this.setData({
        dailySummary: data.summary || {},
        dailySalesStats: rows,
        dailyReportLoaded: true,
        dailyReportError: '',
      })
    } catch (e) {
      console.error('日报加载失败', e)
      this.setData({
        dailySummary: {},
        dailySalesStats: [],
        dailyReportLoaded: false,
        dailyReportError: e.message || '日报加载失败',
      })
      wx.showToast({ title: '日报加载失败', icon: 'none' })
    } finally {
      this.setData({ dailyReportLoading: false })
    }
  },

  onReportDateChange(e) {
    this.setData({ reportDate: e.detail.value })
    this.loadDailySalesReport()
  },

  retryDailyReport() {
    this.loadDailySalesReport()
  },

  // 切换门店（如果登录了不同门店的销售）
  handleLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      success: (res) => {
        if (res.confirm) {
          const app = getApp()
          app.logout()
          wx.reLaunch({ url: '/pages/login' })
        }
      }
    })
  },

  formatDate(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
})
