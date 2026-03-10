const { formatDateTime, getOrders, syncOrdersNow, updateOrder } = require('../../utils/order');
const { TECHNICIAN_OPTIONS } = require('../../utils/staff-options');
const { hasMiniAuthSession, navigateToStoreLogin } = require('../../utils/page-access');
const { canDispatchOrderContext, getCurrentUserContext } = require('../../utils/user-context');

const SLOT_OPTIONS = buildTimeSlots(9, 19);

Page({
  data: {
    needLogin: false,
    noPermission: false,
    selectedDate: '',
    slotOptions: SLOT_OPTIONS,
    technicianOptions: TECHNICIAN_OPTIONS,
    slotRows: [],
    stats: {
      total: 0,
      unassigned: 0,
      assigned: 0,
      completed: 0,
      conflict: 0
    }
  },

  onLoad(options) {
    const selectedDate = normalizeDate(options && options.date) || buildDateText(new Date());
    this.setData({ selectedDate });
  },

  onShow() {
    if (!this.ensurePageAccess()) {
      return;
    }
    this.reloadBoardWithSync();
  },

  onPullDownRefresh() {
    if (!this.ensurePageAccess()) {
      wx.stopPullDownRefresh();
      return;
    }
    syncOrdersNow()
      .catch(() => {})
      .finally(() => {
        this.loadBoard();
        wx.stopPullDownRefresh();
      });
  },

  onDateChange(event) {
    if (!this.ensurePageAccess()) {
      return;
    }
    this.setData({ selectedDate: event.detail.value });
    this.reloadBoardWithSync();
  },

  ensurePageAccess() {
    if (!hasMiniAuthSession()) {
      this.setData({
        needLogin: true,
        noPermission: false,
        slotRows: [],
        stats: {
          total: 0,
          unassigned: 0,
          assigned: 0,
          completed: 0,
          conflict: 0
        }
      });
      return false;
    }

    const user = getCurrentUserContext();
    if (!canDispatchOrderContext(user)) {
      this.setData({
        needLogin: false,
        noPermission: true,
        slotRows: [],
        stats: {
          total: 0,
          unassigned: 0,
          assigned: 0,
          completed: 0,
          conflict: 0
        }
      });
      return false;
    }

    this.setData({
      needLogin: false,
      noPermission: false
    });
    return true;
  },

  goLogin() {
    navigateToStoreLogin();
  },

  reloadBoardWithSync() {
    syncOrdersNow()
      .catch(() => {})
      .finally(() => {
        this.loadBoard();
      });
  },

  loadBoard() {
    const selectedDate = this.data.selectedDate || buildDateText(new Date());
    const washOrders = getOrders().filter((item) => {
      if (!item || item.serviceType !== 'WASH' || item.status === '已取消') {
        return false;
      }
      const date = getOrderDate(item);
      return date === selectedDate;
    });

    const slotMap = {};
    SLOT_OPTIONS.forEach((time) => {
      slotMap[time] = [];
    });

    washOrders.forEach((order) => {
      const time = normalizeTime(getOrderTime(order));
      if (!slotMap[time]) {
        slotMap[time] = [];
      }
      slotMap[time].push(buildEntry(order, this.data.technicianOptions));
    });

    const slotRows = SLOT_OPTIONS.map((time) => {
      const orders = Array.isArray(slotMap[time]) ? slotMap[time] : [];
      return {
        time,
        hasOrder: orders.length > 0,
        conflict: orders.length > 1,
        orders: orders.sort(compareEntry)
      };
    });

    const flatOrders = slotRows.reduce((acc, row) => acc.concat(row.orders), []);
    const stats = {
      total: flatOrders.length,
      unassigned: flatOrders.filter((item) => item.boardStatus === '待派工').length,
      assigned: flatOrders.filter((item) => item.boardStatus === '已派工').length,
      completed: flatOrders.filter((item) => item.boardStatus === '已完工').length,
      conflict: slotRows.filter((row) => row.conflict).length
    };

    this.setData({
      slotRows,
      stats
    });
  },

  onTechnicianChange(event) {
    const rowIndex = Number(event.currentTarget.dataset.rowIndex);
    const orderIndex = Number(event.currentTarget.dataset.orderIndex);
    const technicianIndex = Number(event.detail.value);
    const technicianName = this.data.technicianOptions[technicianIndex] || '';

    this.setData({
      [`slotRows[${rowIndex}].orders[${orderIndex}].technicianIndex`]: technicianIndex,
      [`slotRows[${rowIndex}].orders[${orderIndex}].technicianName`]: technicianName
    });
  },

  dispatchOrder(event) {
    const rowIndex = Number(event.currentTarget.dataset.rowIndex);
    const orderIndex = Number(event.currentTarget.dataset.orderIndex);
    const entry = getEntry(this.data.slotRows, rowIndex, orderIndex);
    if (!entry || !entry.id) {
      return;
    }

    if (!entry.technicianName || this.data.technicianOptions.indexOf(entry.technicianName) < 0) {
      wx.showToast({ title: '请先选择技师', icon: 'none' });
      return;
    }

    const order = findOrderById(entry.id);
    if (!order || order.status === '已取消') {
      wx.showToast({ title: '订单不可派工', icon: 'none' });
      return;
    }

    const dispatchInfo = order.dispatchInfo && typeof order.dispatchInfo === 'object'
      ? order.dispatchInfo
      : {};
    const patch = {
      status: order.status === '已取消' ? '已取消' : '未完工',
      technicianName: entry.technicianName,
      dispatchInfo: {
        ...dispatchInfo,
        date: getOrderDate(order),
        time: getOrderTime(order),
        workBay: dispatchInfo.workBay || entry.workBay || '1号工位',
        technicianName: entry.technicianName,
        updatedAt: formatDateTime(new Date())
      }
    };

    const updated = updateOrder(order.id, patch);
    if (!updated) {
      wx.showToast({ title: '派工失败', icon: 'none' });
      return;
    }

    wx.showToast({ title: '派工成功', icon: 'success' });
    this.loadBoard();
  },

  completeOrder(event) {
    const rowIndex = Number(event.currentTarget.dataset.rowIndex);
    const orderIndex = Number(event.currentTarget.dataset.orderIndex);
    const entry = getEntry(this.data.slotRows, rowIndex, orderIndex);
    if (!entry || !entry.id) {
      return;
    }

    const order = findOrderById(entry.id);
    if (!order || order.status === '已取消') {
      wx.showToast({ title: '订单不可完工', icon: 'none' });
      return;
    }

    const patch = {
      status: '已完工',
      deliveryStatus: '已交车通过',
      deliveryPassedAt: formatDateTime(new Date())
    };

    const updated = updateOrder(order.id, patch);
    if (!updated) {
      wx.showToast({ title: '完工失败', icon: 'none' });
      return;
    }

    wx.showToast({ title: '已标记完工', icon: 'success' });
    this.loadBoard();
  },

  uploadPhotos(event) {
    const rowIndex = Number(event.currentTarget.dataset.rowIndex);
    const orderIndex = Number(event.currentTarget.dataset.orderIndex);
    const entry = getEntry(this.data.slotRows, rowIndex, orderIndex);
    if (!entry || !entry.id) {
      return;
    }

    const order = findOrderById(entry.id);
    if (!order) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const selected = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [];
        const current = sanitizePhotos(order.constructionPhotos);
        const photos = current.concat(selected).slice(0, 9);

        const updated = updateOrder(order.id, {
          constructionPhotos: photos
        });

        if (!updated) {
          wx.showToast({ title: '上传失败', icon: 'none' });
          return;
        }

        wx.showToast({ title: '上传成功', icon: 'success' });
        this.loadBoard();
      }
    });
  },

  viewOrderDetail(event) {
    const orderId = event.currentTarget.dataset.id;
    if (!orderId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/wash-order-detail/wash-order-detail?id=${orderId}`
    });
  },

  goWashOrder() {
    wx.navigateTo({
      url: '/pages/wash-order/wash-order'
    });
  },

  goOrderList() {
    wx.navigateTo({
      url: '/pages/order-list/order-list'
    });
  }
});

function buildEntry(order, technicianOptions) {
  const technicianName = normalizeText(getDispatchValue(order, 'technicianName') || order.technicianName);
  const technicianIndex = technicianOptions.indexOf(technicianName);
  const boardStatus = getBoardStatus(order, technicianName);

  return {
    id: order.id,
    customerName: normalizeText(order.customerName),
    phone: normalizeText(order.phone),
    store: normalizeText(order.store),
    workBay: normalizeText(getDispatchValue(order, 'workBay')),
    appointmentTime: normalizeTime(getOrderTime(order)),
    totalPrice: getOrderAmount(order),
    technicianName,
    technicianIndex: technicianIndex >= 0 ? technicianIndex : -1,
    boardStatus,
    statusClass: getStatusClass(boardStatus),
    photosCount: sanitizePhotos(order.constructionPhotos).length
  };
}

function getBoardStatus(order, technicianName) {
  if (order.status === '已取消') {
    return '已取消';
  }

  if (order.deliveryStatus === '已交车通过') {
    return '已完工';
  }

  if (technicianName) {
    return '已派工';
  }

  return '待派工';
}

function getStatusClass(status) {
  if (status === '已完工') {
    return 'status-completed';
  }

  if (status === '已派工') {
    return 'status-assigned';
  }

  if (status === '已取消') {
    return 'status-cancelled';
  }

  return 'status-pending';
}

function compareEntry(a, b) {
  const idA = normalizeText(a && a.id);
  const idB = normalizeText(b && b.id);
  if (idA === idB) {
    return 0;
  }
  return idA > idB ? 1 : -1;
}

function getEntry(slotRows, rowIndex, orderIndex) {
  const rows = Array.isArray(slotRows) ? slotRows : [];
  const row = rows[rowIndex];
  if (!row || !Array.isArray(row.orders)) {
    return null;
  }
  return row.orders[orderIndex] || null;
}

function findOrderById(orderId) {
  return getOrders().find((item) => item && item.id === orderId);
}

function getOrderAmount(order) {
  const summary = order && order.priceSummary && typeof order.priceSummary === 'object'
    ? order.priceSummary
    : {};
  const value = Number(summary.totalPrice);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function getOrderDate(order) {
  return normalizeDate(order && (order.appointmentDate || getDispatchValue(order, 'date')));
}

function getOrderTime(order) {
  return normalizeTime(order && (order.appointmentTime || getDispatchValue(order, 'time')));
}

function getDispatchValue(order, field) {
  const dispatchInfo = order && order.dispatchInfo && typeof order.dispatchInfo === 'object'
    ? order.dispatchInfo
    : {};
  return dispatchInfo[field];
}

function sanitizePhotos(photos) {
  if (!Array.isArray(photos)) {
    return [];
  }

  return photos.map((item) => normalizeText(item)).filter((item) => item);
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return buildDateText(new Date());
}

function normalizeTime(value) {
  const text = normalizeText(value);
  if (SLOT_OPTIONS.indexOf(text) >= 0) {
    return text;
  }
  return SLOT_OPTIONS[0];
}

function normalizeText(value) {
  return String(value || '').trim();
}

function buildDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildTimeSlots(startHour, endHour) {
  const slots = [];
  for (let hour = startHour; hour < endHour; hour += 1) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
  }
  return slots;
}
