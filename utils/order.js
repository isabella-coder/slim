const { getFinanceConfig } = require('../config/finance.config');

const ORDER_STORAGE_KEY = 'filmOrders';
const ORDER_SYNC_PULL_PATH = '/api/v1/internal/orders';
const ORDER_SYNC_PUSH_PATH = '/api/v1/internal/orders/sync';
let orderSyncPromise = null;

const PRICE_RULES = {
  packageBase: {
    FRONT: 1280,
    SIDE_REAR: 1880,
    FULL: 3280,
    PPF: 12800
  },
  addOnFee: {
    STERILIZATION: 0,
    WINDSHIELD_OIL_FILM: 0,
    FREE_PATCH_50: 0,
    // Legacy codes kept for backward compatibility with old local orders.
    SUNROOF: 0,
    COATING: 0
  }
};

const ORDER_STATUS_ALIAS = {
  '待确认': '未完工',
  '已确认': '已完工',
  '未完工': '未完工',
  '已完工': '已完工',
  '已取消': '已取消'
};

function getOrders() {
  const orders = wx.getStorageSync(ORDER_STORAGE_KEY);
  if (!Array.isArray(orders)) {
    return [];
  }
  return orders.map((item) => normalizeOrderRecord(item)).filter((item) => Boolean(item));
}

function saveOrders(orders) {
  const source = Array.isArray(orders) ? orders : [];
  const normalized = source.map((item) => normalizeOrderRecord(item)).filter((item) => Boolean(item));
  wx.setStorageSync(ORDER_STORAGE_KEY, normalized);
}

function addOrder(order) {
  const orders = getOrders();
  orders.unshift(normalizeOrderRecord(order));
  saveOrders(orders);
  triggerOrderSync(orders);
}

function getOrderById(orderId) {
  return getOrders().find((item) => item.id === orderId);
}

function updateOrderStatus(orderId, status) {
  return updateOrder(orderId, { status });
}

function updateOrder(orderId, patch) {
  const orders = getOrders();
  let matchedOrder = null;
  const safePatch = patch && typeof patch === 'object' ? patch : {};
  if (safePatch.status !== undefined) {
    safePatch.status = normalizeStatusValue(safePatch.status);
  }

  const updated = orders.map((item) => {
    if (item.id !== orderId) {
      return item;
    }

    matchedOrder = {
      ...item,
      ...safePatch,
      updatedAt: formatDateTime(new Date())
    };
    return normalizeOrderRecord(matchedOrder);
  });

  saveOrders(updated);
  triggerOrderSync(updated);
  return matchedOrder;
}

function syncOrdersNow() {
  return startOrderSync(getOrders());
}

function calculatePrice(formData, filmPackages, addOnOptions) {
  const packagePrice = getBasePrice(formData, filmPackages);

  const addOnCodes = Array.isArray(formData.addOns) ? formData.addOns : [];
  let addOnFee = addOnCodes.reduce((sum, code) => {
    return sum + (PRICE_RULES.addOnFee[code] || 0);
  }, 0);
  if (addOnCodes.length > 0 && addOnFee === 0) {
    addOnFee = getAddOnFeeFromOptions(addOnCodes, addOnOptions);
  }

  const totalPrice = packagePrice + addOnFee;
  const manualDeposit = getManualDeposit(formData);
  const deposit = manualDeposit !== null ? manualDeposit : Math.round(totalPrice * 0.1);

  return {
    packagePrice,
    addOnFee,
    totalPrice,
    deposit
  };
}

function getBasePrice(formData, filmPackages) {
  const list = Array.isArray(filmPackages) ? filmPackages : [];
  const selectedCodes = getSelectedPackageCodes(formData);
  const hasMultiSelectionField = Boolean(formData && Array.isArray(formData.filmPackages));

  if (selectedCodes.length > 0) {
    const total = selectedCodes.reduce((sum, code) => {
      const matched = list.find((item) => item.value === code);
      if (matched && Number.isFinite(Number(matched.basePrice)) && Number(matched.basePrice) > 0) {
        return sum + Math.round(Number(matched.basePrice));
      }
      return sum + getLegacyPackageBasePrice(code);
    }, 0);

    if (total > 0) {
      return total;
    }
  }

  if (hasMultiSelectionField) {
    return 0;
  }

  const firstValid = list.find((item) => Number.isFinite(Number(item.basePrice)) && Number(item.basePrice) > 0);
  if (firstValid) {
    return Math.round(Number(firstValid.basePrice));
  }

  // Fallback for legacy orders or missing catalog sync.
  const fallbackCode = typeof formData.filmPackage === 'string' ? formData.filmPackage : '';
  return getLegacyPackageBasePrice(fallbackCode);
}

function getAddOnFeeFromOptions(addOnCodes, addOnOptions) {
  if (!Array.isArray(addOnOptions) || addOnOptions.length === 0) {
    return 0;
  }

  return addOnOptions.reduce((sum, item) => {
    if (addOnCodes.indexOf(item.value) < 0) {
      return sum;
    }

    const fee = Number(item.fee);
    return sum + (Number.isFinite(fee) ? fee : 0);
  }, 0);
}

function getSelectedPackageCodes(formData) {
  if (!formData || typeof formData !== 'object') {
    return [];
  }

  if (Array.isArray(formData.filmPackages) && formData.filmPackages.length > 0) {
    return formData.filmPackages.map((item) => String(item || '').trim()).filter((item) => item);
  }

  if (typeof formData.filmPackage === 'string' && formData.filmPackage.trim()) {
    return [formData.filmPackage.trim()];
  }

  return [];
}

function getLegacyPackageBasePrice(code) {
  return PRICE_RULES.packageBase[code] || 0;
}

function getManualDeposit(formData) {
  if (!formData || typeof formData !== 'object') {
    return null;
  }

  const rawValue = formData.depositAmount;
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  const text = String(rawValue).trim();
  if (!text) {
    return null;
  }

  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount);
}

function createOrderId() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const randomPart = `${Math.floor(Math.random() * 900) + 100}`;
  return `TM${datePart}${timePart}${randomPart}`;
}

function formatDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(number) {
  return number.toString().padStart(2, '0');
}

function normalizeStatusValue(status) {
  const text = String(status || '').trim();
  if (ORDER_STATUS_ALIAS[text]) {
    return ORDER_STATUS_ALIAS[text];
  }
  if (!text) {
    return '未完工';
  }
  return text;
}

function normalizeOrderRecord(order) {
  if (!order || typeof order !== 'object') {
    return null;
  }

  return {
    ...order,
    status: normalizeStatusValue(order.status)
  };
}

function triggerOrderSync(orders) {
  startOrderSync(orders).catch(() => {});
}

function startOrderSync(localOrders) {
  if (orderSyncPromise) {
    return orderSyncPromise;
  }

  const source = Array.isArray(localOrders) ? localOrders : getOrders();
  orderSyncPromise = syncOrdersWithServer(source).finally(() => {
    orderSyncPromise = null;
  });
  return orderSyncPromise;
}

function syncOrdersWithServer(localOrders) {
  const config = getOrderSyncConfig();
  const source = normalizeOrderList(localOrders);
  if (!config.enabled) {
    return Promise.resolve(source);
  }

  return requestRemoteOrders(config)
    .then((remoteOrders) => {
      const mergedOrders = mergeOrders(source, remoteOrders);
      saveOrders(mergedOrders);
      return pushOrdersToRemote(config, mergedOrders)
        .then(() => mergedOrders)
        .catch(() => mergedOrders);
    })
    .catch(() => source);
}

function getOrderSyncConfig() {
  const financeConfig = getFinanceConfig();
  const baseUrl = normalizeBaseUrl(financeConfig && financeConfig.baseUrl);
  const syncEnabled = Boolean(financeConfig && financeConfig.enabled);
  const timeoutValue = Number(financeConfig && financeConfig.timeout);
  if (syncEnabled && !baseUrl && financeConfig && financeConfig.envVersion && financeConfig.envVersion !== 'develop') {
    console.warn(`[order-sync] 缺少公网同步地址，当前环境：${financeConfig.envVersion}`);
  }
  return {
    enabled: Boolean(syncEnabled && baseUrl),
    baseUrl,
    apiToken: String(financeConfig && financeConfig.apiToken ? financeConfig.apiToken : '').trim(),
    timeout: Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 10000,
    extraHeaders: financeConfig && typeof financeConfig.extraHeaders === 'object'
      ? financeConfig.extraHeaders
      : {}
  };
}

function requestRemoteOrders(config) {
  return requestWithConfig({
    config,
    path: ORDER_SYNC_PULL_PATH,
    method: 'GET'
  }).then((result) => {
    const payload = result && result.data ? result.data : {};
    const items = Array.isArray(payload.items)
      ? payload.items
      : (Array.isArray(payload.orders) ? payload.orders : []);
    return normalizeOrderList(items);
  });
}

function pushOrdersToRemote(config, orders) {
  const source = normalizeOrderList(orders);
  return requestWithConfig({
    config,
    path: ORDER_SYNC_PUSH_PATH,
    method: 'POST',
    data: {
      orders: source
    }
  }).then(() => source);
}

function requestWithConfig(options) {
  const requestOptions = options && typeof options === 'object' ? options : {};
  const config = requestOptions.config || {};
  const url = `${String(config.baseUrl || '').replace(/\/+$/, '')}${String(requestOptions.path || '')}`;
  const headers = buildSyncHeaders(config);
  const timeout = Number(config.timeout) > 0 ? Number(config.timeout) : 10000;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: requestOptions.method || 'GET',
      header: headers,
      data: requestOptions.data,
      timeout,
      success: (res) => {
        const statusCode = Number(res.statusCode);
        if (!(statusCode >= 200 && statusCode < 300)) {
          reject(new Error(`请求失败：${statusCode}`));
          return;
        }
        resolve(res);
      },
      fail: (error) => {
        reject(error || new Error('网络请求失败'));
      }
    });
  });
}

function buildSyncHeaders(config) {
  const baseHeaders = {
    'content-type': 'application/json'
  };
  const token = String(config && config.apiToken ? config.apiToken : '').trim();
  if (token) {
    baseHeaders.Authorization = `Bearer ${token}`;
    baseHeaders['X-Api-Token'] = token;
  }

  const extraHeaders = config && typeof config.extraHeaders === 'object' ? config.extraHeaders : {};
  return {
    ...baseHeaders,
    ...extraHeaders
  };
}

function mergeOrders(localOrders, remoteOrders) {
  const localList = normalizeOrderList(localOrders);
  const remoteList = normalizeOrderList(remoteOrders);
  const orderMap = {};

  remoteList.forEach((item) => {
    if (!item || !item.id) {
      return;
    }
    orderMap[item.id] = item;
  });

  localList.forEach((item) => {
    if (!item || !item.id) {
      return;
    }

    const remote = orderMap[item.id];
    if (!remote) {
      orderMap[item.id] = item;
      return;
    }

    const localVersion = getOrderVersion(item);
    const remoteVersion = getOrderVersion(remote);
    orderMap[item.id] = localVersion >= remoteVersion ? item : remote;
  });

  const merged = Object.keys(orderMap).map((key) => orderMap[key]);
  merged.sort((a, b) => getOrderSortScore(b) - getOrderSortScore(a));
  return merged;
}

function normalizeOrderList(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map((item) => normalizeOrderRecord(item)).filter((item) => Boolean(item));
}

function getOrderVersion(order) {
  if (!order || typeof order !== 'object') {
    return 0;
  }
  const updated = parseDateText(order.updatedAt);
  if (updated > 0) {
    return updated;
  }
  return parseDateText(order.createdAt);
}

function getOrderSortScore(order) {
  if (!order || typeof order !== 'object') {
    return 0;
  }
  const created = parseDateText(order.createdAt);
  if (created > 0) {
    return created;
  }
  return parseDateText(order.updatedAt);
}

function parseDateText(value) {
  const source = String(value || '').trim();
  if (!source) {
    return 0;
  }
  const normalized = source.replace(/-/g, '/');
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text.replace(/\/+$/, '');
}

module.exports = {
  ORDER_STORAGE_KEY,
  addOrder,
  calculatePrice,
  createOrderId,
  formatDateTime,
  getOrderById,
  getOrders,
  syncOrdersNow,
  updateOrder,
  updateOrderStatus
};
