const { getOrderById, getOrders, syncOrdersNow, updateOrder } = require('../../utils/order');
const { syncOrderToFinance } = require('../../utils/finance-sync');
const { buildFollowupItems, markFollowupDone, summarizeFollowupOrders } = require('../../utils/followup');

Page({
  data: {
    tabs: [
      { label: '全部', value: 'ALL' },
      { label: '待处理', value: 'PENDING' },
      { label: '今日到期', value: 'DUE_TODAY' },
      { label: '已逾期', value: 'OVERDUE' },
      { label: '已完成', value: 'DONE' }
    ],
    currentTab: 'ALL',
    reminderItems: [],
    filteredItems: [],
    stats: {
      total: 0,
      dueToday: 0,
      overdue: 0,
      pending: 0,
      done: 0
    }
  },

  onShow() {
    this.reloadWithSync();
  },

  onPullDownRefresh() {
    syncOrdersNow()
      .catch(() => {})
      .finally(() => {
        this.loadReminders();
        wx.stopPullDownRefresh();
      });
  },

  reloadWithSync() {
    syncOrdersNow()
      .catch(() => {})
      .finally(() => {
        this.loadReminders();
      });
  },

  loadReminders() {
    const now = new Date();
    const orders = getOrders();
    const stats = summarizeFollowupOrders(orders, now);
    const reminderItems = [];

    orders.forEach((order) => {
      const followups = buildFollowupItems(order, now);
      followups.forEach((item) => {
        reminderItems.push({
          ...item,
          reminderId: `${order.id}-${item.type}`,
          orderId: order.id,
          customerName: order.customerName || '',
          phone: order.phone || '',
          carModel: order.carModel || '',
          plateNumber: order.plateNumber || '',
          salesOwner: order.salesBrandText || '未填写',
          deliveryPassedAt: order.deliveryPassedAt || '',
          statusText: getStatusText(item.status),
          statusClass: getStatusClass(item.status)
        });
      });
    });

    reminderItems.sort(compareReminderItem);

    this.setData({
      reminderItems,
      stats
    });
    this.applyFilter(this.data.currentTab);
  },

  onTabChange(event) {
    const tab = event.currentTarget.dataset.tab;
    this.applyFilter(tab);
  },

  applyFilter(tab) {
    const activeTab = tab || this.data.currentTab;
    let filteredItems = this.data.reminderItems;

    if (activeTab === 'PENDING') {
      filteredItems = filteredItems.filter((item) => ['PENDING', 'DUE_TODAY', 'OVERDUE'].indexOf(item.status) >= 0);
    } else if (activeTab !== 'ALL') {
      filteredItems = filteredItems.filter((item) => item.status === activeTab);
    }

    this.setData({
      currentTab: activeTab,
      filteredItems
    });
  },

  markDone(event) {
    const orderId = event.currentTarget.dataset.id;
    const type = event.currentTarget.dataset.type;
    if (!orderId || !type) {
      return;
    }

    const order = getOrderById(orderId);
    if (!order) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      return;
    }

    const doneAt = buildTimeText(new Date());
    const records = markFollowupDone(order.followupRecords, type, doneAt, '');
    const updatedOrder = updateOrder(orderId, {
      followupRecords: records,
      followupLastUpdatedAt: doneAt
    });
    if (!updatedOrder) {
      wx.showToast({ title: '更新失败', icon: 'none' });
      return;
    }

    this.trySyncFinance(updatedOrder, 'ORDER_FOLLOWUP_UPDATED');
    wx.showToast({
      title: '已标记回访',
      icon: 'success'
    });
    this.reloadWithSync();
  },

  viewOrderDetail(event) {
    const orderId = event.currentTarget.dataset.id;
    if (!orderId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${orderId}`
    });
  },

  goOrderList() {
    wx.switchTab({
      url: '/pages/order-list/order-list'
    });
  },

  trySyncFinance(order, eventType) {
    if (!order || !order.id) {
      return;
    }

    syncOrderToFinance({
      order,
      eventType,
      source: 'MINIPROGRAM_FOLLOWUP'
    }).then((result) => {
      const patch = buildFinancePatch(result, eventType);
      updateOrder(order.id, patch);
    });
  }
});

function getStatusText(status) {
  if (status === 'DONE') {
    return '已完成';
  }
  if (status === 'OVERDUE') {
    return '已逾期';
  }
  if (status === 'DUE_TODAY') {
    return '今日到期';
  }
  return '待处理';
}

function getStatusClass(status) {
  if (status === 'DONE') {
    return 'status-done';
  }
  if (status === 'OVERDUE') {
    return 'status-overdue';
  }
  if (status === 'DUE_TODAY') {
    return 'status-due';
  }
  return 'status-pending';
}

function compareReminderItem(a, b) {
  const priorityA = getStatusPriority(a && a.status);
  const priorityB = getStatusPriority(b && b.status);
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  const dueA = String(a && a.dueDateText ? a.dueDateText : '');
  const dueB = String(b && b.dueDateText ? b.dueDateText : '');
  if (dueA !== dueB) {
    return dueA > dueB ? 1 : -1;
  }

  const orderIdA = String(a && a.orderId ? a.orderId : '');
  const orderIdB = String(b && b.orderId ? b.orderId : '');
  if (orderIdA !== orderIdB) {
    return orderIdA > orderIdB ? 1 : -1;
  }

  const typeA = String(a && a.type ? a.type : '');
  const typeB = String(b && b.type ? b.type : '');
  return typeA > typeB ? 1 : -1;
}

function getStatusPriority(status) {
  if (status === 'OVERDUE') {
    return 0;
  }
  if (status === 'DUE_TODAY') {
    return 1;
  }
  if (status === 'PENDING') {
    return 2;
  }
  return 3;
}

function buildFinancePatch(result, eventType) {
  const now = buildTimeText(new Date());

  if (result.ok) {
    return {
      financeSyncStatus: '已同步',
      financeSyncAt: now,
      financeSyncMessage: result.message || '同步成功',
      financeExternalId: result.externalId || '',
      financeLastEvent: eventType
    };
  }

  if (result.skipped) {
    return {
      financeSyncStatus: '未启用',
      financeSyncAt: now,
      financeSyncMessage: result.message || '未启用同步',
      financeLastEvent: eventType
    };
  }

  return {
    financeSyncStatus: '同步失败',
    financeSyncAt: now,
    financeSyncMessage: result.message || '同步失败',
    financeLastEvent: eventType
  };
}

function buildTimeText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
