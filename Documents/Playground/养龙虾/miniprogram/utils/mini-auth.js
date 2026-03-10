const { getFinanceConfig, setFinanceBaseUrl } = require('../config/finance.config');
const { getAvailableAccounts, setCurrentUserContextById } = require('./user-context');

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
    path: '/api/login',
    method: 'POST',
    body: {
      username,
      password
    }
  }).then((payload) => {
    const token = normalizeText(payload && payload.token);
    const user = payload && typeof payload.user === 'object' ? payload.user : null;
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

  const baseUrl = normalizeBaseUrl(getFinanceConfig().baseUrl);
  if (!baseUrl) {
    return Promise.resolve(session);
  }

  return requestAuthJson({
    baseUrl,
    path: '/api/me',
    method: 'GET',
    token: session.token
  })
    .then((payload) => {
      const user = payload && typeof payload.user === 'object' ? payload.user : session.user;
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
    path: '/api/logout',
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
    return { token: '', user: null };
  }
  const token = normalizeText(wx.getStorageSync(MINI_AUTH_TOKEN_KEY));
  const rawUser = wx.getStorageSync(MINI_AUTH_USER_KEY);
  const user = rawUser && typeof rawUser === 'object' ? rawUser : null;
  return { token, user };
}

function saveMiniAuthSession(token, user) {
  if (!canUseWxStorage()) {
    return;
  }
  wx.setStorageSync(MINI_AUTH_TOKEN_KEY, normalizeText(token));
  wx.setStorageSync(MINI_AUTH_USER_KEY, user && typeof user === 'object' ? user : {});
}

function clearMiniAuthSession() {
  if (!canUseWxStorage()) {
    return;
  }
  wx.removeStorageSync(MINI_AUTH_TOKEN_KEY);
  wx.removeStorageSync(MINI_AUTH_USER_KEY);
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
