const { getFinanceConfig, setFinanceApiToken, setFinanceBaseUrl } = require('../config/finance.config');
const { getAvailableAccounts, getCurrentUserContext, setCurrentUserContextById } = require('./user-context');

const MINI_AUTH_TOKEN_KEY = 'miniAuthSessionToken';
const MINI_AUTH_USER_KEY = 'miniAuthUser';

const ROLE_TO_CONTEXT_ROLE = {
  manager: 'MANAGER',
  sales: 'SALES',
  technician: 'TECHNICIAN',
  finance: 'FINANCE'
};

function loginMiniProgram(options) {
  const source = options && typeof options === 'object' ? options : {};
  const username = normalizeText(source.username);
  const password = normalizeText(source.password);
  const baseUrl = normalizeBaseUrl(source.baseUrl || getFinanceConfig().baseUrl);

  if (!baseUrl) {
    return Promise.reject(new Error('请先填写后端地址（Base URL）'));
  }
  if (!username || !password) {
    return Promise.reject(new Error('请输入账号和密码'));
  }

  setFinanceBaseUrl(baseUrl);

  return requestAuthJson({
    baseUrl,
    path: '/api/v1/store/login',
    method: 'POST',
    body: {
      username,
      password
    }
  }).then((payload) => {
    const token = normalizeText(
      (payload && payload.token)
      || (payload && payload.data && payload.data.token)
    );
    const user = (payload && typeof payload.user === 'object'
      ? payload.user
      : (payload && payload.data && typeof payload.data.user === 'object' ? payload.data.user : null));
    if (!token || !user) {
      throw new Error('登录响应缺少会话信息');
    }
    saveMiniAuthSession(token, user);
    bindUserContextFromSessionUser(user);
    return {
      token,
      user
    };
  });
}

function ensureMiniAuthSession() {
  const session = getMiniAuthSession();
  if (!session.token || !session.user) {
    return Promise.resolve(null);
  }

  // Bridge sessions come from merged global storage, skip /api/me probing.
  if (session.isBridgeSession) {
    return Promise.resolve(session);
  }

  const baseUrl = normalizeBaseUrl(getFinanceConfig().baseUrl);
  if (!baseUrl) {
    return Promise.resolve(session);
  }

  return requestAuthJson({
    baseUrl,
    path: '/api/v1/store/me',
    method: 'GET',
    token: session.token
  })
    .then((payload) => {
      const user = (payload && typeof payload.user === 'object'
        ? payload.user
        : (payload && payload.data && typeof payload.data.user === 'object' ? payload.data.user : session.user));
      saveMiniAuthSession(session.token, user);
      bindUserContextFromSessionUser(user);
      return {
        token: session.token,
        user
      };
    })
    .catch((error) => {
      if (Number(error && error.statusCode) === 401) {
        clearMiniAuthSession();
        return null;
      }
      return session;
    });
}

function logoutMiniProgram() {
  const session = getMiniAuthSession();
  const baseUrl = normalizeBaseUrl(getFinanceConfig().baseUrl);
  if (!session.token || !baseUrl) {
    clearMiniAuthSession();
    return Promise.resolve();
  }

  return requestAuthJson({
    baseUrl,
    path: '/api/v1/store/logout',
    method: 'POST',
    token: session.token
  })
    .catch(() => null)
    .then(() => {
      clearMiniAuthSession();
    });
}

function getMiniAuthSession() {
  if (!canUseWxStorage()) {
    return { token: '', user: null, isBridgeSession: false };
  }
  const token = normalizeText(wx.getStorageSync(MINI_AUTH_TOKEN_KEY));
  const rawUser = wx.getStorageSync(MINI_AUTH_USER_KEY);
  const user = rawUser && typeof rawUser === 'object' ? rawUser : null;
  if (token && user) {
    return { token, user, isBridgeSession: false };
  }

  const bridgeSession = getBridgeSession();
  if (bridgeSession.token && bridgeSession.user) {
    return bridgeSession;
  }

  return { token: '', user: null, isBridgeSession: false };
}

function saveMiniAuthSession(token, user) {
  if (!canUseWxStorage()) {
    return;
  }
  const normalizedToken = normalizeText(token);
  const normalizedUser = user && typeof user === 'object' ? user : {};

  wx.setStorageSync(MINI_AUTH_TOKEN_KEY, normalizedToken);
  wx.setStorageSync(MINI_AUTH_USER_KEY, normalizedUser);

  const role = normalizeRole(normalizedUser.role || wx.getStorageSync('mini_role') || 'sales');
  const username = normalizeText(normalizedUser.username || normalizedUser.sales_id || wx.getStorageSync('sales_id'));
  const name = normalizeText(normalizedUser.name || normalizedUser.sales_name || wx.getStorageSync('sales_name'));
  const storeCode = normalizeText(normalizedUser.store || normalizedUser.store_code || wx.getStorageSync('store_code'));

  wx.setStorageSync('mini_role', role);
  if (username) {
    wx.setStorageSync('sales_id', username);
  }
  if (name) {
    wx.setStorageSync('sales_name', name);
  }
  if (storeCode) {
    wx.setStorageSync('store_code', storeCode);
  }

  setFinanceApiToken(normalizedToken);
}

function clearMiniAuthSession() {
  if (!canUseWxStorage()) {
    return;
  }
  wx.removeStorageSync(MINI_AUTH_TOKEN_KEY);
  wx.removeStorageSync(MINI_AUTH_USER_KEY);
  wx.removeStorageSync('mini_role');
  setFinanceApiToken('');
}

function bindUserContextFromSessionUser(user) {
  const source = user && typeof user === 'object' ? user : {};
  const username = normalizeText(source.username);
  const name = normalizeText(source.name);
  const role = normalizeRole(source.role);
  const roleKey = normalizeText(ROLE_TO_CONTEXT_ROLE[role]);
  const accounts = getAvailableAccounts();

  let matched = null;
  if (username) {
    matched = accounts.find((item) => normalizeText(item.accountId) === username) || null;
  }
  if (!matched && name) {
    matched = accounts.find((item) => normalizeText(item.accountName) === name) || null;
  }
  if (!matched && roleKey) {
    matched = accounts.find((item) => normalizeText(item.role) === roleKey) || null;
  }
  if (!matched) {
    matched = accounts[0] || null;
  }

  if (matched && matched.accountId) {
    setCurrentUserContextById(matched.accountId);
  }
  return matched;
}

function getBridgeSession() {
  if (!canUseWxStorage()) {
    return { token: '', user: null, isBridgeSession: false };
  }

  const financeConfig = getFinanceConfig();
  const token = normalizeText((financeConfig && financeConfig.apiToken) || wx.getStorageSync('token'));
  if (!token) {
    return { token: '', user: null, isBridgeSession: false };
  }

  const context = getCurrentUserContext() || {};
  const role = normalizeRole(wx.getStorageSync('user_role') || context.role || 'manager');
  const username = normalizeText(wx.getStorageSync('sales_id') || context.accountId || 'bridge_user');
  const name = normalizeText(wx.getStorageSync('sales_name') || context.accountName || '兼容账号');

  return {
    token,
    user: {
      username,
      name,
      role: role || 'manager'
    },
    isBridgeSession: true
  };
}

function getMiniRoleLabel(role) {
  const key = normalizeRole(role);
  if (key === 'manager') {
    return '店长';
  }
  if (key === 'sales') {
    return '销售';
  }
  if (key === 'technician') {
    return '施工';
  }
  if (key === 'finance') {
    return '财务';
  }
  return key || '未知角色';
}

function requestAuthJson(options) {
  const source = options && typeof options === 'object' ? options : {};
  const baseUrl = normalizeBaseUrl(source.baseUrl);
  const path = String(source.path || '');
  const url = `${baseUrl}${path}`;
  const headers = {
    'content-type': 'application/json'
  };
  const token = normalizeText(source.token);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: source.method || 'GET',
      header: headers,
      data: source.body,
      timeout: 10000,
      success: (res) => {
        const statusCode = Number(res && res.statusCode);
        const payload = res && res.data && typeof res.data === 'object' ? res.data : {};
        if (!(statusCode >= 200 && statusCode < 300)) {
          const error = new Error(normalizeText(payload.message) || `请求失败：${statusCode}`);
          error.statusCode = statusCode;
          error.code = normalizeText(payload.code);
          reject(error);
          return;
        }

        if (payload && typeof payload === 'object') {
          if (payload.ok === false || payload.success === false) {
            const error = new Error(normalizeText(payload.message) || '请求失败');
            error.statusCode = statusCode;
            error.code = normalizeText(payload.code);
            reject(error);
            return;
          }

          if (Object.prototype.hasOwnProperty.call(payload, 'code')) {
            const codeText = normalizeText(payload.code);
            if (codeText && !['0', '200', 'OK', 'SUCCESS'].includes(codeText.toUpperCase())) {
              const error = new Error(normalizeText(payload.message) || '请求失败');
              error.statusCode = statusCode;
              error.code = codeText;
              reject(error);
              return;
            }
          }
        }

        resolve(payload);
      },
      fail: (error) => {
        const requestError = new Error(normalizeText(error && error.errMsg) || '网络请求失败');
        requestError.code = 'NETWORK_ERROR';
        reject(requestError);
      }
    });
  });
}

function canUseWxStorage() {
  return typeof wx !== 'undefined'
    && wx
    && typeof wx.getStorageSync === 'function'
    && typeof wx.setStorageSync === 'function';
}

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeRole(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

module.exports = {
  MINI_AUTH_TOKEN_KEY,
  MINI_AUTH_USER_KEY,
  bindUserContextFromSessionUser,
  clearMiniAuthSession,
  ensureMiniAuthSession,
  getMiniAuthSession,
  getMiniRoleLabel,
  loginMiniProgram,
  logoutMiniProgram
};
