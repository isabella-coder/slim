const PRODUCT_CATALOG_KEY = 'filmProductCatalog';

const DEFAULT_PRODUCTS = [
  { label: '龙膜 AIR80', value: 'FRONT_AIR80', desc: '前挡', basePrice: 2280 },
  { label: '龙膜 LATI35', value: 'SIDE_REAR_LATI35', desc: '侧后挡', basePrice: 2680 },
  { label: 'BOP G75', value: 'PPF_G75', desc: '全车隐形车衣', basePrice: 12800 },
  { label: 'BOP G85', value: 'PPF_G85', desc: '前机盖 + 前杠', basePrice: 5800 }
];

function getProductCatalog() {
  const stored = wx.getStorageSync(PRODUCT_CATALOG_KEY);
  if (!Array.isArray(stored) || stored.length === 0) {
    const defaults = cloneDefaults();
    saveProductCatalog(defaults);
    return defaults;
  }

  const sanitized = stored
    .map((item) => sanitizeProduct(item))
    .filter((item) => item !== null);

  const hasPositivePrice = sanitized.some((item) => Number(item.basePrice) > 0);
  if (sanitized.length === 0 || !hasPositivePrice) {
    const defaults = cloneDefaults();
    saveProductCatalog(defaults);
    return defaults;
  }

  return sanitized;
}

function saveProductCatalog(products) {
  const normalized = Array.isArray(products)
    ? products.map((item) => sanitizeProduct(item)).filter((item) => item !== null)
    : [];
  wx.setStorageSync(PRODUCT_CATALOG_KEY, normalized);
}

function sanitizeProduct(product) {
  if (!product || typeof product !== 'object') {
    return null;
  }

  const label = typeof product.label === 'string' ? product.label.trim() : '';
  const value = typeof product.value === 'string' ? product.value.trim() : '';
  const desc = typeof product.desc === 'string' ? product.desc.trim() : '';
  const price = Number(product.basePrice);

  if (!label || !value || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    label,
    value,
    desc,
    basePrice: Math.round(price)
  };
}

function cloneDefaults() {
  return DEFAULT_PRODUCTS.map((item) => ({ ...item }));
}

module.exports = {
  getProductCatalog,
  saveProductCatalog
};
