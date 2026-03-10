/**
 * 微信小程序主文件
 */

App({
  onLaunch() {
    // 应用启动时执行
    console.log('应用启动')
    
    // 检查登录状态
    const loggedIn = this.checkLogin()
    if (!loggedIn) {
      setTimeout(() => {
        this.navigateToLogin(true)
      }, 0)
    }
  },

  onShow() {
    // 应用显示时执行
  },

  onHide() {
    // 应用隐藏时执行
  },

  // 全局数据
  globalData: {
    servicePhone: '4008008899',
    userInfo: null,
    token: null,
    storeCode: null,
    salesId: null,
    salesName: null,
    userRole: null,
    isNavigatingToLogin: false,
  },

  // 检查登录状态
  checkLogin() {
    const token = wx.getStorageSync('token')
    const salesId = wx.getStorageSync('sales_id')
    const storeCode = wx.getStorageSync('store_code')
    const salesName = wx.getStorageSync('sales_name')
    const userRole = wx.getStorageSync('user_role')

    this.globalData.token = token || null
    this.globalData.salesId = salesId || null
    this.globalData.storeCode = storeCode || null
    this.globalData.salesName = salesName || null
    this.globalData.userRole = userRole || 'sales'

    if (!token) {
      console.warn('[auth] token missing, login required')
      return false
    }
    return true
  },

  requireLogin() {
    const ok = this.checkLogin()
    if (!ok) {
      this.navigateToLogin(false)
    }
    return ok
  },

  navigateToLogin(forceReLaunch) {
    if (this.globalData.isNavigatingToLogin) {
      return
    }

    const pages = getCurrentPages()
    const current = pages.length ? pages[pages.length - 1].route : ''
    if (current === 'pages/login') {
      return
    }

    const method = forceReLaunch ? 'reLaunch' : 'navigateTo'
    this.globalData.isNavigatingToLogin = true
    wx[method]({
      url: '/pages/login',
      complete: () => {
        this.globalData.isNavigatingToLogin = false
      }
    })
  },

  // 设置全局数据
  setLoginInfo(loginInfo) {
    const { token, salesId, salesName, storeCode, userInfo, userRole } = loginInfo
    const role = userRole || 'sales'
    this.globalData.token = token
    this.globalData.salesId = salesId
    this.globalData.salesName = salesName
    this.globalData.storeCode = storeCode
    this.globalData.userInfo = userInfo
    this.globalData.userRole = role

    wx.setStorageSync('token', token)
    wx.setStorageSync('sales_id', salesId)
    wx.setStorageSync('sales_name', salesName)
    wx.setStorageSync('store_code', storeCode)
    wx.setStorageSync('user_role', role)
  },

  // 清除登录信息
  logout() {
    this.globalData.token = null
    this.globalData.salesId = null
    this.globalData.salesName = null
    this.globalData.storeCode = null
    this.globalData.userInfo = null
    this.globalData.userRole = null

    wx.removeStorageSync('token')
    wx.removeStorageSync('sales_id')
    wx.removeStorageSync('sales_name')
    wx.removeStorageSync('store_code')
    wx.removeStorageSync('user_role')
  }
})
