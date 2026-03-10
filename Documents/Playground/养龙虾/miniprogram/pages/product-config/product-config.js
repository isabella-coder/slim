const { getProductCatalog, saveProductCatalog } = require('../../utils/product-catalog');
const { hasMiniAuthSession, navigateToStoreLogin } = require('../../utils/page-access');
const { getCurrentUserContext, isManagerContext } = require('../../utils/user-context');

Page({
  data: {
    needLogin: false,
    noPermission: false,
    products: [],
    newLabel: '',
    newDesc: '',
    newPrice: '',
    dirty: false
  },

  onLoad() {
    if (!this.ensurePageAccess()) {
      return;
    }
    this.loadProducts();
  },

  onShow() {
    this.ensurePageAccess();
  },

  ensurePageAccess() {
    if (!hasMiniAuthSession()) {
      this.setData({
        needLogin: true,
        noPermission: false,
        products: [],
        dirty: false
      });
      return false;
    }

    const user = getCurrentUserContext();
    if (!isManagerContext(user)) {
      this.setData({
        needLogin: false,
        noPermission: true,
        products: [],
        dirty: false
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

  loadProducts() {
    const products = getProductCatalog();
    this.setData({
      products,
      dirty: false
    });
  },

  onItemInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    let value = event.detail.value;

    if (field === 'basePrice') {
      value = value.replace(/[^\d]/g, '');
    }

    this.setData({
      [`products[${index}].${field}`]: value,
      dirty: true
    });
  },

  onNewInput(event) {
    const field = event.currentTarget.dataset.field;
    let value = event.detail.value;

    if (field === 'newPrice') {
      value = value.replace(/[^\d]/g, '');
    }

    this.setData({
      [field]: value
    });
  },

  addProduct() {
    if (!this.ensurePageAccess()) {
      return;
    }

    const label = this.data.newLabel.trim();
    const desc = this.data.newDesc.trim();
    const basePrice = Number(this.data.newPrice);

    if (!label) {
      wx.showToast({ title: '请输入品牌型号', icon: 'none' });
      return;
    }

    if (!desc) {
      wx.showToast({ title: '请输入施工部位', icon: 'none' });
      return;
    }

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      wx.showToast({ title: '请输入正确价格', icon: 'none' });
      return;
    }

    const product = {
      label,
      desc,
      basePrice: Math.round(basePrice),
      value: `CUSTOM_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    };

    this.setData({
      products: this.data.products.concat(product),
      newLabel: '',
      newDesc: '',
      newPrice: '',
      dirty: true
    });
  },

  removeProduct(event) {
    if (!this.ensurePageAccess()) {
      return;
    }

    if (this.data.products.length <= 1) {
      wx.showToast({ title: '至少保留一个产品', icon: 'none' });
      return;
    }

    const index = Number(event.currentTarget.dataset.index);
    const products = this.data.products.slice();
    products.splice(index, 1);

    this.setData({
      products,
      dirty: true
    });
  },

  saveProducts() {
    if (!this.ensurePageAccess()) {
      return false;
    }

    const normalized = [];

    for (let i = 0; i < this.data.products.length; i += 1) {
      const item = this.data.products[i];
      const label = String(item.label || '').trim();
      const desc = String(item.desc || '').trim();
      const basePrice = Number(item.basePrice);
      const value = String(item.value || '').trim();

      if (!label) {
        wx.showToast({ title: `第${i + 1}项品牌型号为空`, icon: 'none' });
        return false;
      }

      if (!desc) {
        wx.showToast({ title: `第${i + 1}项施工部位为空`, icon: 'none' });
        return false;
      }

      if (!value) {
        wx.showToast({ title: `第${i + 1}项标识异常`, icon: 'none' });
        return false;
      }

      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        wx.showToast({ title: `第${i + 1}项价格无效`, icon: 'none' });
        return false;
      }

      normalized.push({
        label,
        desc,
        value,
        basePrice: Math.round(basePrice)
      });
    }

    saveProductCatalog(normalized);
    this.setData({
      products: normalized,
      dirty: false
    });

    wx.showToast({ title: '已保存', icon: 'success' });
    return true;
  },

  saveAndBack() {
    if (!this.ensurePageAccess()) {
      return;
    }

    const saved = this.saveProducts();
    if (saved) {
      setTimeout(() => {
        wx.navigateBack();
      }, 120);
    }
  }
});
