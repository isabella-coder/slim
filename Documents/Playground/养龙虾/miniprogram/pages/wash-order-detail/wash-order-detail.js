const { getOrderById, syncOrdersNow, updateOrder, updateOrderStatus } = require('../../utils/order');
const { syncOrderToFinance } = require('../../utils/finance-sync');
const { ensureMiniSessionOrNavigate } = require('../../utils/page-access');

Page({
  data: {
    orderId: '',
    order: null,
    hasOrder: false,
    financeSyncLoading: false
  },

  onLoad(options) {
    if (!this.ensureLoggedInSession()) {
      return;
    }

    const orderId = options && options.id ? String(options.id) : '';
    this.setData({ orderId });
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

    if (!this.data.orderId) {
      return;
    }
    syncOrdersNow()
      .catch(() => {})
      .finally(() => {
        this.loadOrder(this.data.orderId);
      });
  },

  loadOrder(orderId) {
    const order = getOrderById(orderId);
    if (!order || order.serviceType !== 'WASH') {
      this.setData({
        hasOrder: false,
        order: null
      });
      return;
    }

    this.setData({
      hasOrder: true,
      order: normalizeOrder(order)
    });
  },

  ensureLoggedInSession() {
    return ensureMiniSessionOrNavigate();
  },

  previewConstructionPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = this.data.order && Array.isArray(this.data.order.constructionPhotos)
      ? this.data.order.constructionPhotos
      : [];
    const current = photos[index] || '';
    if (!current) {
      return;
    }

    wx.previewImage({
      current,
      urls: photos
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
        this.setData({
          order: normalizedOrder,
          hasOrder: true
        });
        this.trySyncFinance(normalizedOrder, 'ORDER_COMPLETION_PHOTOS_UPDATED');
      }
    });
  },

  removeConstructionPhoto(event) {
    if (!this.data.hasOrder) {
      return;
    }

    const index = Number(event.currentTarget.dataset.index);
    const order = normalizeOrder(this.data.order);
    const photos = Array.isArray(order.constructionPhotos) ? order.constructionPhotos.slice() : [];
    if (index < 0 || index >= photos.length) {
      return;
    }

    photos.splice(index, 1);
    const updatedOrder = updateOrder(order.id, {
      constructionPhotos: photos
    });
    if (!updatedOrder) {
      wx.showToast({ title: '删除失败', icon: 'none' });
      return;
    }

    const normalizedOrder = normalizeOrder(updatedOrder);
    this.setData({
      order: normalizedOrder,
      hasOrder: true
    });
    this.trySyncFinance(normalizedOrder, 'ORDER_COMPLETION_PHOTOS_UPDATED');
  },

  editOrder() {
    if (!this.ensureLoggedInSession()) {
      return;
    }
    if (!this.data.hasOrder) {
      return;
    }

    wx.navigateTo({
      url: `/pages/wash-order/wash-order?id=${this.data.order.id}`
    });
  },

  cancelOrder() {
    if (!this.ensureLoggedInSession()) {
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
      title: '确认取消洗车订单吗？',
      content: '取消后需要重新下单。',
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
        this.setData({
          order: normalizedOrder,
          hasOrder: true
        });
        this.trySyncFinance(normalizedOrder, 'ORDER_CANCELLED');
      }
    });
  },

  goOrderList() {
    wx.navigateTo({
      url: '/pages/order-list/order-list'
    });
  },

  goWashDispatchBoard() {
    wx.navigateTo({
      url: '/pages/wash-dispatch-board/wash-dispatch-board'
    });
  },

  syncFinanceNow() {
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
      source: 'MINIPROGRAM_WASH_DETAIL'
    }).then((result) => {
      const patch = buildFinancePatch(result, eventType);
      const updatedOrder = updateOrder(order.id, patch);
      const normalizedOrder = normalizeOrder(updatedOrder || this.data.order);
      this.setData({
        order: normalizedOrder,
        hasOrder: true
      });

      if (showToast) {
        wx.showToast({
          title: result.ok ? '财务同步成功' : (result.skipped ? '财务同步未启用' : '财务同步失败'),
          icon: result.ok ? 'success' : 'none'
        });
      }
    }).finally(() => {
      this.setData({
        financeSyncLoading: false
      });
    });
  }
});

function normalizeOrder(order) {
  if (!order || typeof order !== 'object') {
    return null;
  }

  const summary = order.priceSummary && typeof order.priceSummary === 'object'
    ? order.priceSummary
    : {};

  return {
    ...order,
    constructionPhotos: sanitizePhotos(order.constructionPhotos),
    priceSummary: {
      packagePrice: toNumber(summary.packagePrice, toNumber(summary.totalPrice, 0)),
      addOnFee: toNumber(summary.addOnFee, 0),
      totalPrice: toNumber(summary.totalPrice, 0),
      deposit: toNumber(summary.deposit, 0)
    },
    commissionTotal: toNumber(order.commissionTotal, 0)
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

function buildTimeText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
