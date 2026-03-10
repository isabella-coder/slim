const {
  addOrder,
  calculatePrice,
  createOrderId,
  formatDateTime,
  getOrders,
  updateOrder
} = require('../../utils/order');
const { getProductCatalog } = require('../../utils/product-catalog');
const { syncOrderToFinance } = require('../../utils/finance-sync');
const {
  DAILY_WORK_BAY_LIMIT,
  getDailyCapacityMessage,
  getDailyCapacityStatus
} = require('../../utils/scheduling');
const { SALES_OPTIONS } = require('../../utils/staff-options');

Page({
  data: {
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
      vinPhoto: '',
      sourceChannel: '',
      depositAmount: '',
      depositProofPhotos: [],
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
    this.setDefaultDate();
    this.loadProductCatalog();
    // 从线索转工单：预填客户信息
    if (options && (options.customerName || options.phone || options.carModel)) {
      const patch = {};
      if (options.customerName) patch['formData.customerName'] = decodeURIComponent(options.customerName);
      if (options.phone) patch['formData.phone'] = decodeURIComponent(options.phone);
      if (options.carModel) patch['formData.carModel'] = decodeURIComponent(options.carModel);
      if (options.fromLead) patch['formData.remark'] = `来自抖音线索: ${decodeURIComponent(options.fromLead)}`;
      this.setData(patch);
    }
  },

  onShow() {
    this.loadProductCatalog();
  },

  loadProductCatalog() {
    const productCatalog = getProductCatalog();
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

  setDefaultDate() {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateText = `${tomorrow.getFullYear()}-${this.pad(tomorrow.getMonth() + 1)}-${this.pad(tomorrow.getDate())}`;
    this.setData({
      'formData.appointmentDate': dateText
    });
  },

  pad(number) {
    return number.toString().padStart(2, '0');
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
      'formData.addOns': selectedValues,
      addOnOptions
    });
    this.recalculatePrice(nextFormData);
  },

  chooseVinPhoto() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const selected = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [];
        const photo = selected[0] || '';
        if (!photo) {
          return;
        }

        this.setData({
          'formData.vinPhoto': photo
        });
      }
    });
  },

  removeVinPhoto() {
    this.setData({
      'formData.vinPhoto': ''
    });
  },

  previewVinPhoto() {
    const current = this.data.formData && this.data.formData.vinPhoto
      ? this.data.formData.vinPhoto
      : '';
    if (!current) {
      return;
    }

    wx.previewImage({
      current,
      urls: [current]
    });
  },

  chooseDepositProof() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const selected = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [];
        const photo = selected[0] || '';
        if (!photo) {
          return;
        }

        this.setData({
          'formData.depositProofPhotos': [photo]
        });
      }
    });
  },

  removeDepositProof() {
    this.setData({
      'formData.depositProofPhotos': []
    });
  },

  previewDepositProof(event) {
    const index = Number(event.currentTarget.dataset.index);
    const urls = Array.isArray(this.data.formData.depositProofPhotos) ? this.data.formData.depositProofPhotos : [];
    const current = urls[index] || '';
    if (!current) {
      return;
    }

    wx.previewImage({
      current,
      urls
    });
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
      return '请先配置产品并选择贴膜套餐';
    }

    const depositAmount = Number(formData.depositAmount);
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      return '请填写正确的定金金额';
    }

    if (!Array.isArray(formData.depositProofPhotos) || formData.depositProofPhotos.length === 0) {
      return '请上传定金截图';
    }

    if (!formData.salesBrandText.trim() || this.data.salesOptions.indexOf(formData.salesBrandText.trim()) < 0) {
      return '请选择销售负责人';
    }

    if (!formData.appointmentDate || !formData.appointmentTime) {
      return '请选择预约日期和时间';
    }

    const appointment = new Date(`${formData.appointmentDate.replace(/-/g, '/')} ${formData.appointmentTime}`);
    if (appointment.getTime() < Date.now()) {
      return '预约时间不能早于当前时间';
    }

    const capacityStatus = getDailyCapacityStatus({
      orders: getOrders(),
      date: formData.appointmentDate,
      store: formData.store,
      limit: DAILY_WORK_BAY_LIMIT
    });
    if (capacityStatus.full) {
      return getDailyCapacityMessage(capacityStatus);
    }

    return '';
  },

  buildOrderRecord(priceSummary) {
    const { formData, filmPackages } = this.data;
    const selectedValues = normalizeSelectedPackages(formData.filmPackages, filmPackages);
    const selectedItems = selectedValues
      .map((value) => filmPackages.find((item) => item.value === value))
      .filter((item) => Boolean(item));
    const packageDetails = selectedItems.map((item) => ({
      value: item.value,
      label: item.label,
      desc: item.desc || '',
      basePrice: Number(item.basePrice) || 0
    }));
    const packageLabel = packageDetails.map((item) => item.label).join(' + ');
    const packageDesc = packageDetails.map((item) => item.desc || '未填写').join(' + ');

    return {
      id: createOrderId(),
      serviceType: 'FILM',
      serviceTypeLabel: '贴膜',
      status: '未完工',
      createdAt: formatDateTime(new Date()),
      ...formData,
      filmPackage: selectedValues[0] || '',
      filmPackages: selectedValues,
      packageDetails,
      packageLabel,
      packageDesc,
      technicianName: '',
      constructionPhotos: [],
      damagePhotos: [],
      workPartRecords: [],
      dispatchInfo: {
        date: formData.appointmentDate || '',
        time: formData.appointmentTime || '',
        workBay: '',
        technicianName: '',
        remark: '',
        updatedAt: ''
      },
      deliveryStatus: '待交车验收',
      deliveryPassedAt: '',
      commissionStatus: '未生成',
      commissionGeneratedAt: '',
      commissionTotal: 0,
      commissionRecords: [],
      followupRecords: [],
      followupLastUpdatedAt: '',
      financeSyncStatus: '未同步',
      financeSyncAt: '',
      financeSyncMessage: '待同步',
      financeExternalId: '',
      financeLastEvent: '',
      priceSummary
    };
  },

  submitOrder() {
    const error = this.validateForm();
    if (error) {
      wx.showToast({
        title: error,
        icon: 'none'
      });
      return;
    }

    const priceSummary = calculatePrice(this.data.formData, this.data.filmPackages, this.data.addOnOptions);
    this.setData({ priceSummary });
    const order = this.buildOrderRecord(priceSummary);
    addOrder(order);
    this.trySyncFinance(order, 'ORDER_CREATED');

    wx.showModal({
      title: '下单成功',
      content: `订单号：${order.id}`,
      confirmText: '查看订单',
      cancelText: '继续下单',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: `/pages/order-detail/order-detail?id=${order.id}`
          });
          return;
        }

        this.resetForm();
      }
    });
  },

  resetForm() {
    const addOnOptions = this.data.addOnOptions.map((item) => ({
      ...item,
      checked: false
    }));
    const defaultPackages = this.data.filmPackages[0] ? [this.data.filmPackages[0].value] : [];
    const nextFilmPackages = markPackageChecked(this.data.filmPackages, defaultPackages);

    this.setData({
      salesIndex: -1,
      storeIndex: 0,
      addOnOptions,
      filmPackages: nextFilmPackages,
      selectedPackageCount: defaultPackages.length,
      formData: {
        customerName: '',
        phone: '',
        carModel: '',
        plateNumber: '',
        vinPhoto: '',
        sourceChannel: '',
        depositAmount: '',
        depositProofPhotos: [],
        filmPackages: defaultPackages,
        salesBrandText: '',
        store: 'BOP 保镖上海工厂店',
        appointmentDate: this.data.formData.appointmentDate,
        appointmentTime: '10:00',
        addOns: [],
        remark: ''
      }
    });

    this.recalculatePrice({
      customerName: '',
      phone: '',
      carModel: '',
      plateNumber: '',
      vinPhoto: '',
      sourceChannel: '',
      depositAmount: '',
      depositProofPhotos: [],
      filmPackages: defaultPackages,
      salesBrandText: '',
      store: 'BOP 保镖上海工厂店',
      appointmentDate: this.data.formData.appointmentDate,
      appointmentTime: '10:00',
      addOns: [],
      remark: ''
    });
  },

  goOrderList() {
    wx.switchTab({
      url: '/pages/order-list/order-list'
    });
  },

  goProductConfig() {
    wx.navigateTo({
      url: '/pages/product-config/product-config'
    });
  },

  goDispatchBoard() {
    wx.navigateTo({
      url: '/pages/dispatch-board/dispatch-board'
    });
  },

  goSalesPerformance() {
    wx.navigateTo({
      url: '/pages/sales-performance/sales-performance'
    });
  },

  trySyncFinance(order, eventType) {
    syncOrderToFinance({
      order,
      eventType,
      source: 'MINIPROGRAM_ORDER_CREATE'
    }).then((result) => {
      const patch = buildFinancePatch(result, eventType);
      updateOrder(order.id, patch);
    });
  }
});

function buildFinancePatch(result, eventType) {
  const now = formatDateTime(new Date());

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
