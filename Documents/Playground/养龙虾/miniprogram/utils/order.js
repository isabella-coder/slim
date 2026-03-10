const { getFinanceConfig } = require('../config/finance.config');
const { getMiniAuthSession } = require('./mini-auth');

const ORDER_STORAGE_KEY = 'filmOrders';
const ORDER_DIRTY_IDS_KEY = 'filmOrderDirtyIds';
const ORDER_SYNC_CURSOR_KEY = 'filmOrderSyncCursor';
const ORDER_SYNC_CONFLICTS_KEY = 'filmOrderSyncConflicts';
const ORDER_SYNC_STATE_KEY = 'filmOrderSyncState';
const ORDER_SYNC_PULL_PATH = '/api/v1/store/internal/orders';
const ORDER_SYNC_PUSH_PATH = '/api/v1/store/internal/orders/sync';
let orderSyncPromise = null;
let lastSyncToastAt = 0;

const ORDER_SYNC_STATUS = {
  IDLE: 'IDLE',
  BLOCKED: 'BLOCKED',
  SYNCING: 'SYNCING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  CONFLICT: 'CONFLICT'
};

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
  const normalizedOrder = normalizeOrderRecord(order);
  orders.unshift(normalizedOrder);
  saveOrders(orders);
  if (normalizedOrder && normalizedOrder.id) {
    markOrdersDirty([normalizedOrder.id]);
  }
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
      updatedAt: formatDateTime(new Date()),
      version: normalizeVersion(item.version) + 1
    };
    return normalizeOrderRecord(matchedOrder);
  });

  saveOrders(updated);
  if (matchedOrder && matchedOrder.id) {
    markOrdersDirty([matchedOrder.id]);
  }
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

  const createdAt = normalizeDateTimeText(order.createdAt) || formatDateTime(new Date());
  const updatedAt = normalizeDateTimeText(order.updatedAt) || createdAt;
  return {
    ...order,
    status: normalizeStatusValue(order.status),
    createdAt,
    updatedAt,
    version: normalizeVersion(order.version)
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
    if (config.blockedReason) {
      setOrderSyncState({
        status: ORDER_SYNC_STATUS.BLOCKED,
        lastError: config.blockedReason,
        lastAttemptAt: Date.now()
      });
    }
    return Promise.resolve(source);
  }

  setOrderSyncState({
    status: ORDER_SYNC_STATUS.SYNCING,
    lastError: '',
    lastAttemptAt: Date.now()
  });

  const cursor = getSyncCursor();
  return requestRemoteOrders(config, cursor)
    .then((result) => {
      const remoteOrders = normalizeOrderList(result.items);
      const mergedOrders = mergeOrders(source, remoteOrders);
      saveOrders(mergedOrders);
      const latestUpdatedAt = findLatestUpdatedAt(mergedOrders, normalizeDateTimeText(result.updatedAt));
      if (latestUpdatedAt) {
        setSyncCursor(latestUpdatedAt);
      }

      const dirtyOrders = pickDirtyOrders(mergedOrders);
      if (dirtyOrders.length === 0) {
        setOrderSyncState({
          status: ORDER_SYNC_STATUS.SUCCESS,
          lastError: '',
          lastSuccessAt: Date.now()
        });
        return mergedOrders;
      }

      return pushOrdersToRemote(config, dirtyOrders)
        .then((pushResult) => {
          const payload = pushResult && pushResult.data && typeof pushResult.data === 'object' ? pushResult.data : {};
          const acceptedIds = Array.isArray(payload.acceptedIds) ? payload.acceptedIds : [];
          if (acceptedIds.length > 0) {
            clearDirtyOrders(acceptedIds);
          }
          const conflicts = Array.isArray(payload.conflicts) ? payload.conflicts : [];
          if (conflicts.length === 0) {
            clearSyncConflictCache();
            setOrderSyncState({
              status: ORDER_SYNC_STATUS.SUCCESS,
              lastError: '',
              lastSuccessAt: Date.now()
            });
            return mergedOrders;
          }
          return resolveSyncConflicts(mergedOrders, conflicts);
        })
        .catch((error) => {
          handleSyncError(error, '订单推送失败');
          return mergedOrders;
        });
    })
    .catch((error) => {
      handleSyncError(error, '订单拉取失败');
      return source;
    });
}

function getOrderSyncConfig() {
  const financeConfig = getFinanceConfig();
  const baseUrl = normalizeBaseUrl(financeConfig && financeConfig.baseUrl);
  const session = getMiniAuthSession();
  const sessionToken = String(session && session.token ? session.token : '').trim();
  const apiToken = String(financeConfig && financeConfig.apiToken ? financeConfig.apiToken : sessionToken).trim();
  const syncEnabled = Boolean(financeConfig && financeConfig.enabled);
  const timeoutValue = Number(financeConfig && financeConfig.timeout);
  const envVersion = String(financeConfig && financeConfig.envVersion ? financeConfig.envVersion : '').trim() || 'develop';
  const hasBaseUrl = Boolean(baseUrl);
  const hasApiToken = Boolean(apiToken);
  const blockedReason = resolveSyncBlockedReason(syncEnabled, hasBaseUrl, hasApiToken);
  if (syncEnabled && !baseUrl && financeConfig && financeConfig.envVersion && financeConfig.envVersion !== 'develop') {
    console.warn(`[order-sync] 缺少公网同步地址，当前环境：${financeConfig.envVersion}`);
  }
  return {
    enabled: Boolean(!blockedReason),
    syncEnabled,
    hasBaseUrl,
    hasApiToken,
    blockedReason,
    envVersion,
    baseUrl,
    apiToken,
    timeout: Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 10000,
    extraHeaders: financeConfig && typeof financeConfig.extraHeaders === 'object'
      ? financeConfig.extraHeaders
      : {}
  };
}

function requestRemoteOrders(config, updatedAfter) {
  const path = buildOrderPullPath(updatedAfter);
  return requestWithConfig({
    config,
    path,
    method: 'GET'
  }).then((result) => {
    const payload = result && result.data && typeof result.data === 'object' ? result.data : {};
    const items = Array.isArray(payload.items)
      ? payload.items
      : (Array.isArray(payload.orders) ? payload.orders : []);
    return {
      items,
      updatedAt: normalizeDateTimeText(payload.updatedAt)
    };
  });
}

function pushOrdersToRemote(config, orders) {
  const source = normalizeOrderList(orders);
  if (source.length === 0) {
    return Promise.resolve({ data: { acceptedIds: [], conflicts: [] } });
  }
  return requestWithConfig({
    config,
    path: ORDER_SYNC_PUSH_PATH,
    method: 'POST',
    headers: {
      'Idempotency-Key': buildOrderSyncIdempotencyKey(source)
    },
    data: {
      orders: source
    }
  });
}

function requestWithConfig(options) {
  const requestOptions = options && typeof options === 'object' ? options : {};
  const config = requestOptions.config || {};
  const url = `${String(config.baseUrl || '').replace(/\/+$/, '')}${String(requestOptions.path || '')}`;
  const headers = buildSyncHeaders(config, requestOptions.headers);
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
          const payload = res && res.data && typeof res.data === 'object' ? res.data : {};
          const message = resolveRemoteErrorMessage(payload) || `请求失败：${statusCode}`;
          const error = new Error(message);
          error.statusCode = statusCode;
          error.code = String(payload.code || '').trim();
          error.responsePayload = payload;
          reject(error);
          return;
        }
        resolve(res);
      },
      fail: (error) => {
        const message = normalizeSyncMessage(error && error.errMsg ? error.errMsg : '') || '网络请求失败';
        const requestError = new Error(message);
        requestError.code = 'NETWORK_ERROR';
        reject(requestError);
      }
    });
  });
}

function buildSyncHeaders(config, requestHeaders) {
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
    ...extraHeaders,
    ...(requestHeaders && typeof requestHeaders === 'object' ? requestHeaders : {})
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

    orderMap[item.id] = compareOrderPriority(item, remote) >= 0 ? item : remote;
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
  const version = normalizeVersion(order.version);
  if (version > 0) {
    return version;
  }
  const updated = parseDateText(order.updatedAt);
  if (updated > 0) {
    return updated;
  }
  return parseDateText(order.createdAt);
}

function compareOrderPriority(left, right) {
  const leftVersion = normalizeVersion(left && left.version);
  const rightVersion = normalizeVersion(right && right.version);
  if (leftVersion !== rightVersion) {
    return leftVersion - rightVersion;
  }
  return parseDateText(left && left.updatedAt) - parseDateText(right && right.updatedAt);
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

function normalizeVersion(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function normalizeDateTimeText(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return parseDateText(text) > 0 ? text : '';
}

function getDirtyOrderIds() {
  const source = wx.getStorageSync(ORDER_DIRTY_IDS_KEY);
  if (!Array.isArray(source)) {
    return [];
  }
  return source.map((item) => String(item || '').trim()).filter((item) => item);
}

function setDirtyOrderIds(ids) {
  const unique = [];
  const idSet = new Set();
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    const text = String(id || '').trim();
    if (!text || idSet.has(text)) {
      return;
    }
    idSet.add(text);
    unique.push(text);
  });
  wx.setStorageSync(ORDER_DIRTY_IDS_KEY, unique);
  return unique;
}

function markOrdersDirty(ids) {
  const current = getDirtyOrderIds();
  setDirtyOrderIds([...current, ...(Array.isArray(ids) ? ids : [])]);
}

function clearDirtyOrders(ids) {
  const removeSet = new Set((Array.isArray(ids) ? ids : []).map((item) => String(item || '').trim()).filter((item) => item));
  if (removeSet.size === 0) {
    return;
  }
  const current = getDirtyOrderIds();
  const next = current.filter((id) => !removeSet.has(id));
  setDirtyOrderIds(next);
}

function getSyncCursor() {
  return normalizeDateTimeText(wx.getStorageSync(ORDER_SYNC_CURSOR_KEY));
}

function setSyncCursor(value) {
  const normalized = normalizeDateTimeText(value);
  if (!normalized) {
    return '';
  }
  wx.setStorageSync(ORDER_SYNC_CURSOR_KEY, normalized);
  return normalized;
}

function buildOrderPullPath(updatedAfter) {
  const cursor = normalizeDateTimeText(updatedAfter);
  if (!cursor) {
    return ORDER_SYNC_PULL_PATH;
  }
  return `${ORDER_SYNC_PULL_PATH}?updatedAfter=${encodeURIComponent(cursor)}`;
}

function findLatestUpdatedAt(orders, fallback) {
  const list = Array.isArray(orders) ? orders : [];
  let best = parseDateText(fallback);
  let bestText = normalizeDateTimeText(fallback);
  list.forEach((item) => {
    const currentText = normalizeDateTimeText(item && item.updatedAt);
    const score = parseDateText(currentText);
    if (score > best) {
      best = score;
      bestText = currentText;
    }
  });
  return bestText;
}

function pickDirtyOrders(orders) {
  const list = normalizeOrderList(orders);
  const dirtyIds = getDirtyOrderIds();
  if (dirtyIds.length === 0) {
    return [];
  }
  const orderMap = {};
  list.forEach((item) => {
    if (item && item.id) {
      orderMap[item.id] = item;
    }
  });
  return dirtyIds.map((id) => orderMap[id]).filter((item) => Boolean(item));
}

function applyConflictServerItems(orders, conflicts) {
  const source = normalizeOrderList(orders);
  const conflictList = Array.isArray(conflicts) ? conflicts : [];
  if (conflictList.length === 0) {
    return source;
  }
  const conflictMap = {};
  conflictList.forEach((item) => {
    const id = String(item && item.id ? item.id : '').trim();
    const currentItem = item && item.currentItem && typeof item.currentItem === 'object' ? normalizeOrderRecord(item.currentItem) : null;
    if (!id || !currentItem) {
      return;
    }
    conflictMap[id] = currentItem;
  });
  if (Object.keys(conflictMap).length === 0) {
    return source;
  }
  const next = source.map((item) => {
    if (!item || !item.id) {
      return item;
    }
    return conflictMap[item.id] || item;
  });
  next.sort((a, b) => getOrderSortScore(b) - getOrderSortScore(a));
  return next;
}

function resolveSyncConflicts(orders, conflicts) {
  const source = normalizeOrderList(orders);
  const conflictList = Array.isArray(conflicts) ? conflicts : [];
  if (conflictList.length === 0) {
    return Promise.resolve(source);
  }
  cacheSyncConflicts(conflictList);
  const conflictIds = Array.from(new Set(conflictList
    .map((item) => String(item && item.id ? item.id : '').trim())
    .filter((item) => item)));
  if (conflictIds.length === 0) {
    return Promise.resolve(source);
  }
  return showSyncConflictDialog(conflictIds.length).then((strategy) => {
    if (strategy === 'server') {
      const nextOrders = applyConflictServerItems(source, conflictList);
      saveOrders(nextOrders);
      clearDirtyOrders(conflictIds);
      clearSyncConflictCache();
      setOrderSyncState({
        status: ORDER_SYNC_STATUS.SUCCESS,
        lastError: '',
        lastSuccessAt: Date.now()
      });
      showSyncToast('已采用服务器最新数据');
      return nextOrders;
    }
    setOrderSyncState({
      status: ORDER_SYNC_STATUS.CONFLICT,
      lastError: `有 ${conflictIds.length} 条订单冲突，请手动重试`,
      lastAttemptAt: Date.now()
    });
    showSyncToast('已保留本地修改，请手动重试');
    return source;
  });
}

function showSyncConflictDialog(conflictCount) {
  const count = Number.isFinite(Number(conflictCount)) ? Number(conflictCount) : 0;
  if (typeof wx === 'undefined' || !wx || typeof wx.showModal !== 'function') {
    return Promise.resolve('server');
  }
  return new Promise((resolve) => {
    wx.showModal({
      title: '订单同步冲突',
      content: `有 ${count} 条订单已被其他端更新。确定“以服务器为准”？点击“取消”可手动重试。`,
      confirmText: '服务器为准',
      cancelText: '手动重试',
      success: (res) => {
        resolve(res && res.confirm ? 'server' : 'retry');
      },
      fail: () => {
        resolve('retry');
      }
    });
  });
}

function showSyncToast(title) {
  const now = Date.now();
  if (now - lastSyncToastAt < 5000) {
    return;
  }
  lastSyncToastAt = now;
  if (typeof wx === 'undefined' || !wx || typeof wx.showToast !== 'function') {
    return;
  }
  wx.showToast({
    title: String(title || '').slice(0, 20),
    icon: 'none'
  });
}

function resolveSyncBlockedReason(syncEnabled, hasBaseUrl, hasApiToken) {
  if (!syncEnabled) {
    return '订单同步未启用';
  }
  if (!hasBaseUrl) {
    return '缺少同步地址，请先配置 Base URL';
  }
  if (!hasApiToken) {
    return '缺少同步令牌，请先配置 API Token';
  }
  return '';
}

function resolveRemoteErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const fields = ['message', 'error', 'msg'];
  for (let i = 0; i < fields.length; i += 1) {
    const value = normalizeSyncMessage(payload[fields[i]]);
    if (value) {
      return value;
    }
  }
  return '';
}

function normalizeSyncMessage(value) {
  return String(value || '').trim();
}

function handleSyncError(error, fallbackMessage) {
  const message = normalizeSyncMessage(error && error.message)
    || normalizeSyncMessage(fallbackMessage)
    || '订单同步失败';
  setOrderSyncState({
    status: ORDER_SYNC_STATUS.ERROR,
    lastError: message,
    lastAttemptAt: Date.now()
  });
  showSyncToast(message);
}

function getDefaultOrderSyncState() {
  return {
    status: ORDER_SYNC_STATUS.IDLE,
    lastAttemptAt: 0,
    lastSuccessAt: 0,
    lastError: ''
  };
}

function readOrderSyncState() {
  if (typeof wx === 'undefined' || !wx || typeof wx.getStorageSync !== 'function') {
    return getDefaultOrderSyncState();
  }
  const source = wx.getStorageSync(ORDER_SYNC_STATE_KEY);
  if (!source || typeof source !== 'object') {
    return getDefaultOrderSyncState();
  }
  return {
    status: String(source.status || ORDER_SYNC_STATUS.IDLE).trim() || ORDER_SYNC_STATUS.IDLE,
    lastAttemptAt: Number.isFinite(Number(source.lastAttemptAt)) ? Number(source.lastAttemptAt) : 0,
    lastSuccessAt: Number.isFinite(Number(source.lastSuccessAt)) ? Number(source.lastSuccessAt) : 0,
    lastError: normalizeSyncMessage(source.lastError)
  };
}

function setOrderSyncState(patch) {
  const current = readOrderSyncState();
  const next = {
    ...current,
    ...(patch && typeof patch === 'object' ? patch : {})
  };
  if (!next.status) {
    next.status = ORDER_SYNC_STATUS.IDLE;
  }
  if (typeof wx !== 'undefined' && wx && typeof wx.setStorageSync === 'function') {
    wx.setStorageSync(ORDER_SYNC_STATE_KEY, next);
  }
  return next;
}

function getOrderSyncStatus() {
  const config = getOrderSyncConfig();
  const state = readOrderSyncState();
  return {
    ...state,
    enabled: config.enabled,
    syncEnabled: config.syncEnabled,
    hasBaseUrl: config.hasBaseUrl,
    hasApiToken: config.hasApiToken,
    blockedReason: config.blockedReason,
    baseUrl: config.baseUrl,
    envVersion: config.envVersion
  };
}

function cacheSyncConflicts(conflicts) {
  const source = Array.isArray(conflicts) ? conflicts : [];
  const payload = source
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const id = String(item.id || '').trim();
      if (!id) {
        return null;
      }
      return {
        id,
        reason: String(item.reason || '').trim(),
        currentVersion: Number.isFinite(Number(item.currentVersion)) ? Number(item.currentVersion) : 0,
        incomingVersion: Number.isFinite(Number(item.incomingVersion)) ? Number(item.incomingVersion) : 0,
        conflictAt: Date.now()
      };
    })
    .filter((item) => Boolean(item));
  if (payload.length === 0 || typeof wx === 'undefined' || !wx || typeof wx.setStorageSync !== 'function') {
    return;
  }
  wx.setStorageSync(ORDER_SYNC_CONFLICTS_KEY, payload);
}

function clearSyncConflictCache() {
  if (typeof wx === 'undefined' || !wx || typeof wx.removeStorageSync !== 'function') {
    return;
  }
  wx.removeStorageSync(ORDER_SYNC_CONFLICTS_KEY);
}

function buildOrderSyncIdempotencyKey(orders) {
  const list = normalizeOrderList(orders);
  const fingerprint = list
    .map((item) => `${item.id}:${normalizeVersion(item.version)}`)
    .sort()
    .join('|');
  const checksum = buildStableChecksum(fingerprint);
  return `order-sync:${checksum}:${fingerprint.slice(0, 400)}`;
}

function buildStableChecksum(text) {
  const source = String(text || '');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

module.exports = {
  ORDER_STORAGE_KEY,
  addOrder,
  calculatePrice,
  createOrderId,
  formatDateTime,
  getOrderById,
  getOrderSyncStatus,
  getOrders,
  syncOrdersNow,
  updateOrder,
  updateOrderStatus
};
