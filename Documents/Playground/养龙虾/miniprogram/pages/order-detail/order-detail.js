const { getOrderById, getOrders, syncOrdersNow, updateOrder, updateOrderStatus } = require('../../utils/order');
const { syncOrderToFinance } = require('../../utils/finance-sync');
const {
  DAILY_WORK_BAY_LIMIT,
  getDailyCapacityMessage,
  getDailyCapacityStatus,
  isOrderScheduledOn
} = require('../../utils/scheduling');
const {
  TECHNICIAN_OPTIONS,
  findTechnicianAccountById,
  findTechnicianAccountByName
} = require('../../utils/staff-options');
const { ensureMiniSessionOrNavigate } = require('../../utils/page-access');
const {
  getCurrentUserContext,
  isManagerContext,
  isTechnicianContext
} = require('../../utils/user-context');

const WORK_BAY_OPTIONS = Array.from({ length: DAILY_WORK_BAY_LIMIT }, (_, index) => `${index + 1}号工位`);

const PART_TYPE_OPTIONS = [
  { label: '整车提成', value: 'FULL_CAR' },
  { label: '局部补膜提成', value: 'PARTIAL_PATCH' }
];

const PART_RULES = {
  FULL_CAR: [
    { code: 'FULL_FRONT_HOOD', label: '前杠机盖', amount: 200 },
    { code: 'FULL_REAR_TRUNK_WING', label: '后杠后盖尾翼', amount: 200 },
    { code: 'FULL_LEFT_SIDE', label: '左侧面', amount: 100 },
    { code: 'FULL_RIGHT_SIDE', label: '右侧面', amount: 100 }
  ],
  PARTIAL_PATCH: [
    { code: 'PATCH_HOOD', label: '机盖', amount: 40 },
    { code: 'PATCH_FRONT_BUMPER', label: '前杠', amount: 100 },
    { code: 'PATCH_ROOF', label: '顶', amount: 40 },
    { code: 'PATCH_FRONT_FENDER', label: '前叶', amount: 15 },
    { code: 'PATCH_REAR_FENDER', label: '后叶', amount: 40 },
    { code: 'PATCH_DOOR', label: '门', amount: 15 },
    { code: 'PATCH_TRUNK', label: '后盖', amount: 20 },
    { code: 'PATCH_REAR_BUMPER', label: '后杠', amount: 100 }
  ]
};

Page({
  data: {
    orderId: '',
    order: null,
    hasOrder: false,
    financeSyncLoading: false,
    generatingCommission: false,
    servicePhone: '',
    currentUser: {},
    isManagerMode: true,
    isTechnicianMode: false,
    canSubmitWorkPart: true,
    canCompleteOrder: false,
    displayedCommissionRecords: [],
    displayedCommissionTotal: 0,
    priceView: {
      packagePrice: 0,
      addOnFee: 0,
      totalPrice: 0,
      deposit: 0
    },
    partTypeOptions: PART_TYPE_OPTIONS,
    partTypeIndex: 0,
    partOptions: PART_RULES.FULL_CAR,
    partTechnicianIndex: -1,
    workBayOptions: WORK_BAY_OPTIONS,
    technicianOptions: TECHNICIAN_OPTIONS,
    dispatchTechnicianOptions: [],
    dispatchBayIndex: 0,
    dispatchForm: {
      date: '',
      time: '',
      workBay: WORK_BAY_OPTIONS[0],
      technicianNames: [],
      remark: ''
    },
    partForm: {
      partType: 'FULL_CAR',
      partCodes: ['FULL_FRONT_HOOD'],
      technicianAccountId: '',
      technicianAccountName: '',
      technicianName: '',
      photos: []
    }
  },

  onLoad(options) {
    if (!this.ensureLoggedInSession()) {
      return;
    }

    const app = getApp();
    const orderId = options.id || '';
    const currentUser = getCurrentUserContext();
    const managerMode = isManagerContext(currentUser);

    this.setData({
      servicePhone: app.globalData.servicePhone,
      orderId,
      currentUser,
      isManagerMode: managerMode,
      isTechnicianMode: isTechnicianContext(currentUser),
      canSubmitWorkPart: managerMode || isTechnicianContext(currentUser),
      dispatchTechnicianOptions: buildTechnicianCheckOptions([], this.data.technicianOptions)
    });

    this.syncPartPicker('FULL_CAR', ['FULL_FRONT_HOOD']);

    if (!orderId) {
      return;
    }

    syncOrdersNow()
      .catch(() => {})
      .finally(() => {
        this.loadOrder(orderId);
      });
  },

  onShow() {
    if (!this.ensureLoggedInSession()) {
      return;
    }

    const currentUser = getCurrentUserContext();
    const managerMode = isManagerContext(currentUser);
    this.setData({
      currentUser,
      isManagerMode: managerMode,
      isTechnicianMode: isTechnicianContext(currentUser),
      canSubmitWorkPart: managerMode || isTechnicianContext(currentUser)
    });

    if (this.data.orderId) {
      syncOrdersNow()
        .catch(() => {})
        .finally(() => {
          this.loadOrder(this.data.orderId);
        });
    }
  },

  ensureLoggedInSession() {
    return ensureMiniSessionOrNavigate();
  },

  loadOrder(orderId) {
    const order = getOrderById(orderId);
    const normalizedOrder = normalizeOrder(order);
    const dispatchState = getDispatchState(normalizedOrder, this.data.workBayOptions, this.data.technicianOptions);
    const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
    const activeTechnician = getActiveTechnicianProfile(this.data.currentUser);
    const isTechnicianMode = permissionState.isTechnicianMode;
    const lockedTechnicianName = activeTechnician && activeTechnician.name ? activeTechnician.name : '';
    const partTechnicianName = isTechnicianMode
      ? lockedTechnicianName
      : (this.data.partForm.technicianName || '');
    const partTechnicianAccountId = isTechnicianMode
      ? (activeTechnician && activeTechnician.id ? activeTechnician.id : '')
      : getTechnicianAccountIdByName(partTechnicianName);
    const partTechnicianIndex = this.data.technicianOptions.indexOf(partTechnicianName);

    this.setData({
      order: normalizedOrder,
      hasOrder: Boolean(normalizedOrder),
      priceView: normalizePriceSummary(normalizedOrder ? normalizedOrder.priceSummary : null),
      isManagerMode: permissionState.isManagerMode,
      isTechnicianMode: permissionState.isTechnicianMode,
      canSubmitWorkPart: permissionState.canSubmitWorkPart,
      canCompleteOrder: permissionState.canCompleteOrder,
      displayedCommissionRecords: permissionState.displayedCommissionRecords,
      displayedCommissionTotal: permissionState.displayedCommissionTotal,
      dispatchBayIndex: dispatchState.bayIndex,
      dispatchTechnicianOptions: buildTechnicianCheckOptions(dispatchState.form.technicianNames, this.data.technicianOptions),
      partTechnicianIndex: partTechnicianIndex >= 0 ? partTechnicianIndex : (isTechnicianMode ? 0 : -1),
      dispatchForm: dispatchState.form,
      partForm: {
        ...this.data.partForm,
        technicianAccountId: partTechnicianAccountId,
        technicianAccountName: partTechnicianName,
        technicianName: partTechnicianName
      }
    });
  },

  copyOrderId() {
    if (!this.data.hasOrder) {
      return;
    }

    wx.setClipboardData({
      data: this.data.order.id
    });
  },

  callService() {
    wx.makePhoneCall({
      phoneNumber: this.data.servicePhone
    });
  },

  cancelOrder() {
    if (!this.data.isManagerMode) {
      wx.showToast({ title: '仅最高权限可取消订单', icon: 'none' });
      return;
    }
    if (!this.data.hasOrder) {
      return;
    }

    if (this.data.order.status === '已取消') {
      wx.showToast({ title: '订单已取消', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认取消订单吗？',
      content: '取消后需要重新下单，已支付定金请联系客服处理。',
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        const updatedOrder = updateOrderStatus(this.data.order.id, '已取消');
        if (!updatedOrder) {
          wx.showToast({ title: '取消失败', icon: 'none' });
          return;
        }

        const normalizedOrder = normalizeOrder(updatedOrder);
        const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
        this.setData({
          order: normalizedOrder,
          hasOrder: true,
          priceView: normalizePriceSummary(normalizedOrder.priceSummary),
          canCompleteOrder: permissionState.canCompleteOrder,
          displayedCommissionRecords: permissionState.displayedCommissionRecords,
          displayedCommissionTotal: permissionState.displayedCommissionTotal
        });

        this.trySyncFinance(normalizedOrder, 'ORDER_CANCELLED');

        wx.showToast({
          title: '已取消',
          icon: 'success'
        });
      }
    });
  },

  onPartTypeChange(event) {
    if (!this.data.canSubmitWorkPart) {
      return;
    }
    const index = Number(event.detail.value);
    const option = PART_TYPE_OPTIONS[index] || PART_TYPE_OPTIONS[0];
    this.syncPartPicker(option.value, []);
  },

  onPartCodesChange(event) {
    if (!this.data.canSubmitWorkPart) {
      return;
    }
    const selected = sanitizeStringList(event && event.detail ? event.detail.value : []);
    const validCodes = new Set(this.data.partOptions.map((item) => item.code));
    const partCodes = selected.filter((item) => validCodes.has(item));
    const partOptions = this.data.partOptions.map((item) => ({
      ...item,
      checked: partCodes.indexOf(item.code) >= 0
    }));
    this.setData({
      partOptions,
      'partForm.partCodes': partCodes
    });
  },

  onPartTechnicianChange(event) {
    if (!this.data.canSubmitWorkPart) {
      return;
    }
    if (this.data.isTechnicianMode) {
      return;
    }
    const index = Number(event.detail.value);
    const technicianOptions = this.data.technicianOptions;
    const technicianName = technicianOptions[index] || '';
    const technicianAccountId = getTechnicianAccountIdByName(technicianName);
    this.setData({
      partTechnicianIndex: index,
      'partForm.technicianAccountId': technicianAccountId,
      'partForm.technicianAccountName': technicianName,
      'partForm.technicianName': technicianName
    });
  },

  choosePartPhotos() {
    if (!this.data.canSubmitWorkPart) {
      wx.showToast({ title: '当前账号无施工提交权限', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const selected = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [];
        const current = Array.isArray(this.data.partForm.photos) ? this.data.partForm.photos : [];
        const merged = current.concat(selected).slice(0, 9);
        this.setData({
          'partForm.photos': merged
        });
      }
    });
  },

  removePartPhoto(event) {
    if (!this.data.canSubmitWorkPart) {
      return;
    }
    const index = Number(event.currentTarget.dataset.index);
    const list = Array.isArray(this.data.partForm.photos) ? this.data.partForm.photos.slice() : [];
    if (index < 0 || index >= list.length) {
      return;
    }

    list.splice(index, 1);
    this.setData({
      'partForm.photos': list
    });
  },

  previewPartPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const urls = Array.isArray(this.data.partForm.photos) ? this.data.partForm.photos : [];
    const current = urls[index] || '';
    if (!current) {
      return;
    }

    wx.previewImage({
      current,
      urls
    });
  },

  previewWorkPhoto(event) {
    const recordIndex = Number(event.currentTarget.dataset.recordIndex);
    const photoIndex = Number(event.currentTarget.dataset.photoIndex);
    const records = this.data.order && Array.isArray(this.data.order.workPartRecords)
      ? this.data.order.workPartRecords
      : [];
    const record = records[recordIndex];
    if (!record || !Array.isArray(record.photos)) {
      return;
    }

    const current = record.photos[photoIndex] || '';
    if (!current) {
      return;
    }

    wx.previewImage({
      current,
      urls: record.photos
    });
  },

  previewVinPhoto() {
    const current = this.data.order && this.data.order.vinPhoto
      ? this.data.order.vinPhoto
      : '';
    if (!current) {
      return;
    }

    wx.previewImage({
      current,
      urls: [current]
    });
  },

  previewDepositProof(event) {
    const index = Number(event.currentTarget.dataset.index);
    const urls = this.data.order && Array.isArray(this.data.order.depositProofPhotos)
      ? this.data.order.depositProofPhotos
      : [];
    const current = urls[index] || '';
    if (!current) {
      return;
    }

    wx.previewImage({
      current,
      urls
    });
  },

  chooseConstructionPhotos() {
    if (!this.data.hasOrder) {
      return;
    }

    const order = normalizeOrder(this.data.order);
    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const selected = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [];
        const current = Array.isArray(order.constructionPhotos) ? order.constructionPhotos : [];
        const merged = current.concat(selected).slice(0, 9);
        const updatedOrder = updateOrder(order.id, {
          constructionPhotos: merged
        });
        if (!updatedOrder) {
          wx.showToast({ title: '上传失败', icon: 'none' });
          return;
        }

        const normalizedOrder = normalizeOrder(updatedOrder);
        const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
        this.setData({
          order: normalizedOrder,
          canCompleteOrder: permissionState.canCompleteOrder,
          displayedCommissionRecords: permissionState.displayedCommissionRecords,
          displayedCommissionTotal: permissionState.displayedCommissionTotal
        });
        this.trySyncFinance(normalizedOrder, 'ORDER_COMPLETION_PHOTOS_UPLOADED');
      }
    });
  },

  removeConstructionPhoto(event) {
    if (!this.data.hasOrder) {
      return;
    }

    const order = normalizeOrder(this.data.order);
    const index = Number(event.currentTarget.dataset.index);
    const list = Array.isArray(order.constructionPhotos) ? order.constructionPhotos.slice() : [];
    if (index < 0 || index >= list.length) {
      return;
    }

    list.splice(index, 1);
    const updatedOrder = updateOrder(order.id, {
      constructionPhotos: list
    });
    if (!updatedOrder) {
      wx.showToast({ title: '删除失败', icon: 'none' });
      return;
    }

    const normalizedOrder = normalizeOrder(updatedOrder);
    const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
    this.setData({
      order: normalizedOrder,
      canCompleteOrder: permissionState.canCompleteOrder,
      displayedCommissionRecords: permissionState.displayedCommissionRecords,
      displayedCommissionTotal: permissionState.displayedCommissionTotal
    });
    this.trySyncFinance(normalizedOrder, 'ORDER_COMPLETION_PHOTOS_UPDATED');
  },

  previewConstructionPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const urls = this.data.order && Array.isArray(this.data.order.constructionPhotos)
      ? this.data.order.constructionPhotos
      : [];
    const current = urls[index] || '';
    if (!current) {
      return;
    }

    wx.previewImage({
      current,
      urls
    });
  },

  onDispatchDateChange(event) {
    if (!this.data.isManagerMode) {
      return;
    }
    this.setData({
      'dispatchForm.date': event.detail.value
    });
  },

  onDispatchTimeChange(event) {
    if (!this.data.isManagerMode) {
      return;
    }
    this.setData({
      'dispatchForm.time': event.detail.value
    });
  },

  onDispatchBayChange(event) {
    if (!this.data.isManagerMode) {
      return;
    }
    const index = Number(event.detail.value);
    const bayOptions = this.data.workBayOptions;
    const bay = bayOptions[index] || bayOptions[0];
    this.setData({
      dispatchBayIndex: index,
      'dispatchForm.workBay': bay
    });
  },

  onDispatchTechniciansChange(event) {
    if (!this.data.isManagerMode) {
      return;
    }
    const selected = sanitizeStringList(event && event.detail ? event.detail.value : []);
    const validSet = new Set(this.data.technicianOptions);
    const technicianNames = selected.filter((item) => validSet.has(item));
    const dispatchTechnicianOptions = buildTechnicianCheckOptions(technicianNames, this.data.technicianOptions);
    this.setData({
      dispatchTechnicianOptions,
      'dispatchForm.technicianNames': technicianNames
    });
  },

  onDispatchRemarkInput(event) {
    if (!this.data.isManagerMode) {
      return;
    }
    this.setData({
      'dispatchForm.remark': event.detail.value || ''
    });
  },

  saveDispatch() {
    if (!this.data.isManagerMode) {
      wx.showToast({ title: '仅最高权限可操作派工', icon: 'none' });
      return;
    }
    if (!this.data.hasOrder) {
      return;
    }

    const order = normalizeOrder(this.data.order);
    if (!order) {
      return;
    }

    const dispatch = normalizeDispatchInfo(this.data.dispatchForm);
    const error = validateDispatchInfo(dispatch);
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }

    if (dispatch.technicianNames.some((name) => this.data.technicianOptions.indexOf(name) < 0)) {
      wx.showToast({ title: '请选择派工技师', icon: 'none' });
      return;
    }

    const fullCapacityMessage = findDailyCapacityConflict(order.id, order, dispatch, getOrders(), DAILY_WORK_BAY_LIMIT);
    if (fullCapacityMessage) {
      wx.showModal({
        title: '工位已满',
        content: fullCapacityMessage,
        showCancel: false
      });
      return;
    }

    const conflict = findDispatchConflict(order.id, dispatch, getOrders());
    if (conflict) {
      wx.showModal({
        title: '派工冲突',
        content: conflict,
        showCancel: false
      });
      return;
    }

    const patch = {
      status: order.status === '已取消' ? '已取消' : (order.status === '已完工' ? '已完工' : '未完工'),
      technicianName: dispatch.technicianName || '',
      dispatchInfo: {
        ...dispatch,
        updatedAt: buildTimeText(new Date())
      }
    };
    const updatedOrder = updateOrder(order.id, patch);
    if (!updatedOrder) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }

    const normalizedOrder = normalizeOrder(updatedOrder);
    const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
    const dispatchState = getDispatchState(normalizedOrder, this.data.workBayOptions, this.data.technicianOptions);
    this.setData({
      order: normalizedOrder,
      canCompleteOrder: permissionState.canCompleteOrder,
      displayedCommissionRecords: permissionState.displayedCommissionRecords,
      displayedCommissionTotal: permissionState.displayedCommissionTotal,
      dispatchBayIndex: dispatchState.bayIndex,
      dispatchTechnicianOptions: buildTechnicianCheckOptions(dispatchState.form.technicianNames, this.data.technicianOptions),
      dispatchForm: dispatchState.form
    });
    this.trySyncFinance(normalizedOrder, 'ORDER_DISPATCH_UPDATED');
    wx.showToast({
      title: '派工已保存',
      icon: 'success'
    });
  },

  goDispatchBoard() {
    const dispatchDate = this.data.dispatchForm && this.data.dispatchForm.date
      ? this.data.dispatchForm.date
      : '';
    const query = dispatchDate ? `?date=${dispatchDate}` : '';
    wx.navigateTo({
      url: `/pages/dispatch-board/dispatch-board${query}`
    });
  },

  chooseFinalPaymentPhotos() {
    if (!this.data.hasOrder) {
      return;
    }

    const order = normalizeOrder(this.data.order);
    if (order.deliveryStatus !== '交车通过') {
      wx.showToast({ title: '请先确认交车通过', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const selected = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [];
        const current = Array.isArray(order.finalPaymentPhotos) ? order.finalPaymentPhotos : [];
        const merged = current.concat(selected).slice(0, 9);
        const patch = {
          finalPaymentPhotos: merged,
          finalPaymentUploadedAt: merged.length > 0 ? buildTimeText(new Date()) : ''
        };
        const updatedOrder = updateOrder(order.id, patch);
        if (!updatedOrder) {
          wx.showToast({ title: '上传失败', icon: 'none' });
          return;
        }

        const normalizedOrder = normalizeOrder(updatedOrder);
        const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
        this.setData({
          order: normalizedOrder,
          canCompleteOrder: permissionState.canCompleteOrder,
          displayedCommissionRecords: permissionState.displayedCommissionRecords,
          displayedCommissionTotal: permissionState.displayedCommissionTotal
        });
        this.trySyncFinance(normalizedOrder, 'ORDER_FINAL_PAYMENT_UPLOADED');
      }
    });
  },

  removeFinalPaymentPhoto(event) {
    if (!this.data.hasOrder) {
      return;
    }

    const order = normalizeOrder(this.data.order);
    const index = Number(event.currentTarget.dataset.index);
    const list = Array.isArray(order.finalPaymentPhotos) ? order.finalPaymentPhotos.slice() : [];
    if (index < 0 || index >= list.length) {
      return;
    }

    list.splice(index, 1);
    const nextStatus = list.length > 0 || order.status === '已取消' || order.status !== '已完工'
      ? order.status
      : '未完工';
    const patch = {
      status: nextStatus,
      finalPaymentPhotos: list,
      finalPaymentUploadedAt: list.length > 0 ? (order.finalPaymentUploadedAt || buildTimeText(new Date())) : ''
    };
    const updatedOrder = updateOrder(order.id, patch);
    if (!updatedOrder) {
      wx.showToast({ title: '删除失败', icon: 'none' });
      return;
    }

    const normalizedOrder = normalizeOrder(updatedOrder);
    const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
    this.setData({
      order: normalizedOrder,
      canCompleteOrder: permissionState.canCompleteOrder,
      displayedCommissionRecords: permissionState.displayedCommissionRecords,
      displayedCommissionTotal: permissionState.displayedCommissionTotal
    });
    this.trySyncFinance(normalizedOrder, 'ORDER_FINAL_PAYMENT_UPDATED');
  },

  previewFinalPaymentPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const urls = this.data.order && Array.isArray(this.data.order.finalPaymentPhotos)
      ? this.data.order.finalPaymentPhotos
      : [];
    const current = urls[index] || '';
    if (!current) {
      return;
    }

    wx.previewImage({
      current,
      urls
    });
  },

  saveWorkPartRecord() {
    if (!this.data.hasOrder) {
      return;
    }
    if (!this.data.canSubmitWorkPart) {
      wx.showToast({ title: '当前账号无施工提交权限', icon: 'none' });
      return;
    }

    const activeTechnician = getActiveTechnicianProfile(this.data.currentUser);
    const technicianName = this.data.isTechnicianMode
      ? (activeTechnician && activeTechnician.name ? activeTechnician.name : '')
      : String(this.data.partForm.technicianName || '').trim();
    const technicianAccountId = this.data.isTechnicianMode
      ? (activeTechnician && activeTechnician.id ? activeTechnician.id : '')
      : getTechnicianAccountIdByName(technicianName);
    const technicianAccountName = getTechnicianDisplayName(technicianAccountId, technicianName);
    const partType = getSafePartType(this.data.partForm.partType);
    const validPartCodes = new Set(getPartOptions(partType).map((item) => item.code));
    const partCodes = sanitizeStringList(this.data.partForm.partCodes).filter((code) => validPartCodes.has(code));
    const photos = sanitizePhotos(this.data.partForm.photos);

    if (!technicianName) {
      wx.showToast({ title: '请选择施工人员', icon: 'none' });
      return;
    }

    if (this.data.technicianOptions.indexOf(technicianName) < 0) {
      wx.showToast({ title: '请选择施工人员', icon: 'none' });
      return;
    }

    if (!technicianAccountId) {
      wx.showToast({ title: '施工账号无效，请重新选择', icon: 'none' });
      return;
    }

    if (partCodes.length === 0) {
      wx.showToast({ title: '请选择施工部位', icon: 'none' });
      return;
    }

    if (photos.length === 0) {
      wx.showToast({ title: '请上传施工照片', icon: 'none' });
      return;
    }

    const currentOrder = normalizeOrder(this.data.order);
    const records = Array.isArray(currentOrder.workPartRecords) ? currentOrder.workPartRecords.slice() : [];
    const nowText = buildTimeText(new Date());
    const selectedKeys = new Set(partCodes.map((partCode) => buildPartKey(partType, partCode)));
    const isTechMode = this.data.isTechnicianMode;
    if (isTechMode) {
      const conflictRecord = records.find((item) => {
        const partKey = buildPartKey(item.partType, item.partCode);
        return selectedKeys.has(partKey) && !isOwnedByCurrentTechnician(item, this.data.currentUser);
      });
      if (conflictRecord) {
        wx.showToast({
          title: `${conflictRecord.partLabel || '该部位'}已由${conflictRecord.technicianName || '其他技师'}提交`,
          icon: 'none'
        });
        return;
      }
    }
    const untouchedRecords = records.filter((item) => {
      const partKey = buildPartKey(item.partType, item.partCode);
      if (!selectedKeys.has(partKey)) {
        return true;
      }
      return isTechMode && !isOwnedByCurrentTechnician(item, this.data.currentUser);
    });
    const nextRecords = partCodes.map((partCode) => {
      const partMeta = findPartMeta(partType, partCode);
      if (!partMeta) {
        return null;
      }
      const key = buildPartKey(partType, partCode);
      const existing = records.find((item) => {
        if (buildPartKey(item.partType, item.partCode) !== key) {
          return false;
        }
        return !isTechMode || isOwnedByCurrentTechnician(item, this.data.currentUser);
      });
      return {
        id: existing && existing.id ? existing.id : buildPartRecordId(),
        partType,
        partTypeLabel: getPartTypeLabel(partType),
        partCode: partMeta.code,
        partLabel: partMeta.label,
        amount: partMeta.amount,
        technicianAccountId,
        technicianAccountName,
        technicianName,
        photos,
        submittedAt: nowText
      };
    }).filter((item) => Boolean(item));

    if (nextRecords.length === 0) {
      wx.showToast({ title: '施工部位无效', icon: 'none' });
      return;
    }

    const patch = {
      status: currentOrder.status === '已取消' ? '已取消' : '未完工',
      workPartRecords: nextRecords.concat(untouchedRecords),
      deliveryStatus: '待交车验收',
      deliveryPassedAt: '',
      commissionStatus: '未生成',
      commissionGeneratedAt: '',
      commissionTotal: 0,
      commissionRecords: []
    };

    const updatedOrder = updateOrder(currentOrder.id, patch);
    if (!updatedOrder) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }

    const normalizedOrder = normalizeOrder(updatedOrder);
    const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
    this.setData({
      order: normalizedOrder,
      hasOrder: true,
      partTechnicianIndex: -1,
      canCompleteOrder: permissionState.canCompleteOrder,
      displayedCommissionRecords: permissionState.displayedCommissionRecords,
      displayedCommissionTotal: permissionState.displayedCommissionTotal,
      partForm: {
        ...this.data.partForm,
        partCodes,
        technicianAccountId: this.data.isTechnicianMode ? technicianAccountId : '',
        technicianAccountName: this.data.isTechnicianMode ? technicianAccountName : '',
        technicianName: this.data.isTechnicianMode ? technicianName : '',
        photos: []
      }
    });

    this.trySyncFinance(normalizedOrder, 'ORDER_WORK_PART_SAVED');
    wx.showToast({
      title: nextRecords.length > 1 ? `已保存 ${nextRecords.length} 个施工部位` : '施工部位记录已保存',
      icon: 'success'
    });
  },

  removeWorkPartRecord(event) {
    if (!this.data.hasOrder) {
      return;
    }

    const recordId = String(event.currentTarget.dataset.id || '').trim();
    if (!recordId) {
      return;
    }

    const order = normalizeOrder(this.data.order);
    const targetRecord = Array.isArray(order.workPartRecords)
      ? order.workPartRecords.find((item) => item.id === recordId)
      : null;
    if (!this.data.isManagerMode && !isOwnedByCurrentTechnician(targetRecord, this.data.currentUser)) {
      wx.showToast({ title: '仅可删除自己的施工记录', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '删除该施工记录？',
      content: '删除后该部位不会参与提成计算。',
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        const records = order.workPartRecords.filter((item) => item.id !== recordId);
        const patch = {
          status: order.status === '已取消' ? '已取消' : '未完工',
          workPartRecords: records,
          deliveryStatus: '待交车验收',
          deliveryPassedAt: '',
          commissionStatus: '未生成',
          commissionGeneratedAt: '',
          commissionTotal: 0,
          commissionRecords: []
        };

        const updatedOrder = updateOrder(order.id, patch);
        if (!updatedOrder) {
          wx.showToast({ title: '删除失败', icon: 'none' });
          return;
        }

        const normalizedOrder = normalizeOrder(updatedOrder);
        const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
        this.setData({
          order: normalizedOrder,
          hasOrder: true,
          canCompleteOrder: permissionState.canCompleteOrder,
          displayedCommissionRecords: permissionState.displayedCommissionRecords,
          displayedCommissionTotal: permissionState.displayedCommissionTotal
        });

        this.trySyncFinance(normalizedOrder, 'ORDER_WORK_PART_REMOVED');
        wx.showToast({
          title: '已删除',
          icon: 'success'
        });
      }
    });
  },

  confirmDeliveryAndGenerate() {
    if (!this.data.hasOrder || this.data.generatingCommission) {
      return;
    }
    if (!this.data.isManagerMode) {
      wx.showToast({ title: '仅最高权限可生成提成', icon: 'none' });
      return;
    }

    const order = normalizeOrder(this.data.order);
    if (!order) {
      return;
    }

    if (order.status === '已取消') {
      wx.showToast({ title: '已取消订单不能生成提成', icon: 'none' });
      return;
    }

    const records = dedupeWorkPartRecords(order.workPartRecords);
    if (records.length === 0) {
      wx.showToast({ title: '请先提交施工部位记录', icon: 'none' });
      return;
    }

    const commissionRecords = records.map((item) => {
      const technicianAccountId = item.technicianAccountId || getTechnicianAccountIdByName(item.technicianName);
      const technicianName = getTechnicianDisplayName(technicianAccountId, item.technicianName || item.technicianAccountName);
      return {
        id: item.id,
        partType: item.partType,
        partTypeLabel: item.partTypeLabel || getPartTypeLabel(item.partType),
        partCode: item.partCode,
        partLabel: item.partLabel,
        technicianAccountId,
        technicianAccountName: technicianName,
        technicianName,
        amount: getPartAmount(item.partType, item.partCode),
        submittedAt: item.submittedAt || '',
        photos: sanitizePhotos(item.photos)
      };
    }).filter((item) => item.amount > 0 && item.technicianAccountId);

    if (commissionRecords.length === 0) {
      wx.showToast({ title: '无有效施工提成记录', icon: 'none' });
      return;
    }

    const nowText = buildTimeText(new Date());
    const total = commissionRecords.reduce((sum, item) => sum + item.amount, 0);
    const patch = {
      status: order.status === '已取消' ? '已取消' : (order.status === '已完工' ? '已完工' : '未完工'),
      workPartRecords: records,
      deliveryStatus: '交车通过',
      deliveryPassedAt: nowText,
      commissionStatus: '已生成',
      commissionGeneratedAt: nowText,
      commissionTotal: total,
      commissionRecords
    };

    this.setData({
      generatingCommission: true
    });

    const updatedOrder = updateOrder(order.id, patch);
    if (!updatedOrder) {
      this.setData({
        generatingCommission: false
      });
      wx.showToast({ title: '生成失败', icon: 'none' });
      return;
    }

    const normalizedOrder = normalizeOrder(updatedOrder);
    const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
    this.setData({
      order: normalizedOrder,
      hasOrder: true,
      generatingCommission: false,
      canCompleteOrder: permissionState.canCompleteOrder,
      displayedCommissionRecords: permissionState.displayedCommissionRecords,
      displayedCommissionTotal: permissionState.displayedCommissionTotal
    });

    this.trySyncFinance(normalizedOrder, 'ORDER_DELIVERY_CONFIRMED');
    wx.showToast({
      title: order.commissionStatus === '已生成' ? '提成已重新生成' : '交车通过，提成已生成',
      icon: 'success'
    });
  },

  confirmOrderCompleted() {
    if (!this.data.hasOrder) {
      return;
    }
    if (!this.data.isManagerMode) {
      wx.showToast({ title: '仅最高权限可确认完工', icon: 'none' });
      return;
    }

    const order = normalizeOrder(this.data.order);
    if (!order || order.status === '已取消') {
      wx.showToast({ title: '已取消订单不能完工', icon: 'none' });
      return;
    }
    if (!canConfirmOrderCompleted(order)) {
      wx.showToast({ title: '请先上传尾款凭证', icon: 'none' });
      return;
    }
    if (order.status === '已完工') {
      wx.showToast({ title: '订单已完工', icon: 'none' });
      return;
    }

    const updatedOrder = updateOrder(order.id, {
      status: '已完工'
    });
    if (!updatedOrder) {
      wx.showToast({ title: '完工失败', icon: 'none' });
      return;
    }

    const normalizedOrder = normalizeOrder(updatedOrder);
    const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);
    this.setData({
      order: normalizedOrder,
      hasOrder: true,
      canCompleteOrder: permissionState.canCompleteOrder,
      displayedCommissionRecords: permissionState.displayedCommissionRecords,
      displayedCommissionTotal: permissionState.displayedCommissionTotal
    });
    this.trySyncFinance(normalizedOrder, 'ORDER_COMPLETED');
    wx.showToast({ title: '已确认完工', icon: 'success' });
  },

  createNewOrder() {
    wx.navigateTo({
      url: '/pages/film-order/film-order'
    });
  },

  editOrder() {
    if (!this.data.isManagerMode) {
      wx.showToast({ title: '仅最高权限可编辑订单', icon: 'none' });
      return;
    }
    if (!this.data.hasOrder) {
      return;
    }

    wx.navigateTo({
      url: `/pages/order-edit/order-edit?id=${this.data.order.id}`
    });
  },

  syncFinanceNow() {
    if (!this.data.isManagerMode) {
      wx.showToast({ title: '仅最高权限可同步财务', icon: 'none' });
      return;
    }
    if (!this.data.hasOrder) {
      return;
    }

    this.trySyncFinance(this.data.order, 'MANUAL_RETRY', true);
  },

  trySyncFinance(order, eventType, showToast) {
    if (!order || !order.id || this.data.financeSyncLoading) {
      return;
    }

    this.setData({
      financeSyncLoading: true
    });

    syncOrderToFinance({
      order,
      eventType,
      source: 'MINIPROGRAM_ORDER_DETAIL'
    }).then((result) => {
      const patch = buildFinancePatch(result, eventType);
      const updatedOrder = updateOrder(order.id, patch);
      const normalizedOrder = normalizeOrder(updatedOrder || this.data.order);
      const permissionState = buildOrderPermissionState(normalizedOrder, this.data.currentUser);

      this.setData({
        order: normalizedOrder,
        canCompleteOrder: permissionState.canCompleteOrder,
        displayedCommissionRecords: permissionState.displayedCommissionRecords,
        displayedCommissionTotal: permissionState.displayedCommissionTotal
      });

      if (showToast) {
        wx.showToast({
          title: getFinanceToastText(result),
          icon: result.ok ? 'success' : 'none'
        });
      }
    }).finally(() => {
      this.setData({
        financeSyncLoading: false
      });
    });
  },

  syncPartPicker(partType, partCodes) {
    const safePartType = getSafePartType(partType);
    const basePartOptions = getPartOptions(safePartType);
    const partTypeIndex = Math.max(0, PART_TYPE_OPTIONS.findIndex((item) => item.value === safePartType));
    const validCodeSet = new Set(basePartOptions.map((item) => item.code));
    const normalizedPartCodes = sanitizeStringList(partCodes).filter((code) => validCodeSet.has(code));
    const defaultCodes = normalizedPartCodes.length > 0
      ? normalizedPartCodes
      : (basePartOptions[0] ? [basePartOptions[0].code] : []);
    const partOptions = basePartOptions.map((item) => ({
      ...item,
      checked: defaultCodes.indexOf(item.code) >= 0
    }));

    this.setData({
      partTypeIndex,
      partOptions,
      'partForm.partType': safePartType,
      'partForm.partCodes': defaultCodes
    });
  }
});

function normalizePriceSummary(priceSummary) {
  const summary = priceSummary || {};
  const packagePrice = toNumber(summary.packagePrice, toNumber(summary.brandPrice, 0));
  const addOnFee = toNumber(summary.addOnFee, 0);
  const totalPrice = toNumber(summary.totalPrice, packagePrice + addOnFee);
  const deposit = toNumber(summary.deposit, Math.round(totalPrice * 0.1));

  return {
    packagePrice,
    addOnFee,
    totalPrice,
    deposit
  };
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function getFinanceToastText(result) {
  if (result.ok) {
    return '财务同步成功';
  }

  if (result.skipped) {
    return '财务同步未启用';
  }

  return '财务同步失败';
}

function buildTimeText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function buildPartRecordId() {
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `WPR${Date.now()}${random}`;
}

function getSafePartType(value) {
  const matched = PART_TYPE_OPTIONS.find((item) => item.value === value);
  return matched ? matched.value : PART_TYPE_OPTIONS[0].value;
}

function getPartTypeLabel(value) {
  const matched = PART_TYPE_OPTIONS.find((item) => item.value === value);
  return matched ? matched.label : PART_TYPE_OPTIONS[0].label;
}

function getPartOptions(partType) {
  const safeType = getSafePartType(partType);
  return Array.isArray(PART_RULES[safeType]) ? PART_RULES[safeType] : [];
}

function findPartMeta(partType, partCode) {
  const options = getPartOptions(partType);
  return options.find((item) => item.code === partCode) || null;
}

function getPartAmount(partType, partCode) {
  const matched = findPartMeta(partType, partCode);
  return matched ? toNumber(matched.amount, 0) : 0;
}

function getTechnicianAccountIdByName(name) {
  const matched = findTechnicianAccountByName(name);
  return matched ? matched.id : '';
}

function getTechnicianDisplayName(accountId, fallbackName) {
  const matchedById = findTechnicianAccountById(accountId);
  if (matchedById) {
    return matchedById.name;
  }
  const matchedByName = findTechnicianAccountByName(fallbackName);
  if (matchedByName) {
    return matchedByName.name;
  }
  return normalizeText(fallbackName);
}

function getActiveTechnicianProfile(userContext) {
  if (!isTechnicianContext(userContext)) {
    return null;
  }

  const accountId = normalizeText(userContext && userContext.accountId);
  if (!accountId) {
    return null;
  }

  const matched = findTechnicianAccountById(accountId);
  if (matched) {
    return {
      id: matched.id,
      name: matched.name
    };
  }

  const fallbackName = normalizeText(userContext && userContext.accountName);
  if (!fallbackName) {
    return null;
  }

  return {
    id: accountId,
    name: fallbackName
  };
}

function isOwnedByCurrentTechnician(record, userContext) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  if (isManagerContext(userContext)) {
    return true;
  }
  if (!isTechnicianContext(userContext)) {
    return false;
  }

  const userAccountId = normalizeText(userContext && userContext.accountId);
  const userName = normalizeText(userContext && userContext.accountName);
  const recordAccountId = normalizeText(record.technicianAccountId);
  const recordName = normalizeText(record.technicianName || record.technicianAccountName);
  if (userAccountId && recordAccountId && userAccountId === recordAccountId) {
    return true;
  }
  return Boolean(userName && recordName && userName === recordName);
}

function canConfirmOrderCompleted(order) {
  if (!order || typeof order !== 'object' || order.status === '已取消') {
    return false;
  }
  return Array.isArray(order.finalPaymentPhotos) && order.finalPaymentPhotos.length > 0 && order.status !== '已完工';
}

function buildOrderPermissionState(order, userContext) {
  const isManagerMode = isManagerContext(userContext);
  const isTechnicianMode = isTechnicianContext(userContext);
  const normalized = normalizeOrder(order);
  const commissionRecords = normalized ? normalizeCommissionRecords(normalized.commissionRecords) : [];
  const displayedCommissionRecords = isTechnicianMode
    ? commissionRecords.filter((item) => isOwnedByCurrentTechnician(item, userContext))
    : commissionRecords;
  const displayedCommissionTotal = displayedCommissionRecords.reduce((sum, item) => sum + toNumber(item.amount, 0), 0);

  return {
    isManagerMode,
    isTechnicianMode,
    canSubmitWorkPart: isManagerMode || isTechnicianMode,
    canCompleteOrder: isManagerMode && canConfirmOrderCompleted(normalized),
    displayedCommissionRecords,
    displayedCommissionTotal
  };
}

function sanitizePhotos(photos) {
  if (!Array.isArray(photos)) {
    return [];
  }

  return photos
    .map((item) => String(item || '').trim())
    .filter((item) => item);
}

function sanitizeSinglePhoto(photo) {
  if (typeof photo !== 'string') {
    return '';
  }
  return photo.trim();
}

function normalizeWorkPartRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((item) => {
    const safePartType = getSafePartType(item && item.partType);
    const safePartCode = item && item.partCode ? String(item.partCode) : '';
    const partMeta = findPartMeta(safePartType, safePartCode);
    const label = partMeta ? partMeta.label : (item && item.partLabel ? String(item.partLabel) : '');
    const amount = partMeta ? partMeta.amount : toNumber(item && item.amount, 0);
    const technicianName = normalizeText(item && item.technicianName);
    const technicianAccountId = normalizeText(item && item.technicianAccountId) || getTechnicianAccountIdByName(technicianName);
    const technicianAccountName = getTechnicianDisplayName(
      technicianAccountId,
      item && item.technicianAccountName ? String(item.technicianAccountName) : technicianName
    );
    const normalizedTechnicianName = technicianAccountName || technicianName;

    return {
      id: item && item.id ? String(item.id) : buildPartRecordId(),
      partType: safePartType,
      partTypeLabel: getPartTypeLabel(safePartType),
      partCode: partMeta ? partMeta.code : safePartCode,
      partLabel: label,
      amount,
      technicianAccountId,
      technicianAccountName,
      technicianName: normalizedTechnicianName,
      photos: sanitizePhotos(item && item.photos),
      submittedAt: item && item.submittedAt ? String(item.submittedAt) : ''
    };
  }).filter((item) => item.partCode && item.partLabel);
}

function dedupeWorkPartRecords(records) {
  const normalized = normalizeWorkPartRecords(records);
  const map = {};
  normalized.forEach((item) => {
    map[buildPartKey(item.partType, item.partCode)] = item;
  });

  return Object.keys(map).map((key) => map[key]);
}

function normalizeCommissionRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((item) => {
    const safePartType = getSafePartType(item && item.partType);
    const safePartCode = item && item.partCode ? String(item.partCode) : '';
    const partMeta = findPartMeta(safePartType, safePartCode);
    const technicianName = normalizeText(item && item.technicianName);
    const technicianAccountId = normalizeText(item && item.technicianAccountId) || getTechnicianAccountIdByName(technicianName);
    const technicianAccountName = getTechnicianDisplayName(
      technicianAccountId,
      item && item.technicianAccountName ? String(item.technicianAccountName) : technicianName
    );
    const normalizedTechnicianName = technicianAccountName || technicianName;

    return {
      id: item && item.id ? String(item.id) : buildPartRecordId(),
      partType: safePartType,
      partTypeLabel: getPartTypeLabel(safePartType),
      partCode: partMeta ? partMeta.code : safePartCode,
      partLabel: partMeta ? partMeta.label : (item && item.partLabel ? String(item.partLabel) : ''),
      technicianAccountId,
      technicianAccountName,
      technicianName: normalizedTechnicianName,
      amount: toNumber(item && item.amount, partMeta ? partMeta.amount : 0),
      submittedAt: item && item.submittedAt ? String(item.submittedAt) : '',
      photos: sanitizePhotos(item && item.photos)
    };
  }).filter((item) => item.partCode || item.partLabel);
}

function buildPartKey(partType, partCode) {
  return `${getSafePartType(partType)}::${String(partCode || '')}`;
}

function getDispatchState(order, workBayOptions, technicianOptions) {
  const options = Array.isArray(workBayOptions) && workBayOptions.length > 0
    ? workBayOptions
    : ['1号工位'];
  const technicians = Array.isArray(technicianOptions) && technicianOptions.length > 0
    ? technicianOptions
    : [];
  const dispatch = normalizeDispatchInfo(order && order.dispatchInfo);
  const fallbackDate = order && order.appointmentDate ? String(order.appointmentDate) : '';
  const fallbackTime = order && order.appointmentTime ? String(order.appointmentTime) : '10:00';
  const workBay = dispatch.workBay && options.indexOf(dispatch.workBay) >= 0
    ? dispatch.workBay
    : options[0];
  const bayIndex = Math.max(0, options.indexOf(workBay));
  const technicianNames = dispatch.technicianNames.filter((name) => technicians.indexOf(name) >= 0);

  return {
    bayIndex,
    form: {
      date: dispatch.date || fallbackDate,
      time: dispatch.time || fallbackTime,
      workBay,
      technicianNames,
      remark: dispatch.remark || ''
    }
  };
}

function normalizeDispatchInfo(dispatchInfo) {
  const raw = dispatchInfo && typeof dispatchInfo === 'object' ? dispatchInfo : {};
  const date = normalizeDateText(raw.date);
  const time = normalizeTimeText(raw.time);
  const workBay = normalizeText(raw.workBay);
  const technicianNames = normalizeTechnicianNames(
    Array.isArray(raw.technicianNames) && raw.technicianNames.length > 0
      ? raw.technicianNames
      : raw.technicianName
  );
  const technicianName = technicianNames[0] || '';
  const remark = normalizeText(raw.remark);
  const updatedAt = normalizeText(raw.updatedAt);

  return {
    date,
    time,
    workBay,
    technicianName,
    technicianNames,
    technicianDisplay: technicianNames.length > 0 ? technicianNames.join(' / ') : '',
    remark,
    updatedAt
  };
}

function validateDispatchInfo(dispatch) {
  if (!dispatch.date) {
    return '请选择派工日期';
  }
  if (!dispatch.time) {
    return '请选择派工时间';
  }
  if (!dispatch.workBay) {
    return '请选择工位';
  }
  if (!Array.isArray(dispatch.technicianNames) || dispatch.technicianNames.length === 0) {
    return '请选择派工技师';
  }
  return '';
}

function findDispatchConflict(orderId, dispatch, orders) {
  const list = Array.isArray(orders) ? orders : [];
  const targetDate = dispatch.date;
  const targetTime = dispatch.time;
  const targetBay = dispatch.workBay;
  const targetTechnicians = Array.isArray(dispatch.technicianNames) ? dispatch.technicianNames : [];

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item || item.id === orderId || item.status === '已取消') {
      continue;
    }

    const itemDispatch = getOrderDispatchSnapshot(item);
    if (!itemDispatch.date || !itemDispatch.time) {
      continue;
    }
    if (itemDispatch.date !== targetDate) {
      continue;
    }

    if (targetBay && itemDispatch.workBay && itemDispatch.workBay === targetBay) {
      return `同日期同工位冲突：${item.id}（${item.customerName || '未知客户'}）`;
    }

    if (
      targetTime
      && itemDispatch.time === targetTime
      && targetTechnicians.length > 0
      && itemDispatch.technicianNames.length > 0
      && hasIntersection(targetTechnicians, itemDispatch.technicianNames)
    ) {
      return `同时间同技师冲突：${item.id}（${item.customerName || '未知客户'}）`;
    }
  }

  return '';
}

function findDailyCapacityConflict(orderId, order, dispatch, orders, limit) {
  const capacityStatus = getDailyCapacityStatus({
    orders,
    date: dispatch && dispatch.date,
    store: order && order.store,
    excludeOrderId: orderId,
    limit
  });
  const wasScheduledOnTarget = isOrderScheduledOn(order, dispatch && dispatch.date, order && order.store);

  if (capacityStatus.full && !wasScheduledOnTarget) {
    return getDailyCapacityMessage(capacityStatus);
  }

  return '';
}

function getOrderDispatchSnapshot(order) {
  const dispatch = order && order.dispatchInfo && typeof order.dispatchInfo === 'object'
    ? order.dispatchInfo
    : {};
  const date = normalizeDateText(dispatch.date || (order && order.appointmentDate));
  const time = normalizeTimeText(dispatch.time || (order && order.appointmentTime));
  const workBay = normalizeText(dispatch.workBay);
  const technicianNames = normalizeTechnicianNames(
    Array.isArray(dispatch.technicianNames) && dispatch.technicianNames.length > 0
      ? dispatch.technicianNames
      : dispatch.technicianName
  );
  const technicianName = technicianNames[0] || '';

  return {
    date,
    time,
    workBay,
    technicianName,
    technicianNames
  };
}

function normalizeDateText(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeTimeText(value) {
  const text = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : '';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function sanitizeStringList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => normalizeText(item))
    .filter((item) => item);
}

function normalizeTechnicianNames(value) {
  if (Array.isArray(value)) {
    return sanitizeStringList(value);
  }

  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  return text
    .split(/[、/,，\s]+/)
    .map((item) => normalizeText(item))
    .filter((item) => item);
}

function hasIntersection(sourceA, sourceB) {
  const set = new Set(Array.isArray(sourceA) ? sourceA : []);
  const list = Array.isArray(sourceB) ? sourceB : [];
  for (let i = 0; i < list.length; i += 1) {
    if (set.has(list[i])) {
      return true;
    }
  }
  return false;
}

function buildTechnicianCheckOptions(selectedNames, technicianOptions) {
  const selectedSet = new Set(sanitizeStringList(selectedNames));
  const source = Array.isArray(technicianOptions) ? technicianOptions : [];
  return source.map((name) => ({
    name,
    checked: selectedSet.has(name)
  }));
}

function normalizeOrder(order) {
  if (!order || typeof order !== 'object') {
    return null;
  }

  return {
    ...order,
    workPartRecords: dedupeWorkPartRecords(order.workPartRecords),
    commissionRecords: normalizeCommissionRecords(order.commissionRecords),
    vinPhoto: sanitizeSinglePhoto(order.vinPhoto),
    constructionPhotos: sanitizePhotos(order.constructionPhotos),
    damagePhotos: sanitizePhotos(order.damagePhotos),
    dispatchInfo: normalizeDispatchInfo(order.dispatchInfo),
    deliveryStatus: order.deliveryStatus || '待交车验收',
    deliveryPassedAt: order.deliveryPassedAt || '',
    commissionStatus: order.commissionStatus || '未生成',
    commissionGeneratedAt: order.commissionGeneratedAt || '',
    commissionTotal: toNumber(order.commissionTotal, 0),
    depositProofPhotos: sanitizePhotos(order.depositProofPhotos),
    finalPaymentPhotos: sanitizePhotos(order.finalPaymentPhotos),
    finalPaymentUploadedAt: order.finalPaymentUploadedAt || ''
  };
}
