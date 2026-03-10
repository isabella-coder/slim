const { getFinanceConfig, setFinanceApiToken, setFinanceBaseUrl } = require('../../config/finance.config');
const { getOrderSyncStatus, syncOrdersNow } = require('../../utils/order');
const {
  getCurrentUserContext,
  getRoleLabel,
  isManagerContext,
  isSalesContext,
  isTechnicianContext
} = require('../../utils/user-context');
const {
  bindUserContextFromSessionUser,
  ensureMiniAuthSession,
  getMiniAuthSession,
  getMiniRoleLabel,
  logoutMiniProgram
} = require('../../utils/mini-auth');

Page({
  data: {
    currentAccountLabel: '管理员',
    sessionUserLabel: '',
    sessionRoleLabel: '',
    needLogin: false,
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

  onReady() {
    this._pageReady = true;
    this._doAuthCheck();
  },

  onShow() {
    if (!this._pageReady) return;
    this._doAuthCheck();
  },

  _doAuthCheck() {
    var session = getMiniAuthSession();
    if (!session.token || !session.user) {
      this.setData({
        needLogin: true,
        currentAccountLabel: '未登录',
        sessionUserLabel: '',
        sessionRoleLabel: '',
        canCreateOrder: false,
        canViewSalesBoard: false,
        syncStatusLabel: '未登录',
        syncStatusHint: '请先登录后再进入业务模块',
        syncStatusClass: 'sync-warning',
        syncLastSuccessAt: ''
      });
      return;
    }

    this.setData({ needLogin: false });
    bindUserContextFromSessionUser(session.user);
    this.setData({
      sessionUserLabel: buildSessionUserLabel(session.user),
      sessionRoleLabel: getMiniRoleLabel(session.user && session.user.role)
    });
    this.loadAccountContext();
    this.loadSyncSettings();
    var self = this;
    ensureMiniAuthSession().then(function (s) {
      if (!s) {
        self.setData({
          needLogin: true,
          currentAccountLabel: '会话已过期',
          sessionUserLabel: '',
          sessionRoleLabel: '',
          canCreateOrder: false,
          canViewSalesBoard: false,
          syncStatusLabel: '未登录',
          syncStatusHint: '登录已过期，请重新登录',
          syncStatusClass: 'sync-warning',
          syncLastSuccessAt: ''
        });
        return;
      }
      self.setData({ needLogin: false });
      bindUserContextFromSessionUser(s.user);
      self.setData({
        sessionUserLabel: buildSessionUserLabel(s.user),
        sessionRoleLabel: getMiniRoleLabel(s.user && s.user.role)
      });
      self.loadAccountContext();
    });
  },

  goLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  loadAccountContext() {
    const context = getCurrentUserContext();
    const current = context || {};
    const currentRoleLabel = getRoleLabel(current && current.role);
    const permissionState = buildPermissionState(current);
    const accountName = String(current && current.accountName ? current.accountName : '').trim();
    this.setData({
      currentAccountLabel: accountName ? `${accountName} · ${currentRoleLabel}` : '管理员 · 最高权限',
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

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号吗？',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        logoutMiniProgram().finally(() => {
          wx.reLaunch({
            url: '/pages/login/login'
          });
        });
      }
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

function buildSessionUserLabel(user) {
  const source = user && typeof user === 'object' ? user : {};
  const name = String(source.name || '').trim();
  const username = String(source.username || '').trim();
  if (name && username) {
    return `${name} (${username})`;
  }
  return name || username || '';
}
