const FINANCE_BASE_URL_STORAGE_KEY = 'financeBaseUrl';
const FINANCE_API_TOKEN_STORAGE_KEY = 'financeApiToken';
const STORE_BASE_URL_STORAGE_KEY = 'store_api_base_url';
const STORE_API_TOKEN_STORAGE_KEY = 'store_internal_api_token';

const ENV_BASE_URL = {
  // 微信开发者工具本机联调。
  develop: 'http://127.0.0.1:8000',
  // 体验版/正式版请写入公网 HTTPS 域名（可通过 setFinanceBaseUrl 设置）。
  trial: 'https://a3f1be6049a27d.lhr.life',
  release: 'https://a3f1be6049a27d.lhr.life'
};

const financeConfig = {
  enabled: true,
  mockMode: false,
  // 全局兜底地址（优先级低于 runtime storage 和 ENV_BASE_URL）。
  baseUrl: '',
  syncPath: '/api/v1/store/internal/work-orders/sync',
  // 不提交固定 token，按环境手动配置。
  apiToken: '',
  extraHeaders: {},
  timeout: 10000
};

function getFinanceConfig() {
  var envVersion = getEnvVersion();
  var baseUrl = resolveBaseUrl(envVersion);
  var apiToken = resolveApiToken();
  return Object.assign({}, financeConfig, {
    baseUrl: baseUrl,
    apiToken: apiToken,
    envVersion: envVersion
  });
}

function setFinanceBaseUrl(url) {
  const normalized = normalizeUrl(url);
  if (!canUseWxStorage()) {
    return normalized;
  }
  wx.setStorageSync(FINANCE_BASE_URL_STORAGE_KEY, normalized);
  // Keep one source of truth across merged modules.
  wx.setStorageSync(STORE_BASE_URL_STORAGE_KEY, normalized);
  return normalized;
}

function setFinanceApiToken(token) {
  const normalized = normalizeToken(token);
  if (!canUseWxStorage()) {
    return normalized;
  }
  wx.setStorageSync(FINANCE_API_TOKEN_STORAGE_KEY, normalized);
  // Keep one source of truth across merged modules.
  wx.setStorageSync(STORE_API_TOKEN_STORAGE_KEY, normalized);
  return normalized;
}

function resolveBaseUrl(envVersion) {
  const runtimeUrl = readRuntimeBaseUrl();
  if (runtimeUrl) {
    return runtimeUrl;
  }

  const storeUrl = readStoreBaseUrl();
  if (storeUrl) {
    return storeUrl;
  }

  const envUrl = normalizeUrl(ENV_BASE_URL[envVersion]);
  if (envUrl) {
    return envUrl;
  }

  return normalizeUrl(financeConfig.baseUrl);
}

function resolveApiToken() {
  const runtimeToken = readRuntimeApiToken();
  if (runtimeToken) {
    return runtimeToken;
  }

  const storeToken = readStoreApiToken();
  if (storeToken) {
    return storeToken;
  }

  return normalizeToken(financeConfig.apiToken);
}

function readRuntimeBaseUrl() {
  if (!canUseWxStorage()) {
    return '';
  }
  return normalizeUrl(wx.getStorageSync(FINANCE_BASE_URL_STORAGE_KEY));
}

function readRuntimeApiToken() {
  if (!canUseWxStorage()) {
    return '';
  }
  return normalizeToken(wx.getStorageSync(FINANCE_API_TOKEN_STORAGE_KEY));
}

function readStoreBaseUrl() {
  if (!canUseWxStorage()) {
    return '';
  }
  return normalizeUrl(wx.getStorageSync(STORE_BASE_URL_STORAGE_KEY));
}

function readStoreApiToken() {
  if (!canUseWxStorage()) {
    return '';
  }
  return normalizeToken(wx.getStorageSync(STORE_API_TOKEN_STORAGE_KEY));
}

function getEnvVersion() {
  if (typeof wx === 'undefined' || !wx || typeof wx.getAccountInfoSync !== 'function') {
    return 'develop';
  }

  try {
    const info = wx.getAccountInfoSync();
    const value = info && info.miniProgram ? info.miniProgram.envVersion : '';
    const text = String(value || '').trim().toLowerCase();
    if (text) {
      return text;
    }
  } catch (error) {
    // Ignore and fallback.
  }
  return 'develop';
}

function canUseWxStorage() {
  return typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function' && typeof wx.setStorageSync === 'function';
}

function normalizeUrl(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text.replace(/\/+$/, '');
}

function normalizeToken(value) {
  return String(value || '').trim();
}

module.exports = {
  FINANCE_BASE_URL_STORAGE_KEY,
  FINANCE_API_TOKEN_STORAGE_KEY,
  STORE_BASE_URL_STORAGE_KEY,
  STORE_API_TOKEN_STORAGE_KEY,
  getFinanceConfig,
  setFinanceBaseUrl,
  setFinanceApiToken
};
