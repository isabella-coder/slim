const { getOrders, syncOrdersNow } = require('../../utils/order');

Page({
  data: {
    selectedDate: '',
    entries: [],
    bayGroups: [],
    technicianGroups: [],
    conflictEntries: [],
    stats: {
      total: 0,
      assigned: 0,
      unassigned: 0,
      conflict: 0
    }
  },

  onLoad(options) {
    const date = normalizeDate(options && options.date) || buildDateText(new Date());
    this.setData({
      selectedDate: date
    });
  },

  onShow() {
    this.reloadBoardWithSync();
  },

  onPullDownRefresh() {
    syncOrdersNow()
      .catch(() => {})
      .finally(() => {
        this.loadBoard();
        wx.stopPullDownRefresh();
      });
  },

  onDateChange(event) {
    this.setData({
      selectedDate: event.detail.value
    });
    this.reloadBoardWithSync();
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
    const orders = getOrders().filter((item) => item && item.status !== '已取消' && item.serviceType !== 'WASH');
    const entries = orders
      .map((item) => buildDispatchEntry(item))
      .filter((item) => item.date === selectedDate);
    const mergedEntries = markDispatchConflicts(entries).sort(compareEntry);
    const bayGroups = buildGroups(mergedEntries, 'workBayDisplay');
    const technicianGroups = buildGroups(mergedEntries, 'technicianDisplay');
    const conflictEntries = mergedEntries.filter((item) => item.conflicts.length > 0);
    const assigned = mergedEntries.filter((item) => item.assigned).length;

    this.setData({
      entries: mergedEntries,
      bayGroups,
      technicianGroups,
      conflictEntries,
      stats: {
        total: mergedEntries.length,
        assigned,
        unassigned: Math.max(0, mergedEntries.length - assigned),
        conflict: conflictEntries.length
      }
    });
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

  goCreateOrder() {
    wx.navigateTo({
      url: '/pages/film-order/film-order'
    });
  }
});

function buildDispatchEntry(order) {
  const dispatch = order && order.dispatchInfo && typeof order.dispatchInfo === 'object'
    ? order.dispatchInfo
    : {};
  const date = normalizeDate(dispatch.date || order.appointmentDate);
  const time = normalizeTime(dispatch.time || order.appointmentTime);
  const workBay = normalizeText(dispatch.workBay);
  const technicianNames = normalizeTechnicianNames(
    Array.isArray(dispatch.technicianNames) && dispatch.technicianNames.length > 0
      ? dispatch.technicianNames
      : dispatch.technicianName
  );
  const technicianName = technicianNames[0] || '';
  const technicianDisplay = technicianNames.length > 0 ? technicianNames.join(' / ') : '未分配技师';

  return {
    id: order.id,
    customerName: order.customerName || '',
    phone: order.phone || '',
    carModel: order.carModel || '',
    plateNumber: order.plateNumber || '',
    salesOwner: order.salesBrandText || '',
    store: order.store || '',
    date,
    time,
    workBay,
    technicianName,
    technicianNames,
    workBayDisplay: workBay || '未分配工位',
    technicianDisplay,
    assigned: Boolean(workBay && technicianNames.length > 0),
    conflicts: [],
    conflictText: ''
  };
}

function markDispatchConflicts(entries) {
  const next = (Array.isArray(entries) ? entries : []).map((item) => ({
    ...item,
    conflicts: []
  }));
  const bayMap = {};
  const technicianMap = {};

  next.forEach((item, index) => {
    if (item.time && item.workBay) {
      const bayKey = `${item.time}::${item.workBay}`;
      if (!bayMap[bayKey]) {
        bayMap[bayKey] = [];
      }
      bayMap[bayKey].push(index);
    }

    if (item.time && Array.isArray(item.technicianNames) && item.technicianNames.length > 0) {
      item.technicianNames.forEach((name) => {
        const technicianKey = `${item.time}::${name}`;
        if (!technicianMap[technicianKey]) {
          technicianMap[technicianKey] = [];
        }
        technicianMap[technicianKey].push(index);
      });
    }
  });

  Object.keys(bayMap).forEach((key) => {
    const indexes = bayMap[key];
    if (!Array.isArray(indexes) || indexes.length <= 1) {
      return;
    }
    indexes.forEach((index) => {
      next[index].conflicts.push('工位冲突');
    });
  });

  Object.keys(technicianMap).forEach((key) => {
    const indexes = technicianMap[key];
    if (!Array.isArray(indexes) || indexes.length <= 1) {
      return;
    }
    indexes.forEach((index) => {
      next[index].conflicts.push('技师冲突');
    });
  });

  return next.map((item) => ({
    ...item,
    conflictText: item.conflicts.join(' / ')
  }));
}

function buildGroups(entries, keyName) {
  const source = Array.isArray(entries) ? entries : [];
  const map = {};

  source.forEach((item) => {
    const key = item[keyName] || '未分配';
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(item);
  });

  return Object.keys(map)
    .sort(compareGroupName)
    .map((name) => ({
      name,
      items: map[name].sort(compareEntry)
    }));
}

function compareEntry(a, b) {
  const timeA = normalizeTime(a && a.time);
  const timeB = normalizeTime(b && b.time);
  if (timeA !== timeB) {
    return timeA > timeB ? 1 : -1;
  }

  const idA = a && a.id ? String(a.id) : '';
  const idB = b && b.id ? String(b.id) : '';
  return idA > idB ? 1 : -1;
}

function compareGroupName(a, b) {
  const nameA = String(a || '');
  const nameB = String(b || '');
  const aUnassigned = nameA.indexOf('未分配') >= 0;
  const bUnassigned = nameB.indexOf('未分配') >= 0;
  if (aUnassigned !== bUnassigned) {
    return aUnassigned ? 1 : -1;
  }
  return nameA > nameB ? 1 : -1;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeTime(value) {
  const text = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : '';
}

function normalizeText(value) {
  return String(value || '').trim();
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

function buildDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
