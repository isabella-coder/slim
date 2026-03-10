const { getCurrentRole } = require('../../../../utils/adapters/store-permission')

Page({
  data: {
    roleLabel: '销售',
    modules: []
  },

  onShow() {
    const role = getCurrentRole()
    const roleLabelMap = {
      manager: '店长',
      sales: '销售',
      finance: '财务',
      technician: '施工'
    }

    const sharedModules = [
      { key: 'order-list', name: '订单列表', desc: '按角色查看订单与进度', route: '/subpackages/store/pages/order-list/index' },
      { key: 'order-audit', name: '操作审计', desc: '查看订单操作成功/失败/跳过记录', route: '/subpackages/store/pages/order-audit/index' },
      { key: 'order-detail', name: '订单详情', desc: '从订单列表进入查看施工明细', route: '' }
    ]

    this.setData({
      roleLabel: roleLabelMap[role] || '销售',
      modules: sharedModules
    })
  },

  onOpenModule(e) {
    const route = e.currentTarget.dataset.route || ''
    if (route) {
      wx.navigateTo({ url: route })
      return
    }

    wx.showToast({
      title: '请从订单列表进入',
      icon: 'none'
    })
  }
})
