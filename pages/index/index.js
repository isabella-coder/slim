const {
  getAvailableAccounts,
  getCurrentUserContext,
  getRoleLabel,
  isManagerContext,
  isSalesContext,
  isTechnicianContext,
  setCurrentUserContextById
} = require('../../utils/user-context');

Page({
  data: {
    accountOptions: [],
    accountIndex: 0,
    currentAccountLabel: '管理员',
    canCreateOrder: true,
    canViewSalesBoard: true
  },

  onShow() {
    this.loadAccountContext();
  },

  loadAccountContext() {
    const accounts = getAvailableAccounts();
    const context = getCurrentUserContext();
    const matchedIndex = accounts.findIndex((item) => item.accountId === context.accountId);
    const accountIndex = matchedIndex >= 0 ? matchedIndex : 0;
    const current = accounts[accountIndex] || accounts[0] || context;
    const currentRoleLabel = getRoleLabel(current && current.role);
    const permissionState = buildPermissionState(current);
    this.setData({
      accountOptions: accounts.map((item) => `${item.accountName} (${getRoleLabel(item.role)})`),
      accountIndex,
      currentAccountLabel: current ? `${current.accountName} · ${currentRoleLabel}` : '管理员 · 最高权限',
      canCreateOrder: permissionState.canCreateOrder,
      canViewSalesBoard: permissionState.canViewSalesBoard
    });
  },

  onAccountChange(event) {
    const index = Number(event.detail.value);
    const accounts = getAvailableAccounts();
    const selected = accounts[index] || accounts[0];
    if (!selected) {
      return;
    }

    setCurrentUserContextById(selected.accountId);
    const roleLabel = getRoleLabel(selected.role);
    const permissionState = buildPermissionState(selected);
    this.setData({
      accountIndex: index,
      currentAccountLabel: `${selected.accountName} · ${roleLabel}`,
      canCreateOrder: permissionState.canCreateOrder,
      canViewSalesBoard: permissionState.canViewSalesBoard
    });
    wx.showToast({
      title: `已切换为${selected.accountName}`,
      icon: 'none'
    });
  },

  goFilmOrder() {
    if (!this.data.canCreateOrder) {
      wx.showToast({ title: '当前账号无下单权限', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/film-order/film-order'
    });
  },

  goWashOrder() {
    if (!this.data.canCreateOrder) {
      wx.showToast({ title: '当前账号无下单权限', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/wash-order/wash-order'
    });
  },

  goOrderList() {
    wx.switchTab({
      url: '/pages/order-list/order-list'
    });
  },

  goFilmDispatchBoard() {
    wx.navigateTo({
      url: '/pages/dispatch-board/dispatch-board'
    });
  },

  goWashDispatchBoard() {
    wx.navigateTo({
      url: '/pages/wash-dispatch-board/wash-dispatch-board'
    });
  },

  goSalesPerformance() {
    if (!this.data.canViewSalesBoard) {
      wx.showToast({ title: '当前账号无销售看板权限', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/sales-performance/sales-performance'
    });
  }
});

function buildPermissionState(user) {
  if (isManagerContext(user)) {
    return {
      canCreateOrder: true,
      canViewSalesBoard: true
    };
  }
  if (isSalesContext(user)) {
    return {
      canCreateOrder: true,
      canViewSalesBoard: true
    };
  }
  if (isTechnicianContext(user)) {
    return {
      canCreateOrder: false,
      canViewSalesBoard: false
    };
  }

  return {
    canCreateOrder: false,
    canViewSalesBoard: false
  };
}
