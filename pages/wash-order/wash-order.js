const {
  addOrder,
  createOrderId,
  formatDateTime,
  getOrderById,
  getOrders,
  updateOrder
} = require('../../utils/order');
const { syncOrderToFinance } = require('../../utils/finance-sync');
const { TECHNICIAN_OPTIONS } = require('../../utils/staff-options');

const DAILY_WORK_BAY_LIMIT = 10;
const WORK_BAY_OPTIONS = Array.from({ length: DAILY_WORK_BAY_LIMIT }, (_, index) => `${index + 1}号工位`);
const DEFAULT_STORE_OPTIONS = ['BOP 保镖上海工厂店', '龙膜精英店'];
const WASH_TIME_SLOTS = buildTimeSlots(9, 19);

Page({
  data: {
    orderId: '',
    isEdit: false,
    saving: false,
    storeOptions: DEFAULT_STORE_OPTIONS,
    technicianOptions: TECHNICIAN_OPTIONS,
    workBayOptions: WORK_BAY_OPTIONS,
    timeSlotOptions: WASH_TIME_SLOTS,
    storeIndex: 0,
    technicianIndex: -1,
    workBayIndex: 0,
    timeSlotIndex: 0,
    formData: {
      customerName: '',
      phone: '',
      store: DEFAULT_STORE_OPTIONS[0],
      appointmentDate: '',
      appointmentTime: WASH_TIME_SLOTS[0],
      workBay: WORK_BAY_OPTIONS[0],
      technicianName: '',
      totalPrice: '',
      constructionPhotos: [],
      remark: ''
    },
    summary: {
      totalPrice: 0,
      commissionTotal: 0
    }
  },

  onLoad(options) {
    this.setDefaultDate();
    const orderId = options && options.id ? String(options.id) : '';
    if (!orderId) {
      return;
    }

    this.setData({
      isEdit: true,
      orderId
    });
    this.loadOrder(orderId);
  },

  setDefaultDate() {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.setData({
      'formData.appointmentDate': buildDateText(tomorrow),
      'formData.appointmentTime': WASH_TIME_SLOTS[0],
      timeSlotIndex: 0
    });
  },

  loadOrder(orderId) {
    const order = getOrderById(orderId);
    if (!order || order.serviceType !== 'WASH') {
      wx.showToast({ title: '洗车订单不存在', icon: 'none' });
      return;
    }

    const storeOptions = mergeStoreOptions(this.data.storeOptions, order.store);
    const storeValue = order.store && storeOptions.indexOf(order.store) >= 0 ? order.store : storeOptions[0];
    const workBay = getOrderWorkBay(order);
    const workBayIndex = Math.max(0, this.data.workBayOptions.indexOf(workBay));
    const technicianName = getOrderTechnician(order);
    const technicianIndex = this.data.technicianOptions.indexOf(technicianName);
    const appointmentTime = normalizeTimeSlot(getOrderTime(order));
    const timeSlotIndex = Math.max(0, this.data.timeSlotOptions.indexOf(appointmentTime));
    const totalPrice = getOrderTotalPrice(order);

    const formData = {
      customerName: String(order.customerName || ''),
      phone: String(order.phone || ''),
      store: storeValue,
      appointmentDate: normalizeDate(order.appointmentDate || getDispatchValue(order, 'date')),
      appointmentTime,
      workBay: workBayIndex >= 0 ? this.data.workBayOptions[workBayIndex] : this.data.workBayOptions[0],
      technicianName: technicianIndex >= 0 ? this.data.technicianOptions[technicianIndex] : '',
      totalPrice: totalPrice > 0 ? String(totalPrice) : '',
      constructionPhotos: sanitizePhotos(order.constructionPhotos),
      remark: String(order.remark || '')
    };

    this.setData({
      storeOptions,
      storeIndex: Math.max(0, storeOptions.indexOf(storeValue)),
      technicianIndex: technicianIndex >= 0 ? technicianIndex : -1,
      workBayIndex: workBayIndex >= 0 ? workBayIndex : 0,
      timeSlotIndex,
      formData
    });
    this.updateSummary(formData.totalPrice);
  },

  onInputChange(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) {
      return;
    }

    this.setData({
      [`formData.${field}`]: event.detail.value || ''
    });
  },

  onStoreChange(event) {
    const index = Number(event.detail.value);
    const storeOptions = this.data.storeOptions;
    const store = storeOptions[index] || storeOptions[0];
    this.setData({
      storeIndex: index,
      'formData.store': store
    });
  },

  onDateChange(event) {
    this.setData({
      'formData.appointmentDate': event.detail.value
    });
  },

  onTimeSlotChange(event) {
    const index = Number(event.detail.value);
    const timeSlotOptions = this.data.timeSlotOptions;
    const appointmentTime = timeSlotOptions[index] || timeSlotOptions[0];
    this.setData({
      timeSlotIndex: index,
      'formData.appointmentTime': appointmentTime
    });
  },

  onWorkBayChange(event) {
    const index = Number(event.detail.value);
    const workBayOptions = this.data.workBayOptions;
    const workBay = workBayOptions[index] || workBayOptions[0];
    this.setData({
      workBayIndex: index,
      'formData.workBay': workBay
    });
  },

  onTechnicianChange(event) {
    const index = Number(event.detail.value);
    const technicianOptions = this.data.technicianOptions;
    const technicianName = technicianOptions[index] || '';
    this.setData({
      technicianIndex: index,
      'formData.technicianName': technicianName
    });
  },

  onTotalPriceInput(event) {
    const value = normalizeAmountInput(event.detail.value || '');
    this.setData({
      'formData.totalPrice': value
    });
    this.updateSummary(value);
  },

  updateSummary(totalPriceText) {
    const totalPrice = normalizeMoneyValue(totalPriceText);
    const commissionTotal = totalPrice > 0
      ? Math.round(totalPrice * 0.08 * 100) / 100
      : 0;

    this.setData({
      summary: {
        totalPrice,
        commissionTotal
      }
    });
  },

  chooseConstructionPhotos() {
    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const selected = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [];
        const current = sanitizePhotos(this.data.formData.constructionPhotos);
        const merged = current.concat(selected).slice(0, 9);
        this.setData({
          'formData.constructionPhotos': merged
        });
      }
    });
  },

  removeConstructionPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = sanitizePhotos(this.data.formData.constructionPhotos);
    if (index < 0 || index >= photos.length) {
      return;
    }
    photos.splice(index, 1);
    this.setData({
      'formData.constructionPhotos': photos
    });
  },

  previewConstructionPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = sanitizePhotos(this.data.formData.constructionPhotos);
    const current = photos[index] || '';
    if (!current) {
      return;
    }
    wx.previewImage({
      current,
      urls: photos
    });
  },

  submitOrder() {
    if (this.data.saving) {
      return;
    }

    const error = this.validateForm();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }

    const formData = normalizeFormData(this.data.formData);
    const summary = buildSummary(formData.totalPrice);
    const patch = buildWashOrderPatch(formData, summary);

    this.setData({
      saving: true,
      summary
    });

    let orderRecord = null;
    let eventType = '';

    if (this.data.isEdit) {
      orderRecord = updateOrder(this.data.orderId, patch);
      eventType = 'ORDER_UPDATED';
    } else {
      orderRecord = {
        id: createOrderId(),
        status: '未完工',
        createdAt: formatDateTime(new Date()),
        financeSyncStatus: '未同步',
        financeSyncAt: '',
        financeSyncMessage: '待同步',
        financeExternalId: '',
        financeLastEvent: '',
        ...patch
      };
      addOrder(orderRecord);
      eventType = 'ORDER_CREATED';
    }

    if (!orderRecord) {
      this.setData({ saving: false });
      wx.showToast({ title: this.data.isEdit ? '保存失败' : '下单失败', icon: 'none' });
      return;
    }

    this.trySyncFinance(orderRecord, eventType);
    this.setData({ saving: false });

    wx.showModal({
      title: this.data.isEdit ? '保存成功' : '下单成功',
      content: `订单号：${orderRecord.id}`,
      confirmText: '查看订单',
      cancelText: this.data.isEdit ? '返回列表' : '继续下单',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: `/pages/wash-order-detail/wash-order-detail?id=${orderRecord.id}`
          });
          return;
        }

        if (this.data.isEdit) {
          wx.switchTab({
            url: '/pages/order-list/order-list'
          });
          return;
        }

        this.resetForm();
      }
    });
  },

  validateForm() {
    const formData = normalizeFormData(this.data.formData);

    if (!formData.customerName) {
      return '请填写姓名';
    }

    if (!/^1\d{10}$/.test(formData.phone)) {
      return '请填写正确的手机号';
    }

    if (!formData.appointmentDate || !formData.appointmentTime) {
      return '请选择预约日期和时段';
    }

    if (!isValidTimeSlot(formData.appointmentTime)) {
      return '洗车仅支持 09:00-18:00 的整点预约（19:00 收工）';
    }

    const appointment = new Date(`${formData.appointmentDate.replace(/-/g, '/')} ${formData.appointmentTime}`);
    if (appointment.getTime() < Date.now()) {
      return '预约时间不能早于当前时间';
    }

    if (!formData.workBay) {
      return '请选择预约工位';
    }

    if (!formData.technicianName || this.data.technicianOptions.indexOf(formData.technicianName) < 0) {
      return '请选择施工人员';
    }

    const totalPrice = normalizeMoneyValue(formData.totalPrice);
    if (totalPrice <= 0) {
      return '请填写正确的总价格';
    }

    if (formData.constructionPhotos.length === 0) {
      return '请上传施工图片';
    }

    const capacityStatus = getWashDailyCapacityStatus({
      orders: getOrders(),
      date: formData.appointmentDate,
      excludeOrderId: this.data.isEdit ? this.data.orderId : '',
      slotLimit: this.data.timeSlotOptions.length
    });
    if (capacityStatus.full) {
      return `${capacityStatus.date} 全店时段已约满（${capacityStatus.occupied}/${capacityStatus.limit}），请改约其他日期。`;
    }

    const conflictText = findWashSlotConflict(
      this.data.isEdit ? this.data.orderId : '',
      formData,
      getOrders()
    );
    if (conflictText) {
      return conflictText;
    }

    return '';
  },

  resetForm() {
    const defaultDate = buildDateText(new Date(Date.now() + 24 * 60 * 60 * 1000));
    this.setData({
      storeIndex: 0,
      technicianIndex: -1,
      workBayIndex: 0,
      timeSlotIndex: 0,
      formData: {
        customerName: '',
        phone: '',
        store: this.data.storeOptions[0],
        appointmentDate: defaultDate,
        appointmentTime: this.data.timeSlotOptions[0],
        workBay: this.data.workBayOptions[0],
        technicianName: '',
        totalPrice: '',
        constructionPhotos: [],
        remark: ''
      },
      summary: {
        totalPrice: 0,
        commissionTotal: 0
      }
    });
  },

  goFilmOrder() {
    wx.navigateTo({
      url: '/pages/film-order/film-order'
    });
  },

  goWashDispatchBoard() {
    wx.navigateTo({
      url: '/pages/wash-dispatch-board/wash-dispatch-board'
    });
  },

  goOrderList() {
    wx.switchTab({
      url: '/pages/order-list/order-list'
    });
  },

  trySyncFinance(order, eventType) {
    syncOrderToFinance({
      order,
      eventType,
      source: 'MINIPROGRAM_WASH_ORDER'
    }).then((result) => {
      const patch = buildFinancePatch(result, eventType);
      updateOrder(order.id, patch);
    });
  }
});

function buildWashOrderPatch(formData, summary) {
  const nowText = formatDateTime(new Date());
  const technicianName = formData.technicianName;

  return {
    status: '未完工',
    serviceType: 'WASH',
    serviceTypeLabel: '洗车',
    customerName: formData.customerName,
    phone: formData.phone,
    carModel: '洗车服务',
    plateNumber: '',
    sourceChannel: '',
    salesBrandText: '',
    store: formData.store,
    appointmentDate: formData.appointmentDate,
    appointmentTime: formData.appointmentTime,
    filmPackage: '',
    filmPackages: [],
    packageDetails: [],
    packageLabel: '洗车服务',
    packageDesc: '洗车',
    addOns: [],
    depositAmount: 0,
    depositProofPhotos: [],
    finalPaymentPhotos: [],
    finalPaymentUploadedAt: '',
    constructionPhotos: formData.constructionPhotos,
    damagePhotos: [],
    technicianName,
    workPartRecords: [
      {
        id: `WASHPART${Date.now()}`,
        partType: 'WASH',
        partTypeLabel: '洗车施工',
        partCode: 'WASH_SERVICE',
        partLabel: '洗车服务',
        amount: summary.commissionTotal,
        technicianName,
        photos: formData.constructionPhotos,
        submittedAt: nowText
      }
    ],
    dispatchInfo: {
      date: formData.appointmentDate,
      time: formData.appointmentTime,
      workBay: formData.workBay,
      technicianName,
      remark: formData.remark,
      updatedAt: nowText
    },
    deliveryStatus: '待交车验收',
    deliveryPassedAt: '',
    commissionStatus: '已生成',
    commissionGeneratedAt: nowText,
    commissionTotal: summary.commissionTotal,
    commissionRecords: [
      {
        id: `WASHCOM${Date.now()}`,
        partType: 'WASH',
        partTypeLabel: '洗车提成',
        partCode: 'WASH_COMMISSION',
        partLabel: '洗车服务',
        technicianName,
        amount: summary.commissionTotal,
        submittedAt: nowText,
        photos: formData.constructionPhotos
      }
    ],
    followupRecords: [],
    followupLastUpdatedAt: '',
    remark: formData.remark,
    priceSummary: {
      packagePrice: summary.totalPrice,
      addOnFee: 0,
      totalPrice: summary.totalPrice,
      deposit: 0
    }
  };
}

function normalizeFormData(formData) {
  const source = formData || {};
  return {
    customerName: normalizeText(source.customerName),
    phone: normalizeText(source.phone),
    store: normalizeText(source.store),
    appointmentDate: normalizeDate(source.appointmentDate),
    appointmentTime: normalizeTimeSlot(source.appointmentTime),
    workBay: normalizeText(source.workBay),
    technicianName: normalizeText(source.technicianName),
    totalPrice: normalizeText(source.totalPrice),
    constructionPhotos: sanitizePhotos(source.constructionPhotos),
    remark: normalizeText(source.remark)
  };
}

function getWashDailyCapacityStatus(options) {
  const config = options && typeof options === 'object' ? options : {};
  const list = Array.isArray(config.orders) ? config.orders : [];
  const date = normalizeDate(config.date);
  const excludeOrderId = normalizeText(config.excludeOrderId);
  const limit = Number(config.slotLimit) > 0 ? Number(config.slotLimit) : WASH_TIME_SLOTS.length;

  let occupied = 0;
  list.forEach((item) => {
    if (!item || item.status === '已取消' || normalizeText(item.id) === excludeOrderId) {
      return;
    }

    if (item.serviceType !== 'WASH') {
      return;
    }

    const itemDate = normalizeDate(item.appointmentDate || getDispatchValue(item, 'date'));
    if (itemDate !== date) {
      return;
    }

    if (!isValidTimeSlot(getOrderTime(item))) {
      return;
    }

    occupied += 1;
  });

  return {
    date,
    occupied,
    limit,
    full: occupied >= limit
  };
}

function findWashSlotConflict(orderId, formData, orders) {
  const list = Array.isArray(orders) ? orders : [];
  const targetDate = formData.appointmentDate;
  const targetTime = formData.appointmentTime;

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item || item.id === orderId || item.status === '已取消') {
      continue;
    }

    if (item.serviceType !== 'WASH') {
      continue;
    }

    const itemDate = normalizeDate(item.appointmentDate || getDispatchValue(item, 'date'));
    const itemTime = normalizeTimeSlot(getOrderTime(item));

    if (itemDate === targetDate && itemTime === targetTime) {
      return `该时段已预约：${item.id}（${item.customerName || '未知客户'}）`;
    }
  }

  return '';
}

function normalizeMoneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.round(number * 100) / 100;
}

function buildSummary(totalPriceText) {
  const totalPrice = normalizeMoneyValue(totalPriceText);
  const commissionTotal = totalPrice > 0
    ? Math.round(totalPrice * 0.08 * 100) / 100
    : 0;
  return {
    totalPrice,
    commissionTotal
  };
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

function sanitizePhotos(photos) {
  if (!Array.isArray(photos)) {
    return [];
  }

  return photos
    .map((item) => normalizeText(item))
    .filter((item) => item);
}

function mergeStoreOptions(storeOptions, storeValue) {
  const options = Array.isArray(storeOptions) ? storeOptions.slice() : [];
  const store = normalizeText(storeValue);
  if (store && options.indexOf(store) < 0) {
    options.push(store);
  }
  return options;
}

function getDispatchValue(order, field) {
  const dispatchInfo = order && order.dispatchInfo && typeof order.dispatchInfo === 'object'
    ? order.dispatchInfo
    : {};
  return dispatchInfo[field];
}

function getOrderWorkBay(order) {
  const workBay = normalizeText(getDispatchValue(order, 'workBay'));
  return workBay || WORK_BAY_OPTIONS[0];
}

function getOrderTechnician(order) {
  return normalizeText(getDispatchValue(order, 'technicianName') || order.technicianName);
}

function getOrderTime(order) {
  return normalizeText(order.appointmentTime || getDispatchValue(order, 'time'));
}

function getOrderTotalPrice(order) {
  const summary = order && order.priceSummary && typeof order.priceSummary === 'object'
    ? order.priceSummary
    : {};
  const price = Number(summary.totalPrice);
  if (Number.isFinite(price) && price > 0) {
    return Math.round(price * 100) / 100;
  }
  return 0;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return buildDateText(new Date());
}

function normalizeTimeSlot(value) {
  const text = normalizeText(value);
  if (isValidTimeSlot(text)) {
    return text;
  }
  return WASH_TIME_SLOTS[0];
}

function isValidTimeSlot(value) {
  return WASH_TIME_SLOTS.indexOf(normalizeText(value)) >= 0;
}

function buildTimeSlots(startHour, endHour) {
  const slots = [];
  for (let hour = startHour; hour < endHour; hour += 1) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
  }
  return slots;
}

function buildDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

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
