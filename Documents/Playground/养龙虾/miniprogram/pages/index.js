const { leadApi, statsApi } = require('../utils/api')
const { getCurrentRole, canAccessStoreOps } = require('../utils/adapters/store-permission')

Page({
  data: {
    salesName: '',
    storeCode: '',
    todayStats: {
      lead_count: 0,
      pending_count: 0,
      first_reply_count: 0,
      wechat_success_count: 0
    },
    currentRole: 'sales',
    currentRoleLabel: '销售',
    canAccessStoreOps: true,
    storeOpsTitle: '经营中心',
    storeOpsSubtitle: '订单、调度、绩效模块将迁入这里',
    carFilmTitle: '蔚蓝工单模块',
    carFilmSubtitle: '兼容原工单端页面：下单、派工、绩效、回访',
    recentLeads: [],
    loading: true
  },

  onLoad() {
    this.resolveRoleAccess()
    this.setData({
      salesName: wx.getStorageSync('sales_name') || '销售',
      storeCode: wx.getStorageSync('store_code') || ''
    })
  },

  onShow() {
    this.resolveRoleAccess()
    const app = getApp()
    if (!app.requireLogin()) {
      return
    }
    this.loadDashboard()
  },

  onPullDownRefresh() {
    const app = getApp()
    if (!app.requireLogin()) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadDashboard().then(() => wx.stopPullDownRefresh())
  },

  async loadDashboard() {
    this.setData({ loading: true })
    try {
      await Promise.all([
        this.loadTodayStats(),
        this.loadRecentLeads()
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
      console.error('统计加载失败', e)
    }
  },

  async loadRecentLeads() {
    try {
      const salesId = wx.getStorageSync('sales_id')
      const data = await leadApi.getLeads({
        assigned_to: salesId,
        status: 'assigned',
        page_size: 5
      })
      this.setData({ recentLeads: data.items || [] })
    } catch (e) {
      console.error('线索加载失败', e)
    }
  },

  goToLeads() {
    wx.switchTab({ url: '/pages/leads' })
  },

  goToStoreOps() {
    if (!this.data.canAccessStoreOps) {
      wx.showToast({ title: '当前角色暂无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/subpackages/store/pages/ops-home/index' })
  },

  goToCarFilmOps() {
    wx.navigateTo({ url: '/pages/index/index' })
  },

  resolveRoleAccess() {
    const role = getCurrentRole()
    const roleMeta = this.getRoleMeta(role)
    this.setData({
      currentRole: role,
      currentRoleLabel: roleMeta.label,
      canAccessStoreOps: canAccessStoreOps(role) && roleMeta.canAccessStoreOps !== false,
      storeOpsTitle: roleMeta.title,
      storeOpsSubtitle: roleMeta.subtitle,
    })
  },

  getRoleMeta(role) {
    const map = {
      manager: {
        label: '店长',
        canAccessStoreOps: true,
        title: '经营中心（管理视图）',
        subtitle: '可查看全部订单与门店经营数据',
      },
      sales: {
        label: '销售',
        canAccessStoreOps: true,
        title: '经营中心（销售视图）',
        subtitle: '可查看订单并跟进客户进度',
      },
      finance: {
        label: '财务',
        canAccessStoreOps: true,
        title: '经营中心（财务视图）',
        subtitle: '可查看财务相关订单与状态',
      },
      technician: {
        label: '施工',
        canAccessStoreOps: true,
        title: '经营中心（施工视图）',
        subtitle: '可查看派工相关订单明细',
      },
    }
    return map[role] || map.sales
  },

  goToLeadDetail(e) {
    const leadId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/lead-detail?id=${leadId}` })
  },

  formatDate(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
})
