const { getOrders, syncOrdersNow } = require('../../utils/order');
const { hasMiniAuthSession, navigateToStoreLogin } = require('../../utils/page-access');
const { canViewSalesBoardContext, getCurrentUserContext } = require('../../utils/user-context');

const DIMENSION_TABS = [
  { label: '按天', value: 'DAY' },
  { label: '按周', value: 'WEEK' },
  { label: '按月', value: 'MONTH' }
];

Page({
  data: {
    needLogin: false,
    noPermission: false,
    dimensionTabs: DIMENSION_TABS,
    currentDimension: 'DAY',
    anchorDate: '',
    periodRecords: [],
    selectedPeriodKey: '',
    selectedPeriodLabel: '',
    summary: {
      orderCount: 0,
      totalAmount: 0,
      avgTicket: 0
    },
    salesRecords: []
  },

  onLoad() {
    this.setData({
      anchorDate: buildDateText(new Date())
    });
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
        this.reloadBoard();
        wx.stopPullDownRefresh();
      });
  },

  onDimensionChange(event) {
    if (!this.ensurePageAccess()) {
      return;
    }
    const value = event.currentTarget.dataset.value;
    if (!value || value === this.data.currentDimension) {
      return;
    }

    this.setData({
      currentDimension: value,
      selectedPeriodKey: buildPeriodKeyByDate(this.data.anchorDate, value)
    });
    this.reloadBoard();
  },

  onAnchorDateChange(event) {
    if (!this.ensurePageAccess()) {
      return;
    }
    const nextDate = normalizeText(event.detail.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      return;
    }

    this.setData({
      anchorDate: nextDate,
      selectedPeriodKey: buildPeriodKeyByDate(nextDate, this.data.currentDimension)
    });
    this.reloadBoardWithSync();
  },

  onPeriodChange(event) {
    if (!this.ensurePageAccess()) {
      return;
    }
    const key = event.currentTarget.dataset.key;
    if (!key || key === this.data.selectedPeriodKey) {
      return;
    }

    const period = this.data.periodRecords.find((item) => item.key === key);
    if (!period) {
      return;
    }

    const sourceOrders = getFilmPerformanceOrders(getOrders());
    const salesRecords = buildSalesRecords(sourceOrders, this.data.currentDimension, key);
    this.setData({
      selectedPeriodKey: key,
      selectedPeriodLabel: period.label,
      anchorDate: buildAnchorDateByPeriodKey(key, this.data.currentDimension, this.data.anchorDate),
      summary: {
        orderCount: period.orderCount,
        totalAmount: period.totalAmount,
        avgTicket: period.avgTicket
      },
      salesRecords
    });
  },

  ensurePageAccess() {
    if (!hasMiniAuthSession()) {
      this.setData({
        needLogin: true,
        noPermission: false,
        periodRecords: [],
        salesRecords: [],
        selectedPeriodKey: '',
        selectedPeriodLabel: '',
        summary: {
          orderCount: 0,
          totalAmount: 0,
          avgTicket: 0
        }
      });
      return false;
    }

    const user = getCurrentUserContext();
    if (!canViewSalesBoardContext(user)) {
      this.setData({
        needLogin: false,
        noPermission: true,
        periodRecords: [],
        salesRecords: [],
        selectedPeriodKey: '',
        selectedPeriodLabel: '',
        summary: {
          orderCount: 0,
          totalAmount: 0,
          avgTicket: 0
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
        this.reloadBoard();
      });
  },

  reloadBoard() {
    const sourceOrders = getFilmPerformanceOrders(getOrders());
    const periodRecords = buildPeriodRecords(sourceOrders, this.data.currentDimension);
    const preferredKey = this.data.selectedPeriodKey || buildPeriodKeyByDate(this.data.anchorDate, this.data.currentDimension);
    const selectedPeriod = pickSelectedPeriod(periodRecords, preferredKey);
    const salesRecords = selectedPeriod
      ? buildSalesRecords(sourceOrders, this.data.currentDimension, selectedPeriod.key)
      : [];

    this.setData({
      periodRecords,
      selectedPeriodKey: selectedPeriod ? selectedPeriod.key : '',
      selectedPeriodLabel: selectedPeriod ? selectedPeriod.label : '',
      anchorDate: normalizeAnchorDate(this.data.anchorDate),
      summary: selectedPeriod
        ? {
          orderCount: selectedPeriod.orderCount,
          totalAmount: selectedPeriod.totalAmount,
          avgTicket: selectedPeriod.avgTicket
        }
        : {
          orderCount: 0,
          totalAmount: 0,
          avgTicket: 0
        },
      salesRecords
    });
  },

  goFilmOrder() {
    wx.navigateTo({
      url: '/pages/film-order/film-order'
    });
  },

  goOrderList() {
    wx.navigateTo({
      url: '/pages/order-list/order-list'
    });
  }
});

function getFilmPerformanceOrders(orders) {
  const list = Array.isArray(orders) ? orders : [];
  return list.filter((item) => {
    if (!item || item.status === '已取消') {
      return false;
    }

    if (item.serviceType === 'WASH') {
      return false;
    }

    const date = getOrderDate(item);
    return Boolean(date);
  });
}

function buildPeriodRecords(orders, dimension) {
  const map = {};
  const list = Array.isArray(orders) ? orders : [];

  list.forEach((order) => {
    const date = getOrderDate(order);
    const period = buildPeriodMeta(date, dimension);
    if (!period) {
      return;
    }

    if (!map[period.key]) {
      map[period.key] = {
        key: period.key,
        label: period.label,
        sortValue: period.sortValue,
        orderCount: 0,
        totalAmount: 0,
        avgTicket: 0
      };
    }

    map[period.key].orderCount += 1;
    map[period.key].totalAmount += getOrderAmount(order);
  });

  return Object.keys(map)
    .map((key) => {
      const item = map[key];
      return {
        key: item.key,
        label: item.label,
        sortValue: item.sortValue,
        orderCount: item.orderCount,
        totalAmount: roundMoney(item.totalAmount),
        avgTicket: item.orderCount > 0 ? roundMoney(item.totalAmount / item.orderCount) : 0
      };
    })
    .sort((a, b) => b.sortValue - a.sortValue);
}

function buildSalesRecords(orders, dimension, periodKey) {
  const map = {};
  const list = Array.isArray(orders) ? orders : [];

  list.forEach((order) => {
    const date = getOrderDate(order);
    const period = buildPeriodMeta(date, dimension);
    if (!period || period.key !== periodKey) {
      return;
    }

    const salesName = normalizeText(order.salesBrandText) || '未分配销售';
    if (!map[salesName]) {
      map[salesName] = {
        salesName,
        orderCount: 0,
        totalAmount: 0,
        avgTicket: 0
      };
    }

    map[salesName].orderCount += 1;
    map[salesName].totalAmount += getOrderAmount(order);
  });

  return Object.keys(map)
    .map((name) => {
      const item = map[name];
      return {
        salesName: item.salesName,
        orderCount: item.orderCount,
        totalAmount: roundMoney(item.totalAmount),
        avgTicket: item.orderCount > 0 ? roundMoney(item.totalAmount / item.orderCount) : 0
      };
    })
    .sort((a, b) => {
      if (a.totalAmount !== b.totalAmount) {
        return b.totalAmount - a.totalAmount;
      }
      if (a.orderCount !== b.orderCount) {
        return b.orderCount - a.orderCount;
      }
      return a.salesName > b.salesName ? 1 : -1;
    });
}

function pickSelectedPeriod(periodRecords, preferredKey) {
  const list = Array.isArray(periodRecords) ? periodRecords : [];
  if (list.length === 0) {
    return null;
  }

  const matched = list.find((item) => item.key === preferredKey);
  if (matched) {
    return matched;
  }

  return list[0];
}

function buildPeriodKeyByDate(dateText, dimension) {
  const date = parseDateText(dateText);
  if (!date) {
    return '';
  }

  const period = buildPeriodMeta(buildDateText(date), dimension);
  return period ? period.key : '';
}

function buildAnchorDateByPeriodKey(periodKey, dimension, fallbackDate) {
  const key = normalizeText(periodKey);
  if (!key) {
    return normalizeAnchorDate(fallbackDate);
  }

  if (dimension === 'MONTH') {
    if (/^\d{4}-\d{2}$/.test(key)) {
      return `${key}-01`;
    }
    return normalizeAnchorDate(fallbackDate);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return key;
  }

  return normalizeAnchorDate(fallbackDate);
}

function normalizeAnchorDate(value) {
  const text = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return buildDateText(new Date());
}

function buildPeriodMeta(dateText, dimension) {
  const date = parseDateText(dateText);
  if (!date) {
    return null;
  }

  if (dimension === 'MONTH') {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return {
      key,
      label: `${year}年${String(month).padStart(2, '0')}月`,
      sortValue: new Date(year, month - 1, 1).getTime()
    };
  }

  if (dimension === 'WEEK') {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart.getTime());
    weekEnd.setDate(weekStart.getDate() + 6);
    const key = buildDateText(weekStart);
    return {
      key,
      label: `${buildDateText(weekStart)} ~ ${buildDateText(weekEnd)}`,
      sortValue: weekStart.getTime()
    };
  }

  const key = buildDateText(date);
  return {
    key,
    label: key,
    sortValue: date.getTime()
  };
}

function getWeekStart(date) {
  const source = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = source.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  source.setDate(source.getDate() + offset);
  return source;
}

function getOrderDate(order) {
  const createdAt = normalizeText(order && order.createdAt);
  const matched = createdAt.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched && matched[1]) {
    return matched[1];
  }

  const appointmentDate = normalizeText(order && order.appointmentDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
    return appointmentDate;
  }

  return '';
}

function getOrderAmount(order) {
  const summary = order && order.priceSummary && typeof order.priceSummary === 'object'
    ? order.priceSummary
    : {};
  const value = Number(summary.totalPrice);
  return Number.isFinite(value) ? value : 0;
}

function parseDateText(dateText) {
  const text = normalizeText(dateText);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  const date = new Date(`${text.replace(/-/g, '/')} 00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function buildDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function roundMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.round(num * 100) / 100;
}

function normalizeText(value) {
  return String(value || '').trim();
}
