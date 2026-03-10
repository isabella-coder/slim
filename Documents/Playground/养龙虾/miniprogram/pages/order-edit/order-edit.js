const { calculatePrice, getOrderById, getOrders, updateOrder } = require('../../utils/order');
const { getProductCatalog } = require('../../utils/product-catalog');
const { syncOrderToFinance } = require('../../utils/finance-sync');
const { ensureMiniSessionOrNavigate } = require('../../utils/page-access');
const { canEditOrderContext, getCurrentUserContext } = require('../../utils/user-context');
const {
  DAILY_WORK_BAY_LIMIT,
  getDailyCapacityMessage,
  getDailyCapacityStatus,
  isOrderScheduledOn
} = require('../../utils/scheduling');
const { SALES_OPTIONS } = require('../../utils/staff-options');

Page({
  data: {
    orderId: '',
    orderStatus: '',
    hasOrder: true,
    saving: false,
    filmPackages: [],
    selectedPackageCount: 0,
    salesOptions: SALES_OPTIONS,
    storeOptions: ['BOP 保镖上海工厂店', '龙膜精英店'],
    addOnOptions: [
      { label: '车内臭氧杀菌', value: 'STERILIZATION', fee: 0, feeText: '免费', isFree: true, checked: false },
      { label: '前挡袪油膜', value: 'WINDSHIELD_OIL_FILM', fee: 0, feeText: '免费', isFree: true, checked: false },
      { label: '50cm×50cm 免费补膜', value: 'FREE_PATCH_50', fee: 0, feeText: '免费', isFree: true, checked: false }
    ],
    salesIndex: -1,
    storeIndex: 0,
    formData: {
      customerName: '',
      phone: '',
      carModel: '',
      plateNumber: '',
      sourceChannel: '',
      depositAmount: '',
      filmPackages: [],
      salesBrandText: '',
      store: 'BOP 保镖上海工厂店',
      appointmentDate: '',
      appointmentTime: '10:00',
      addOns: [],
      remark: ''
    },
    priceSummary: {
      packagePrice: 0,
      addOnFee: 0,
      totalPrice: 0,
      deposit: 0
    }
  },

  onLoad(options) {
    if (!this.ensureLoggedInSession()) {
      return;
    }

    const orderId = options.id || '';
    const catalog = getProductCatalog();
    this.setData({
      orderId
    });
    this.initCatalog(catalog);

    if (!orderId) {
      this.setData({ hasOrder: false });
      return;
    }

    this.loadOrder(orderId, catalog);
  },

  ensureLoggedInSession() {
    return ensureMiniSessionOrNavigate();
  },

  ensureEditAccess(order) {
    if (!this.ensureLoggedInSession()) {
      return false;
    }
    const user = getCurrentUserContext();
    if (canEditOrderContext(user, order)) {
      return true;
    }
    wx.showToast({
      title: '当前账号无编辑权限',
      icon: 'none'
    });
    return false;
  },

  initCatalog(catalog) {
    const productCatalog = Array.isArray(catalog) ? catalog : [];
    const selectedPackages = normalizeSelectedPackages(this.data.formData.filmPackages, productCatalog);
    const nextPackages = selectedPackages.length > 0
      ? selectedPackages
      : (productCatalog[0] ? [productCatalog[0].value] : []);
    const filmPackages = markPackageChecked(productCatalog, nextPackages);
    const nextFormData = {
      ...this.data.formData,
      filmPackages: nextPackages
    };

    this.setData({
      filmPackages,
      selectedPackageCount: nextPackages.length,
      'formData.filmPackages': nextPackages
    });
    this.recalculatePrice(nextFormData, filmPackages);
  },

  loadOrder(orderId, filmPackages) {
    const order = getOrderById(orderId);
    if (!order) {
      this.setData({ hasOrder: false });
      return;
    }

    if (!this.ensureEditAccess(order)) {
      this.setData({ hasOrder: false });
      return;
    }

    const selectedPackages = normalizeSelectedPackages(getOrderPackageValues(order), filmPackages);
    const normalizedPackages = selectedPackages.length > 0
      ? selectedPackages
      : (filmPackages[0] ? [filmPackages[0].value] : []);
    const storeOptions = mergeStoreOptions(this.data.storeOptions, order.store);
    const storeValue = order.store && storeOptions.indexOf(order.store) >= 0 ? order.store : storeOptions[0];
    const addOns = Array.isArray(order.addOns) ? order.addOns : [];
    const addOnOptions = this.data.addOnOptions.map((item) => ({
      ...item,
      checked: addOns.indexOf(item.value) >= 0
    }));
    const formData = {
      customerName: order.customerName || '',
      phone: order.phone || '',
      carModel: order.carModel || '',
      plateNumber: order.plateNumber || '',
      sourceChannel: order.sourceChannel || '',
      depositAmount: normalizeAmountValue(order.depositAmount, order.priceSummary && order.priceSummary.deposit),
      filmPackages: normalizedPackages,
      salesBrandText: order.salesBrandText || '',
      store: storeValue,
      appointmentDate: normalizeDate(order.appointmentDate),
      appointmentTime: normalizeTime(order.appointmentTime),
      addOns,
      remark: order.remark || ''
    };
    const decoratedPackages = markPackageChecked(filmPackages, normalizedPackages);
    const salesIndex = this.data.salesOptions.indexOf(formData.salesBrandText);

    this.setData({
      hasOrder: true,
      orderStatus: order.status || '未完工',
      filmPackages: decoratedPackages,
      selectedPackageCount: normalizedPackages.length,
      salesIndex: salesIndex >= 0 ? salesIndex : -1,
      storeOptions,
      storeIndex: Math.max(0, storeOptions.indexOf(storeValue)),
      addOnOptions,
      formData
    });
    this.recalculatePrice(formData, filmPackages);
  },

  onInputChange(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  onDepositAmountInput(event) {
    const rawValue = event.detail.value || '';
    const value = normalizeAmountInput(rawValue);
    const nextFormData = {
      ...this.data.formData,
      depositAmount: value
    };

    this.setData({
      'formData.depositAmount': value
    });
    this.recalculatePrice(nextFormData);
  },

  onStoreChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      storeIndex: index,
      'formData.store': this.data.storeOptions[index]
    });
  },

  onSalesChange(event) {
    const index = Number(event.detail.value);
    const salesOptions = this.data.salesOptions;
    const salesName = salesOptions[index] || '';
    this.setData({
      salesIndex: index,
      'formData.salesBrandText': salesName
    });
  },

  onDateChange(event) {
    this.setData({
      'formData.appointmentDate': event.detail.value
    });
  },

  onTimeChange(event) {
    this.setData({
      'formData.appointmentTime': event.detail.value
    });
  },

  onAddOnsChange(event) {
    const selectedValues = event.detail.value;
    const addOnOptions = this.data.addOnOptions.map((item) => ({
      ...item,
      checked: selectedValues.indexOf(item.value) >= 0
    }));
    const nextFormData = {
      ...this.data.formData,
      addOns: selectedValues
    };

    this.setData({
      addOnOptions,
      'formData.addOns': selectedValues
    });
    this.recalculatePrice(nextFormData);
  },

  selectPackage(event) {
    const value = normalizePackageValue(event.currentTarget.dataset.value);
    const current = normalizeSelectedPackages(this.data.formData.filmPackages, this.data.filmPackages);
    const exists = current.indexOf(value) >= 0;
    const nextPackages = exists
      ? current.filter((item) => item !== value)
      : current.concat(value);
    const nextFilmPackages = markPackageChecked(this.data.filmPackages, nextPackages);
    const nextFormData = {
      ...this.data.formData,
      filmPackages: nextPackages
    };

    this.setData({
      filmPackages: nextFilmPackages,
      selectedPackageCount: nextPackages.length,
      'formData.filmPackages': nextPackages
    });
    this.recalculatePrice(nextFormData);
  },

  recalculatePrice(formData, filmPackages) {
    const activeFormData = formData || this.data.formData;
    const activePackages = filmPackages || this.data.filmPackages;
    const summary = calculatePrice(activeFormData, activePackages, this.data.addOnOptions);
    this.setData({
      priceSummary: summary
    });
  },

  validateForm() {
    const { formData } = this.data;

    const phone = String(formData.phone || '').trim();
    if (phone && !isValidContactPhone(phone)) {
      return '联系方式格式不正确';
    }

    if (!formData.carModel.trim()) {
      return '请填写车辆型号';
    }

    if (!Array.isArray(formData.filmPackages) || formData.filmPackages.length === 0) {
      return '请至少选择一个贴膜套餐';
    }

    const depositAmount = Number(formData.depositAmount);
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      return '请填写正确的定金金额';
    }

    if (!formData.salesBrandText.trim() || this.data.salesOptions.indexOf(formData.salesBrandText.trim()) < 0) {
      return '请选择销售负责人';
    }

    if (!formData.appointmentDate || !formData.appointmentTime) {
      return '请选择预约日期和时间';
    }

    return '';
  },

  saveOrder() {
    if (!this.data.hasOrder || this.data.saving) {
      return;
    }

    const order = getOrderById(this.data.orderId);
    if (!order || !this.ensureEditAccess(order)) {
      return;
    }

    const error = this.validateForm();
    if (error) {
      wx.showToast({
        title: error,
        icon: 'none'
      });
      return;
    }

    const existingOrder = getOrderById(this.data.orderId);
    const capacityStatus = getDailyCapacityStatus({
      orders: getOrders(),
      date: this.data.formData.appointmentDate,
      store: this.data.formData.store,
      excludeOrderId: this.data.orderId,
      limit: DAILY_WORK_BAY_LIMIT
    });
    const wasScheduledOnTarget = isOrderScheduledOn(
      existingOrder,
      this.data.formData.appointmentDate,
      this.data.formData.store
    );

    if (capacityStatus.full && !wasScheduledOnTarget) {
      wx.showModal({
        title: '工位已满',
        content: getDailyCapacityMessage(capacityStatus),
        showCancel: false
      });
      return;
    }

    const priceSummary = calculatePrice(this.data.formData, this.data.filmPackages, this.data.addOnOptions);
    const packageData = buildPackageData(this.data.formData.filmPackages, this.data.filmPackages);
    const dispatchInfo = mergeDispatchInfo(existingOrder && existingOrder.dispatchInfo, this.data.formData);
    const patch = {
      status: existingOrder && existingOrder.status === '已取消' ? '已取消' : '未完工',
      ...this.data.formData,
      filmPackage: packageData.values[0] || '',
      filmPackages: packageData.values,
      packageDetails: packageData.details,
      packageLabel: packageData.labelText,
      packageDesc: packageData.descText,
      dispatchInfo,
      deliveryStatus: '待交车验收',
      deliveryPassedAt: '',
      commissionStatus: '未生成',
      commissionGeneratedAt: '',
      commissionTotal: 0,
      commissionRecords: [],
      priceSummary
    };

    this.setData({
      saving: true,
      priceSummary
    });

    const updatedOrder = updateOrder(this.data.orderId, patch);
    if (!updatedOrder) {
      this.setData({ saving: false });
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
      return;
    }

    this.trySyncFinance(updatedOrder, 'ORDER_UPDATED');
    this.setData({ saving: false });
    wx.showToast({
      title: '订单已更新',
      icon: 'success'
    });
    setTimeout(() => {
      this.goBack();
    }, 200);
  },

  trySyncFinance(order, eventType) {
    if (!order || !order.id) {
      return;
    }

    syncOrderToFinance({
      order,
      eventType,
      source: 'MINIPROGRAM_ORDER_EDIT'
    }).then((result) => {
      const patch = buildFinancePatch(result, eventType);
      updateOrder(order.id, patch);
    });
  },

  goProductConfig() {
    wx.navigateTo({
      url: '/pages/product-config/product-config'
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }

    wx.navigateTo({
      url: '/pages/order-list/order-list'
    });
  }
});

function normalizeSelectedPackages(selectedPackages, filmPackages) {
  const validValues = new Set((Array.isArray(filmPackages) ? filmPackages : []).map((item) => item.value));
  if (!Array.isArray(selectedPackages)) {
    return [];
  }

  return selectedPackages
    .map((item) => normalizePackageValue(item))
    .filter((item) => item && validValues.has(item));
}

function normalizePackageValue(value) {
  if (value && typeof value === 'object') {
    if (value.value !== undefined && value.value !== null) {
      return String(value.value).trim();
    }
    return '';
  }
  return String(value || '').trim();
}

function markPackageChecked(filmPackages, selectedPackages) {
  const selectedSet = new Set(normalizeSelectedPackages(selectedPackages, filmPackages));
  const source = Array.isArray(filmPackages) ? filmPackages : [];
  return source.map((item) => ({
    ...item,
    checked: selectedSet.has(item.value)
  }));
}

function getOrderPackageValues(order) {
  if (!order || typeof order !== 'object') {
    return [];
  }

  if (Array.isArray(order.filmPackages) && order.filmPackages.length > 0) {
    return order.filmPackages;
  }

  if (Array.isArray(order.packageDetails) && order.packageDetails.length > 0) {
    return order.packageDetails
      .map((item) => String(item && item.value ? item.value : '').trim())
      .filter((item) => item);
  }

  if (typeof order.filmPackage === 'string' && order.filmPackage.trim()) {
    return [order.filmPackage.trim()];
  }

  return [];
}

function mergeStoreOptions(storeOptions, store) {
  const options = Array.isArray(storeOptions) ? storeOptions.slice() : [];
  const normalizedStore = String(store || '').trim();
  if (normalizedStore && options.indexOf(normalizedStore) < 0) {
    options.push(normalizedStore);
  }
  return options;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return getDateText(new Date());
}

function normalizeTime(value) {
  const text = String(value || '').trim();
  if (/^\d{2}:\d{2}$/.test(text)) {
    return text;
  }
  return '10:00';
}

function getDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildPackageData(selectedPackages, filmPackages) {
  const values = normalizeSelectedPackages(selectedPackages, filmPackages);
  const details = values
    .map((value) => filmPackages.find((item) => item.value === value))
    .filter((item) => Boolean(item))
    .map((item) => ({
      value: item.value,
      label: item.label,
      desc: item.desc || '',
      basePrice: Number(item.basePrice) || 0
    }));

  return {
    values,
    details,
    labelText: details.map((item) => item.label).join(' + '),
    descText: details.map((item) => item.desc || '未填写').join(' + ')
  };
}

function mergeDispatchInfo(dispatchInfo, formData) {
  const current = dispatchInfo && typeof dispatchInfo === 'object' ? dispatchInfo : {};
  const hasAssigned = Boolean(
    String(current.workBay || '').trim() || String(current.technicianName || '').trim()
  );

  const appointmentDate = String(formData && formData.appointmentDate ? formData.appointmentDate : '').trim();
  const appointmentTime = String(formData && formData.appointmentTime ? formData.appointmentTime : '').trim();
  const currentDate = String(current.date || '').trim();
  const currentTime = String(current.time || '').trim();

  return {
    date: hasAssigned ? (currentDate || appointmentDate) : appointmentDate,
    time: hasAssigned ? (currentTime || appointmentTime) : appointmentTime,
    workBay: String(current.workBay || '').trim(),
    technicianName: String(current.technicianName || '').trim(),
    remark: String(current.remark || '').trim(),
    updatedAt: String(current.updatedAt || '').trim()
  };
}

function buildFinancePatch(result, eventType) {
  const now = buildTimeText(new Date());

  if (result.ok) {
    return {
      financeSyncStatus: '已同步',
      financeSyncAt: now,
      financeSyncMessage: result.message || '同步成功',
      financeExternalId: result.externalId || '',
      financeLastEvent: eventType
    };
  }

  if (result.skipped) {
    return {
      financeSyncStatus: '未启用',
      financeSyncAt: now,
      financeSyncMessage: result.message || '未启用同步',
      financeLastEvent: eventType
    };
  }

  return {
    financeSyncStatus: '同步失败',
    financeSyncAt: now,
    financeSyncMessage: result.message || '同步失败',
    financeLastEvent: eventType
  };
}

function buildTimeText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function normalizeAmountInput(value) {
  let result = String(value || '').replace(/[^\d.]/g, '');
  const firstDotIndex = result.indexOf('.');
  if (firstDotIndex >= 0) {
    const head = result.slice(0, firstDotIndex + 1);
    const tail = result.slice(firstDotIndex + 1).replace(/\./g, '');
    result = `${head}${tail}`;
  }

  if (result.startsWith('.')) {
    result = `0${result}`;
  }

  const parts = result.split('.');
  if (parts.length > 1) {
    result = `${parts[0]}.${parts[1].slice(0, 2)}`;
  }

  return result;
}

function normalizeAmountValue(value, fallback) {
  const source = value !== undefined && value !== null && String(value).trim() !== ''
    ? value
    : fallback;
  const amount = Number(source);
  if (!Number.isFinite(amount) || amount < 0) {
    return '';
  }
  return String(Math.round(amount));
}

function isValidContactPhone(value) {
  const text = String(value || '').trim();
  if (!text) {
    return true;
  }

  if (/^1\d{10}$/.test(text)) {
    return true;
  }

  return /^[0-9+\-\s]{4,20}$/.test(text);
}
