const { leadApi } = require('../utils/api')

Page({
  data: {
    lead: null,
    loading: true,
    actionLoading: false,
    wechatMethods: [
      { key: 'customer_sent', label: '客户发微信号' },
      { key: 'sales_sent', label: '我发微信号' },
      { key: 'link', label: '发送添加链接' }
    ],
    wechatResults: [
      { key: 'success', label: '已加上微信', icon: '✅' },
      { key: 'refused', label: '客户拒绝', icon: '❌' },
      { key: 'failed', label: '添加失败', icon: '⚠️' }
    ],
    showWechatMethodPicker: false,
    showWechatResultPicker: false
  },

  onLoad(options) {
    const app = getApp()
    if (!app.requireLogin()) {
      return
    }

    this.leadId = options.id
    if (this.leadId) {
      this.loadDetail()
    }
  },

  async loadDetail() {
    this.setData({ loading: true })
    try {
      const lead = await leadApi.getLeadDetail(this.leadId)
      lead.timeDisplay = this.formatTime(lead.created_at)
      lead.assignedTimeDisplay = this.formatTime(lead.assigned_at)
      lead.firstReplyTimeDisplay = this.formatTime(lead.first_reply_at)
      lead.wechatInviteTimeDisplay = this.formatTime(lead.wechat_invited_at)
      lead.wechatResultTimeDisplay = this.formatTime(lead.wechat_result_at)
      lead.platformLabel = lead.platform === 'douyin' ? '抖音' : '小红书'
      lead.statusLabel = this.getStatusLabel(lead.status)
      lead.wechatStatusLabel = this.getWechatLabel(lead.wechat_status)

      // 计算 SLA 状态展示
      if (lead.sla_1m_status) {
        lead.sla1mDisplay = lead.sla_1m_status === 'pass' ? '✅ 通过' : '❌ 超时'
      }
      if (lead.sla_3m_status) {
        lead.sla3mDisplay = lead.sla_3m_status === 'pass' ? '✅ 通过' : '❌ 超时'
      }
      if (lead.sla_10m_status) {
        lead.sla10mDisplay = lead.sla_10m_status === 'pass' ? '✅ 通过' : '❌ 超时'
      }

      this.setData({ lead })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
    this.setData({ loading: false })
  },

  // 记录首响
  async handleFirstReply() {
    wx.showModal({
      title: '确认首响',
      content: '将记录你的首次回应时间，用于 1 分钟 SLA 考核。确认吗？',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ actionLoading: true })
        try {
          const salesId = wx.getStorageSync('sales_id')
          await leadApi.firstReply(this.leadId, salesId)
          wx.showToast({ title: '首响已记录', icon: 'success' })
          this.loadDetail()
        } catch (e) {
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
        this.setData({ actionLoading: false })
      }
    })
  },

  // 选择加微信方式
  showWechatOptions() {
    this.setData({ showWechatMethodPicker: true })
  },

  hideWechatMethodPicker() {
    this.setData({ showWechatMethodPicker: false })
  },

  async selectWechatMethod(e) {
    const method = e.currentTarget.dataset.method
    this.setData({ showWechatMethodPicker: false, actionLoading: true })
    
    try {
      await leadApi.wechatInvite(this.leadId, method)
      wx.showToast({ title: '加微信已发起', icon: 'success' })
      this.loadDetail()
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
    this.setData({ actionLoading: false })
  },

  // 确认微信结果
  showWechatResultOptions() {
    this.setData({ showWechatResultPicker: true })
  },

  hideWechatResultPicker() {
    this.setData({ showWechatResultPicker: false })
  },

  async selectWechatResult(e) {
    const status = e.currentTarget.dataset.status
    this.setData({ showWechatResultPicker: false, actionLoading: true })
    
    try {
      await leadApi.updateWechatStatus(this.leadId, status)
      wx.showToast({ title: '状态已更新', icon: 'success' })
      this.loadDetail()
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
    this.setData({ actionLoading: false })
  },

  // 拨打电话
  callCustomer() {
    const lead = this.data.lead || {}
    const phone = lead.customer_phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone })
    } else {
      wx.showToast({ title: '暂无电话号码', icon: 'none' })
    }
  },

  // 复制微信号
  copyWechat() {
    const lead = this.data.lead || {}
    const wechat = lead.customer_wechat
    if (wechat) {
      wx.setClipboardData({
        data: wechat,
        success: () => wx.showToast({ title: '已复制微信号' })
      })
    }
  },

  getStatusLabel(status) {
    const map = {
      'created': '新线索', 'assigned': '待首响',
      'first_reply': '待加微', 'wechat_invited': '确认中',
      'completed': '已完成'
    }
    return map[status] || status
  },

  getWechatLabel(status) {
    const map = {
      'pending': '未发起', 'invited': '已发起',
      'customer_sent': '客户已发微信号', 'sales_sent': '已发微信号',
      'success': '已加上微信', 'refused': '客户拒绝', 'failed': '添加失败'
    }
    return map[status] || status || '未发起'
  },

  formatTime(str) {
    if (!str) return '-'
    const d = new Date(str)
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
})
