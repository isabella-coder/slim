const { getFinanceConfig } = require('../config/finance.config');

function syncOrderToFinance(params) {
  const payloadParams = params || {};
  const order = payloadParams.order;
  const eventType = payloadParams.eventType || 'ORDER_UPDATED';
  const source = payloadParams.source || 'MINIPROGRAM';

  if (!order || !order.id) {
    return Promise.resolve({
      ok: false,
      skipped: true,
      message: '订单信息为空，无法同步'
    });
  }

  const config = getFinanceConfig();

  if (!config.enabled) {
    return Promise.resolve({
      ok: false,
      skipped: true,
      message: '财务同步未启用'
    });
  }

  if (!config.baseUrl) {
    return Promise.resolve({
      ok: false,
      skipped: true,
      message: '财务系统地址未配置'
    });
  }

  if (config.mockMode) {
    return Promise.resolve({
      ok: true,
      message: 'Mock 同步成功',
      externalId: `MOCK-${order.id}`
    });
  }

  const url = buildUrl(config.baseUrl, config.syncPath);
  const requestPayload = buildSyncPayload(order, eventType, source);
  const idempotencyKey = buildIdempotencyKey(order, eventType);

  return requestJSON({
    url,
    data: requestPayload,
    timeout: config.timeout,
    idempotencyKey,
    apiToken: config.apiToken,
    extraHeaders: config.extraHeaders
  });
}

function buildSyncPayload(order, eventType, source) {
  return {
    eventType,
    source,
    syncedAt: new Date().toISOString(),
    order: {
      id: order.id,
      serviceType: order.serviceType || 'FILM',
      serviceTypeLabel: order.serviceTypeLabel || (order.serviceType === 'WASH' ? '洗车' : '贴膜'),
      status: order.status,
      customerName: order.customerName,
      phone: order.phone,
      carModel: order.carModel,
      plateNumber: order.plateNumber || '',
      vinPhoto: getSinglePhoto(order.vinPhoto),
      sourceChannel: order.sourceChannel || '',
      store: order.store,
      salesOwner: order.salesBrandText || '',
      packageModel: order.packageLabel || '',
      packageArea: order.packageDesc || '',
      packageCodes: getPackageCodes(order),
      packageItems: getPackageItems(order),
      appointmentDate: order.appointmentDate || '',
      appointmentTime: order.appointmentTime || '',
      dispatchInfo: getDispatchInfo(order.dispatchInfo),
      depositAmount: toNumberValue(order.depositAmount || getNumeric(order.priceSummary, 'deposit')),
      depositProofPhotos: getPhotoList(order.depositProofPhotos),
      finalPaymentPhotos: getPhotoList(order.finalPaymentPhotos),
      finalPaymentUploadedAt: order.finalPaymentUploadedAt || '',
      technicianName: order.technicianName || '',
      constructionPhotos: Array.isArray(order.constructionPhotos) ? order.constructionPhotos : [],
      damagePhotos: Array.isArray(order.damagePhotos) ? order.damagePhotos : [],
      workPartRecords: getWorkPartRecords(order),
      deliveryStatus: order.deliveryStatus || '',
      deliveryPassedAt: order.deliveryPassedAt || '',
      commissionStatus: order.commissionStatus || '',
      commissionGeneratedAt: order.commissionGeneratedAt || '',
      commissionTotal: toNumberValue(order.commissionTotal),
      commissionRecords: getCommissionRecords(order),
      followupRecords: getFollowupRecords(order.followupRecords),
      followupLastUpdatedAt: order.followupLastUpdatedAt || '',
      createdAt: order.createdAt,
      updatedAt: order.updatedAt || '',
      remark: order.remark || '',
      priceSummary: {
        packagePrice: getNumeric(order.priceSummary, 'packagePrice'),
        addOnFee: getNumeric(order.priceSummary, 'addOnFee'),
        totalPrice: getNumeric(order.priceSummary, 'totalPrice'),
        deposit: getNumeric(order.priceSummary, 'deposit')
      }
    }
  };
}

function requestJSON(params) {
  return new Promise((resolve) => {
    const headers = {
      'content-type': 'application/json'
    };

    if (params.apiToken) {
      headers.Authorization = `Bearer ${params.apiToken}`;
      headers['X-Api-Token'] = params.apiToken;
    }
    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }

    if (params.extraHeaders && typeof params.extraHeaders === 'object') {
      Object.keys(params.extraHeaders).forEach((key) => {
        headers[key] = params.extraHeaders[key];
      });
    }

    wx.request({
      url: params.url,
      method: 'POST',
      data: params.data,
      header: headers,
      timeout: params.timeout || 10000,
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        const responseData = res.data || {};

        if (!ok) {
          resolve({
            ok: false,
            message: extractErrorMessage(responseData) || `HTTP ${res.statusCode}`,
            statusCode: res.statusCode
          });
          return;
        }

        const business = parseBusinessResult(responseData);
        if (!business.ok) {
          resolve({
            ok: false,
            message: business.message || extractErrorMessage(responseData) || '财务系统返回失败',
            statusCode: res.statusCode
          });
          return;
        }

        resolve({
          ok: true,
          message: business.message || '同步成功',
          externalId: business.externalId || extractExternalId(responseData),
          statusCode: res.statusCode
        });
      },
      fail: (err) => {
        resolve({
          ok: false,
          message: err && err.errMsg ? err.errMsg : '请求失败'
        });
      }
    });
  });
}

function buildIdempotencyKey(order, eventType) {
  const source = order && typeof order === 'object' ? order : {};
  const orderId = String(source.id || '').trim();
  const version = Number.isFinite(Number(source.version)) ? Number(source.version) : 0;
  const updatedAt = String(source.updatedAt || source.createdAt || '').trim();
  const raw = `${eventType || 'ORDER_UPDATED'}:${orderId}:${version}:${updatedAt}`;
  const normalized = raw.replace(/[^a-zA-Z0-9:_-]/g, '_');
  return `finance-sync:${normalized.slice(0, 180)}`;
}

function parseBusinessResult(responseData) {
  const result = {
    ok: true,
    message: '',
    externalId: extractExternalId(responseData)
  };

  if (!responseData || typeof responseData !== 'object') {
    return result;
  }

  if (typeof responseData.success === 'boolean') {
    result.ok = responseData.success;
    result.message = getMessage(responseData);
    return result;
  }

  if (hasOwn(responseData, 'code')) {
    result.ok = isOkCode(responseData.code);
    result.message = getMessage(responseData);
    return result;
  }

  if (responseData.data && typeof responseData.data === 'object') {
    const data = responseData.data;
    if (typeof data.success === 'boolean') {
      result.ok = data.success;
      result.message = getMessage(data) || getMessage(responseData);
      if (!result.externalId) {
        result.externalId = extractExternalId(data);
      }
      return result;
    }

    if (hasOwn(data, 'code')) {
      result.ok = isOkCode(data.code);
      result.message = getMessage(data) || getMessage(responseData);
      if (!result.externalId) {
        result.externalId = extractExternalId(data);
      }
      return result;
    }
  }

  return result;
}

function getMessage(data) {
  if (!data || typeof data !== 'object') {
    return '';
  }

  if (typeof data.message === 'string' && data.message) {
    return data.message;
  }

  if (typeof data.msg === 'string' && data.msg) {
    return data.msg;
  }

  if (typeof data.errMsg === 'string' && data.errMsg) {
    return data.errMsg;
  }

  return '';
}

function isOkCode(code) {
  if (typeof code === 'number') {
    return code === 0 || code === 200;
  }

  const text = String(code || '').trim().toUpperCase();
  return text === '0' || text === '200' || text === 'OK' || text === 'SUCCESS';
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function extractExternalId(responseData) {
  if (!responseData || typeof responseData !== 'object') {
    return '';
  }

  if (typeof responseData.externalId === 'string') {
    return responseData.externalId;
  }

  if (typeof responseData.externalId === 'number') {
    return String(responseData.externalId);
  }

  if (responseData.data && typeof responseData.data.externalId === 'string') {
    return responseData.data.externalId;
  }

  if (responseData.data && typeof responseData.data.externalId === 'number') {
    return String(responseData.data.externalId);
  }

  if (responseData.data && typeof responseData.data.id === 'string') {
    return responseData.data.id;
  }

  if (responseData.data && typeof responseData.data.id === 'number') {
    return String(responseData.data.id);
  }

  return '';
}

function extractErrorMessage(responseData) {
  if (!responseData || typeof responseData !== 'object') {
    return '';
  }

  if (typeof responseData.message === 'string' && responseData.message) {
    return responseData.message;
  }

  if (typeof responseData.msg === 'string' && responseData.msg) {
    return responseData.msg;
  }

  if (typeof responseData.errMsg === 'string' && responseData.errMsg) {
    return responseData.errMsg;
  }

  if (responseData.error && typeof responseData.error.message === 'string') {
    return responseData.error.message;
  }

  return '';
}

function buildUrl(baseUrl, syncPath) {
  const trimmedBase = String(baseUrl || '').replace(/\/+$/, '');
  const fixedPath = String(syncPath || '').startsWith('/') ? syncPath : `/${syncPath || ''}`;
  return `${trimmedBase}${fixedPath}`;
}

function getNumeric(obj, key) {
  if (!obj || typeof obj !== 'object') {
    return 0;
  }

  const num = Number(obj[key]);
  return Number.isFinite(num) ? num : 0;
}

function getPackageCodes(order) {
  if (!order || typeof order !== 'object') {
    return [];
  }

  if (Array.isArray(order.filmPackages) && order.filmPackages.length > 0) {
    return order.filmPackages.map((item) => String(item || '').trim()).filter((item) => item);
  }

  if (typeof order.filmPackage === 'string' && order.filmPackage.trim()) {
    return [order.filmPackage.trim()];
  }

  return [];
}

function getPackageItems(order) {
  if (!order || typeof order !== 'object' || !Array.isArray(order.packageDetails)) {
    return [];
  }

  return order.packageDetails.map((item) => ({
    value: item && item.value ? String(item.value) : '',
    label: item && item.label ? String(item.label) : '',
    desc: item && item.desc ? String(item.desc) : '',
    basePrice: getNumeric(item, 'basePrice')
  })).filter((item) => item.value || item.label);
}

function getWorkPartRecords(order) {
  if (!order || typeof order !== 'object' || !Array.isArray(order.workPartRecords)) {
    return [];
  }

  return order.workPartRecords.map((item) => ({
    id: item && item.id ? String(item.id) : '',
    partType: item && item.partType ? String(item.partType) : '',
    partTypeLabel: item && item.partTypeLabel ? String(item.partTypeLabel) : '',
    partCode: item && item.partCode ? String(item.partCode) : '',
    partLabel: item && item.partLabel ? String(item.partLabel) : '',
    technicianAccountId: item && item.technicianAccountId ? String(item.technicianAccountId) : '',
    technicianAccountName: item && item.technicianAccountName ? String(item.technicianAccountName) : '',
    technicianName: item && item.technicianName ? String(item.technicianName) : '',
    amount: toNumberValue(item && item.amount),
    submittedAt: item && item.submittedAt ? String(item.submittedAt) : '',
    photos: Array.isArray(item && item.photos) ? item.photos : []
  })).filter((item) => item.partCode);
}

function getCommissionRecords(order) {
  if (!order || typeof order !== 'object' || !Array.isArray(order.commissionRecords)) {
    return [];
  }

  return order.commissionRecords.map((item) => ({
    id: item && item.id ? String(item.id) : '',
    partType: item && item.partType ? String(item.partType) : '',
    partTypeLabel: item && item.partTypeLabel ? String(item.partTypeLabel) : '',
    partCode: item && item.partCode ? String(item.partCode) : '',
    partLabel: item && item.partLabel ? String(item.partLabel) : '',
    technicianAccountId: item && item.technicianAccountId ? String(item.technicianAccountId) : '',
    technicianAccountName: item && item.technicianAccountName ? String(item.technicianAccountName) : '',
    technicianName: item && item.technicianName ? String(item.technicianName) : '',
    amount: toNumberValue(item && item.amount),
    submittedAt: item && item.submittedAt ? String(item.submittedAt) : ''
  })).filter((item) => item.partCode || item.partLabel);
}

function toNumberValue(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getPhotoList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item || '').trim()).filter((item) => item);
}

function getSinglePhoto(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function getDispatchInfo(value) {
  if (!value || typeof value !== 'object') {
    return {
      date: '',
      time: '',
      workBay: '',
      technicianName: '',
      remark: '',
      updatedAt: ''
    };
  }

  return {
    date: typeof value.date === 'string' ? value.date : '',
    time: typeof value.time === 'string' ? value.time : '',
    workBay: typeof value.workBay === 'string' ? value.workBay : '',
    technicianName: typeof value.technicianName === 'string' ? value.technicianName : '',
    remark: typeof value.remark === 'string' ? value.remark : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : ''
  };
}

function getFollowupRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((item) => ({
    type: item && item.type ? String(item.type) : '',
    done: Boolean(item && item.done),
    doneAt: item && item.doneAt ? String(item.doneAt) : '',
    remark: item && item.remark ? String(item.remark) : ''
  })).filter((item) => item.type);
}

module.exports = {
  syncOrderToFinance
};
