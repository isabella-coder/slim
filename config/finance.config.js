const FINANCE_BASE_URL_STORAGE_KEY = 'financeBaseUrl';

const ENV_BASE_URL = {
  // 微信开发者工具本机联调。
  develop: 'http://127.0.0.1:8080',
  // 体验版/正式版请写入公网 HTTPS 域名（可通过 setFinanceBaseUrl 设置）。
  trial: 'https://a3f1be6049a27d.lhr.life',
  release: 'https://a3f1be6049a27d.lhr.life'
};

const financeConfig = {
  enabled: true,
  mockMode: false,
  // 全局兜底地址（优先级低于 runtime storage 和 ENV_BASE_URL）。
  baseUrl: '',
  syncPath: '/api/v1/internal/work-orders/sync',
  apiToken: '',
  extraHeaders: {},
  timeout: 10000
};

function getFinanceConfig() {
  const envVersion = getEnvVersion();
  const baseUrl = resolveBaseUrl(envVersion);
  return {
    ...financeConfig,
    baseUrl,
    envVersion
  };
}

function setFinanceBaseUrl(url) {
  const normalized = normalizeUrl(url);
  if (!canUseWxStorage()) {
    return normalized;
  }
  wx.setStorageSync(FINANCE_BASE_URL_STORAGE_KEY, normalized);
  return normalized;
}

function resolveBaseUrl(envVersion) {
  const runtimeUrl = readRuntimeBaseUrl();
  if (runtimeUrl) {
    return runtimeUrl;
  }

  const envUrl = normalizeUrl(ENV_BASE_URL[envVersion]);
  if (envUrl) {
    return envUrl;
  }

  return normalizeUrl(financeConfig.baseUrl);
}

function readRuntimeBaseUrl() {
  if (!canUseWxStorage()) {
    return '';
  }
  return normalizeUrl(wx.getStorageSync(FINANCE_BASE_URL_STORAGE_KEY));
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

module.exports = {
  FINANCE_BASE_URL_STORAGE_KEY,
  getFinanceConfig,
  setFinanceBaseUrl
};
