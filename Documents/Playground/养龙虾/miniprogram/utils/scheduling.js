const DAILY_WORK_BAY_LIMIT = 10;

function getDailyCapacityStatus(options) {
  const config = options && typeof options === 'object' ? options : {};
  const list = Array.isArray(config.orders) ? config.orders : [];
  const date = normalizeDate(config.date);
  const store = normalizeText(config.store);
  const excludeOrderId = normalizeText(config.excludeOrderId);
  const limit = normalizeLimit(config.limit);

  if (!date) {
    return {
      date: '',
      store,
      limit,
      occupied: 0,
      remaining: limit,
      full: false
    };
  }

  let occupied = 0;
  list.forEach((item) => {
    if (!isCountableOrder(item, excludeOrderId)) {
      return;
    }

    const itemDate = getOrderScheduleDate(item);
    if (itemDate !== date) {
      return;
    }

    if (store && getOrderStore(item) !== store) {
      return;
    }

    occupied += 1;
  });

  const remaining = Math.max(0, limit - occupied);
  return {
    date,
    store,
    limit,
    occupied,
    remaining,
    full: occupied >= limit
  };
}

function getDailyCapacityMessage(capacityStatus) {
  const status = capacityStatus && typeof capacityStatus === 'object'
    ? capacityStatus
    : null;
  if (!status || !status.date) {
    return '预约日期无效，请重新选择。';
  }

  const store = status.store || '当前门店';
  return `${status.date} ${store}工位已满（${status.occupied}/${status.limit}），请改约其他日期。`;
}

function isOrderScheduledOn(order, date, store) {
  const targetDate = normalizeDate(date);
  if (!targetDate) {
    return false;
  }

  const targetStore = normalizeText(store);
  if (!order || typeof order !== 'object') {
    return false;
  }

  if (getOrderScheduleDate(order) !== targetDate) {
    return false;
  }

  if (targetStore && getOrderStore(order) !== targetStore) {
    return false;
  }

  return true;
}

function getOrderScheduleDate(order) {
  if (!order || typeof order !== 'object') {
    return '';
  }

  const dispatch = order.dispatchInfo && typeof order.dispatchInfo === 'object'
    ? order.dispatchInfo
    : {};

  return normalizeDate(dispatch.date || order.appointmentDate);
}

function getOrderStore(order) {
  if (!order || typeof order !== 'object') {
    return '';
  }
  return normalizeText(order.store);
}

function isCountableOrder(order, excludeOrderId) {
  if (!order || typeof order !== 'object') {
    return false;
  }

  if (order.status === '已取消') {
    return false;
  }

  if (excludeOrderId && normalizeText(order.id) === excludeOrderId) {
    return false;
  }

  return true;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return DAILY_WORK_BAY_LIMIT;
  }
  return Math.round(number);
}

module.exports = {
  DAILY_WORK_BAY_LIMIT,
  getDailyCapacityMessage,
  getDailyCapacityStatus,
  getOrderScheduleDate,
  getOrderStore,
  isOrderScheduledOn
};
