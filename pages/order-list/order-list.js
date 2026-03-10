const { getOrders, syncOrdersNow } = require('../../utils/order');
const { summarizeFollowupOrders } = require('../../utils/followup');
const { getMiniAuthSession } = require('../../utils/mini-auth');
const {
  getCurrentUserContext,
  getRoleLabel,
  isFinanceContext,
  isManagerContext,
  isSalesContext,
  isTechnicianContext
} = require('../../utils/user-context');

const VIEW_TABS = {
  MANAGER: [{ label: '全部订单', value: 'ALL' }],
  SALES: [
    { label: '全部订单', value: 'ALL' },
    { label: '我的订单', value: 'MINE' }
  ],
  FINANCE: [{ label: '全部订单', value: 'ALL' }],
  TECHNICIAN: [{ label: '我的订单', value: 'MINE' }]
};

Page({
  data: {
    needLogin: false,
    viewTabs: VIEW_TABS.MANAGER,
    statusTabs: [
      { label: '全部', value: 'ALL' },
      { label: '未完工', value: '未完工' },
      { label: '已完工', value: '已完工' },
      { label: '已取消', value: '已取消' }
    ],
    currentView: 'ALL',
    currentStatus: 'ALL',
    searchKeyword: '',
    currentUser: {},
    scopeHint: '',
    canEditOrder: true,
    canCreateOrder: true,
    orders: [],
    scopedOrders: [],
    filteredOrders: [],
    stats: {
      total: 0,
      pending: 0,
      confirmed: 0
    },
    reminderStats: {
      dueToday: 0,
      overdue: 0,
      pending: 0,
      done: 0,
      total: 0
    },
    reminderAlertCount: 0,
    emptyTitle: '还没有订单',
    emptySubtitle: '可直接新建贴膜或洗车订单。'
  },

  onLoad() {
    if (!this.ensureLoggedInState()) {
      return;
    }
    this.loadUserContext();
  },

  onShow() {
    if (!this.ensureLoggedInState()) {
      return;
    }
    this.loadUserContext();
    this.syncAndLoadOrders();
  },

  ensureLoggedInState() {
    const session = getMiniAuthSession();
    if (!session.token || !session.user) {
      this.setData({
        needLogin: true,
        orders: [],
        scopedOrders: [],
        filteredOrders: []
      });
      return false;
    }
    this.setData({ needLogin: false });
    return true;
  },

  goLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  loadUserContext() {
    const currentUser = getCurrentUserContext();
    const viewTabs = getViewTabsByUser(currentUser);
    const roleLabel = getRoleLabel(currentUser && currentUser.role);
    const currentViewAvailable = viewTabs.some((item) => item.value === this.data.currentView);
    const currentView = currentViewAvailable
      ? this.data.currentView
      : (viewTabs[0] ? viewTabs[0].value : 'ALL');
    this.setData({
      currentUser,
      viewTabs,
      currentView,
      scopeHint: buildScopeHint(currentUser, roleLabel),
      canEditOrder: isManagerContext(currentUser) || isSalesContext(currentUser),
      canCreateOrder: isManagerContext(currentUser) || isSalesContext(currentUser)
    });
  },

  onPullDownRefresh() {
    syncOrdersNow()
      .catch(() => {})
      .finally(() => {
        this.loadOrders();
        wx.stopPullDownRefresh();
      });
  },

  syncAndLoadOrders() {
    syncOrdersNow()
      .catch(() => {})
      .finally(() => {
        this.loadOrders();
      });
  },

  loadOrders() {
    const orders = getOrders().map((item) => {
      const summary = item.priceSummary || {};
      const totalPrice = Number(summary.totalPrice);
      const commissionTotal = Number(item.commissionTotal);
      const workPartRecords = Array.isArray(item.workPartRecords) ? item.workPartRecords : [];
      const dispatchInfo = item.dispatchInfo && typeof item.dispatchInfo === 'object'
        ? item.dispatchInfo
        : {};
      const dispatchTechnicianNames = buildDispatchTechnicianNames(dispatchInfo);
      const dispatchWorkBay = dispatchInfo.workBay ? String(dispatchInfo.workBay) : '未分配工位';
      const dispatchTechnicianDisplay = dispatchTechnicianNames.length > 0
        ? dispatchTechnicianNames.join(' / ')
        : (dispatchInfo.technicianName ? String(dispatchInfo.technicianName) : '未分配技师');
      const technicians = workPartRecords
        .map((record) => String(record && record.technicianName ? record.technicianName : '').trim())
        .filter((name) => name);
      const uniqueTechnicians = Array.from(new Set(technicians));

      return {
        ...item,
        serviceType: item.serviceType === 'WASH' ? 'WASH' : 'FILM',
        serviceTypeLabel: item.serviceType === 'WASH' ? '洗车' : '贴膜',
        dispatchInfo: {
          ...dispatchInfo,
          technicianDisplay: dispatchTechnicianDisplay
        },
        dispatchDisplay: `${dispatchWorkBay} / ${dispatchTechnicianDisplay}`,
        technicianNameView: uniqueTechnicians.length > 0
          ? uniqueTechnicians.join(' / ')
          : (item.technicianName || '待分配'),
        commissionTotal: Number.isFinite(commissionTotal) ? commissionTotal : 0,
        priceSummary: {
          ...summary,
          totalPrice: Number.isFinite(totalPrice) ? totalPrice : 0
        }
      };
    });

    this.setData({
      orders
    });

    this.applyFilter(this.data.currentStatus, this.data.currentView);
  },

  applyFilter(status, view) {
    const activeStatus = status || this.data.currentStatus;
    const activeView = view || this.data.currentView;
    const keyword = normalizeKeyword(this.data.searchKeyword);
    const scopedOrders = getScopedOrders(this.data.orders, activeView, this.data.currentUser);
    let filteredOrders = scopedOrders;

    if (activeStatus !== 'ALL') {
      filteredOrders = filteredOrders.filter((item) => item.status === activeStatus);
    }

    if (keyword) {
      filteredOrders = filteredOrders.filter((item) => matchOrderKeyword(item, keyword));
    }

    const stats = buildStats(scopedOrders);
    const reminderStats = summarizeFollowupOrders(scopedOrders, new Date());
    const reminderAlertCount = reminderStats.overdue + reminderStats.dueToday;
    const emptyState = buildEmptyStateText({
      scopedOrders,
      filteredOrders,
      currentView: activeView,
      currentUser: this.data.currentUser
    });

    this.setData({
      currentView: activeView,
      currentStatus: activeStatus,
      scopedOrders,
      filteredOrders,
      stats,
      reminderStats,
      reminderAlertCount,
      emptyTitle: emptyState.title,
      emptySubtitle: emptyState.subtitle
    });
  },

  onViewTabChange(event) {
    const view = event.currentTarget.dataset.view;
    const allowed = this.data.viewTabs.some((item) => item.value === view);
    if (!allowed) {
      return;
    }
    this.applyFilter(this.data.currentStatus, view);
  },

  onTabChange(event) {
    const status = event.currentTarget.dataset.status;
    this.applyFilter(status, this.data.currentView);
  },

  onSearchInput(event) {
    this.setData({
      searchKeyword: event.detail.value || ''
    });
    this.applyFilter(this.data.currentStatus, this.data.currentView);
  },

  clearSearch() {
    if (!this.data.searchKeyword) {
      return;
    }

    this.setData({
      searchKeyword: ''
    });
    this.applyFilter(this.data.currentStatus, this.data.currentView);
  },

  viewOrderDetail(event) {
    const orderId = event.currentTarget.dataset.id;
    const serviceType = String(event.currentTarget.dataset.serviceType || '').toUpperCase();
    if (serviceType === 'WASH') {
      wx.navigateTo({
        url: `/pages/wash-order-detail/wash-order-detail?id=${orderId}`
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${orderId}`
    });
  },

  editOrder(event) {
    if (!this.data.canEditOrder) {
      wx.showToast({ title: '当前账号无编辑权限', icon: 'none' });
      return;
    }
    const orderId = event.currentTarget.dataset.id;
    const serviceType = String(event.currentTarget.dataset.serviceType || '').toUpperCase();
    if (serviceType === 'WASH') {
      wx.navigateTo({
        url: `/pages/wash-order/wash-order?id=${orderId}`
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/order-edit/order-edit?id=${orderId}`
    });
  },

  goDispatchBoard() {
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
    wx.navigateTo({
      url: '/pages/sales-performance/sales-performance'
    });
  },

  goFollowupReminders() {
    wx.navigateTo({
      url: '/pages/followup-reminder/followup-reminder'
    });
  },

  goCreateOrder() {
    if (!this.data.canCreateOrder) {
      wx.showToast({ title: '当前账号无下单权限', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['贴膜下单', '洗车下单'],
      success: (res) => {
        const tapIndex = Number(res.tapIndex);
        const targetUrl = tapIndex === 1
          ? '/pages/wash-order/wash-order'
          : '/pages/film-order/film-order';
        wx.navigateTo({
          url: targetUrl
        });
      }
    });
  }
});

function normalizeKeyword(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function buildDispatchTechnicianNames(dispatchInfo) {
  const source = dispatchInfo && typeof dispatchInfo === 'object' ? dispatchInfo : {};
  if (Array.isArray(source.technicianNames)) {
    return source.technicianNames
      .map((item) => normalizeText(item))
      .filter((item) => item);
  }

  const single = normalizeText(source.technicianName);
  if (!single) {
    return [];
  }
  return single.split(/[、/,，\s]+/)
    .map((item) => normalizeText(item))
    .filter((item) => item);
}

function getScopedOrders(orders, view, currentUser) {
  const list = Array.isArray(orders) ? orders : [];
  if (view !== 'MINE') {
    return list;
  }

  if (isSalesContext(currentUser)) {
    const salesName = normalizeKeyword(currentUser && currentUser.accountName);
    if (!salesName) {
      return [];
    }
    return list.filter((order) => normalizeKeyword(order.salesBrandText) === salesName);
  }

  if (isTechnicianContext(currentUser)) {
    const accountId = normalizeText(currentUser && currentUser.accountId);
    const accountName = normalizeText(currentUser && currentUser.accountName);
    return list.filter((order) => isTechnicianOrder(order, accountId, accountName));
  }

  return list;
}

function buildStats(orders) {
  const list = Array.isArray(orders) ? orders : [];
  return {
    total: list.length,
    pending: list.filter((item) => item.status === '未完工').length,
    confirmed: list.filter((item) => item.status === '已完工').length
  };
}

function buildEmptyStateText(options) {
  const scopedOrders = Array.isArray(options && options.scopedOrders) ? options.scopedOrders : [];
  const filteredOrders = Array.isArray(options && options.filteredOrders) ? options.filteredOrders : [];
  const currentView = options && options.currentView ? options.currentView : 'ALL';
  const currentUser = options && typeof options.currentUser === 'object' ? options.currentUser : {};

  if (filteredOrders.length > 0) {
    return {
      title: '未找到匹配订单',
      subtitle: '请检查称呼、联系方式、车牌号或车型后重试。'
    };
  }

  if (scopedOrders.length === 0) {
    if (currentView === 'MINE') {
      if (isTechnicianContext(currentUser)) {
        return {
          title: '你还没有施工相关订单',
          subtitle: '可等待派工后在“我的订单”查看。'
        };
      }
      return {
        title: '你还没有负责中的订单',
        subtitle: '可切换到“全部订单”查看门店全部工单。'
      };
    }

    return {
      title: '还没有订单',
      subtitle: '可直接新建贴膜或洗车订单。'
    };
  }

  return {
    title: '未找到匹配订单',
    subtitle: '请检查称呼、联系方式、车牌号或车型后重试。'
  };
}

function matchOrderKeyword(order, keyword) {
  const fields = [
    order.id,
    order.serviceTypeLabel,
    order.customerName,
    order.phone,
    order.plateNumber,
    order.carModel,
    order.salesBrandText
  ];

  return fields.some((field) => normalizeKeyword(field).indexOf(keyword) >= 0);
}

function getViewTabsByUser(currentUser) {
  if (isTechnicianContext(currentUser)) {
    return VIEW_TABS.TECHNICIAN;
  }
  if (isSalesContext(currentUser)) {
    return VIEW_TABS.SALES;
  }
  if (isFinanceContext(currentUser)) {
    return VIEW_TABS.FINANCE;
  }
  if (isManagerContext(currentUser)) {
    return VIEW_TABS.MANAGER;
  }
  return VIEW_TABS.MANAGER;
}

function buildScopeHint(currentUser, roleLabel) {
  const accountName = normalizeText(currentUser && currentUser.accountName) || '未登录';
  if (isTechnicianContext(currentUser)) {
    return `当前账号：${accountName}（${roleLabel}），仅显示你参与施工的订单。`;
  }
  if (isSalesContext(currentUser)) {
    return `当前账号：${accountName}（${roleLabel}），可查看全部订单，也可切到“我的订单”。`;
  }
  if (isFinanceContext(currentUser)) {
    return `当前账号：${accountName}（${roleLabel}），默认查看全部订单。`;
  }
  return `当前账号：${accountName}（${roleLabel || '最高权限'}），默认查看全部订单。`;
}

function isTechnicianOrder(order, accountId, accountName) {
  if (!order || typeof order !== 'object') {
    return false;
  }

  const normalizedAccountId = normalizeText(accountId);
  const normalizedAccountName = normalizeText(accountName);
  const dispatchInfo = order.dispatchInfo && typeof order.dispatchInfo === 'object'
    ? order.dispatchInfo
    : {};
  const dispatchNames = normalizeTechnicianNames(
    Array.isArray(dispatchInfo.technicianNames) && dispatchInfo.technicianNames.length > 0
      ? dispatchInfo.technicianNames
      : dispatchInfo.technicianName
  );
  if (normalizedAccountName && dispatchNames.indexOf(normalizedAccountName) >= 0) {
    return true;
  }

  const workPartRecords = Array.isArray(order.workPartRecords) ? order.workPartRecords : [];
  return workPartRecords.some((item) => {
    const recordAccountId = normalizeText(item && item.technicianAccountId);
    const recordName = normalizeText(item && (item.technicianName || item.technicianAccountName));
    if (normalizedAccountId && recordAccountId && recordAccountId === normalizedAccountId) {
      return true;
    }
    return Boolean(normalizedAccountName && recordName && recordName === normalizedAccountName);
  });
}

function normalizeTechnicianNames(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter((item) => item);
  }

  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  return text
    .split(/[、/,，\s]+/)
    .map((item) => normalizeText(item))
    .filter((item) => item);
}
