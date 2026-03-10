const { authApi } = require('../utils/api')

Page({
  data: {
    salesOptions: [],
    selectedIndex: 0,
    selectedLabel: '',
    selectedSalesId: '',
    password: '',
    rememberAccount: true,
    loading: false,
  },

  async onLoad(options) {
    const scene = String(options && options.scene ? options.scene : '').trim().toLowerCase()
    if (scene === 'store') {
      // Unified entry: keep store login flow available behind scene routing.
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }

    const remembered = wx.getStorageSync('remember_login_account')
    const rememberEnabled = wx.getStorageSync('remember_login_enabled')

    this.setData({
      selectedSalesId: remembered || '',
      rememberAccount: rememberEnabled !== false,
    })

    await this.loadSalesOptions()
  },

  async onShow() {
    const app = getApp()
    if (app.checkLogin()) {
      wx.switchTab({ url: '/pages/index' })
    }
  },

  async loadSalesOptions() {
    try {
      const options = await authApi.getSalesOptions()
      const selected = this.pickDefaultSalesId(options)
      const selectedIndex = this.getSelectedIndexBySalesId(options, selected)
      this.setData({
        salesOptions: options,
        selectedIndex,
        selectedLabel: this.buildSalesLabel(options[selectedIndex]),
        selectedSalesId: selected,
      })
    } catch (e) {
      wx.showToast({ title: '加载账号失败', icon: 'none' })
    }
  },

  pickDefaultSalesId(options) {
    if (!options || options.length === 0) {
      return ''
    }

    const current = this.data.selectedSalesId
    if (current && options.find(item => item.sales_id === current)) {
      return current
    }

    return options[0].sales_id
  },

  getSelectedIndexBySalesId(options, salesId) {
    const index = options.findIndex(item => item.sales_id === salesId)
    return index >= 0 ? index : 0
  },

  buildSalesLabel(item) {
    if (!item) {
      return '请选择账号'
    }
    return `${item.sales_name}（${item.store_code}）`
  },

  onSalesChange(e) {
    const selectedIndex = Number(e.detail.value || 0)
    const selected = this.data.salesOptions[selectedIndex] || {}
    this.setData({
      selectedIndex,
      selectedSalesId: selected.sales_id || '',
      selectedLabel: this.buildSalesLabel(selected),
    })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  onRememberChange(e) {
    this.setData({ rememberAccount: !!e.detail.value.length })
  },

  async handleLogin() {
    if (this.data.loading) {
      return
    }

    const salesId = this.data.selectedSalesId
    const password = this.data.password

    if (!salesId) {
      wx.showToast({ title: '请选择账号', icon: 'none' })
      return
    }

    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      const result = await authApi.login(salesId, password)
      const resolvedRole = String(result.role || wx.getStorageSync('mini_role') || 'sales').toLowerCase()
      const app = getApp()
      app.setLoginInfo({
        token: result.token,
        salesId: result.sales_id,
        salesName: result.sales_name,
        storeCode: result.store_code,
        userRole: resolvedRole,
        userInfo: {
          sales_name: result.sales_name,
          store_code: result.store_code,
          role: resolvedRole,
        },
      })

      if (this.data.rememberAccount) {
        wx.setStorageSync('remember_login_account', salesId)
        wx.setStorageSync('remember_login_enabled', true)
      } else {
        wx.removeStorageSync('remember_login_account')
        wx.setStorageSync('remember_login_enabled', false)
      }

      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index' })
      }, 250)
    } catch (e) {
      wx.showToast({ title: e.message || '登录失败', icon: 'none' })
    }

    this.setData({ loading: false })
  },
})
