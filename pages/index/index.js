const { getFinanceConfig, setFinanceApiToken, setFinanceBaseUrl } = require('../../config/finance.config');
const { getOrderSyncStatus, syncOrdersNow } = require('../../utils/order');
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
    canViewSalesBoard: true,
    syncBaseUrlInput: '',
    syncApiTokenInput: '',
    syncTokenReady: false,
    syncStatusLabel: '未同步',
    syncStatusHint: '',
    syncStatusClass: '',
    syncLastSuccessAt: ''
  },

  onShow() {
    this.loadAccountContext();
    this.loadSyncSettings();
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

  loadSyncSettings() {
    const financeConfig = getFinanceConfig();
    const syncStatus = getOrderSyncStatus();
    const envVersion = String(financeConfig.envVersion || 'develop').toLowerCase();
    this.setData({
      syncBaseUrlInput: financeConfig.baseUrl || '',
      syncApiTokenInput: '',
      syncTokenReady: Boolean(financeConfig.apiToken),
      syncStatusLabel: buildSyncStatusLabel(syncStatus, envVersion),
      syncStatusHint: buildSyncStatusHint(syncStatus),
      syncStatusClass: buildSyncStatusClass(syncStatus),
      syncLastSuccessAt: formatSyncTime(syncStatus.lastSuccessAt)
    });
  },

  onSyncBaseUrlInput(event) {
    this.setData({
      syncBaseUrlInput: event.detail.value || ''
    });
  },

  onSyncApiTokenInput(event) {
    this.setData({
      syncApiTokenInput: event.detail.value || ''
    });
  },

  saveSyncSettings() {
    const baseUrl = String(this.data.syncBaseUrlInput || '').trim();
    const apiToken = String(this.data.syncApiTokenInput || '').trim();

    setFinanceBaseUrl(baseUrl);
    if (apiToken) {
      setFinanceApiToken(apiToken);
    }

    this.loadSyncSettings();
    wx.showToast({
      title: '同步配置已保存',
      icon: 'success'
    });
  },

  clearSyncToken() {
    setFinanceApiToken('');
    this.setData({
      syncApiTokenInput: ''
    });
    this.loadSyncSettings();
    wx.showToast({
      title: '已清除本机Token',
      icon: 'none'
    });
  },

  triggerManualSync() {
    wx.showLoading({
      title: '同步中...'
    });
    syncOrdersNow()
      .finally(() => {
        wx.hideLoading();
        this.loadSyncSettings();
        const syncStatus = getOrderSyncStatus();
        if (syncStatus.status === 'SUCCESS') {
          wx.showToast({
            title: '订单同步成功',
            icon: 'success'
          });
          return;
        }
        if (syncStatus.lastError || syncStatus.blockedReason) {
          wx.showToast({
            title: String(syncStatus.lastError || syncStatus.blockedReason || '同步失败').slice(0, 20),
            icon: 'none'
          });
        }
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

function buildSyncStatusLabel(status, envVersion) {
  const source = status && typeof status === 'object' ? status : {};
  if (source.status === 'SUCCESS') {
    return '同步正常';
  }
  if (source.status === 'SYNCING') {
    return '同步进行中';
  }
  if (source.status === 'CONFLICT') {
    return '存在冲突，需人工处理';
  }
  if (source.status === 'ERROR') {
    return '同步失败';
  }
  if (!source.enabled) {
    if (envVersion === 'develop') {
      return '开发环境待配置';
    }
    return '同步未就绪';
  }
  return '待首次同步';
}

function buildSyncStatusHint(status) {
  const source = status && typeof status === 'object' ? status : {};
  const message = String(source.lastError || source.blockedReason || '').trim();
  if (message) {
    return message;
  }
  if (source.enabled) {
    return '可点击“立即同步订单”进行联通验证';
  }
  return '请先配置 Base URL 与 API Token';
}

function buildSyncStatusClass(status) {
  const source = status && typeof status === 'object' ? status : {};
  if (source.status === 'SUCCESS') {
    return 'sync-ok';
  }
  if (source.status === 'ERROR' || source.status === 'CONFLICT') {
    return 'sync-error';
  }
  if (!source.enabled) {
    return 'sync-warning';
  }
  return 'sync-warning';
}

function formatSyncTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}
