const { storeApi } = require('../../../../utils/adapters/store-api')
const { getCurrentRole, canEditOrder: canEditOrderByRole } = require('../../../../utils/adapters/store-permission')
const { normalizeErrorMessage, isVersionConflictError } = require('../../../../utils/adapters/store-error')
const { storeAuditApi } = require('../../../../utils/adapters/store-audit')

Page({
  data: {
    orderId: '',
    role: 'sales',
    canEdit: false,
    loading: false,
    saving: false,
    errorText: '',
    order: null,
    editStatusOptions: ['未完工', '已完工', '已取消'],
    editStatusIndex: 0,
    editRemark: '',
  },

  onLoad(options) {
    const role = getCurrentRole()
    this.setData({ orderId: options.id || '', role })
  },

  onShow() {
    if (!this.data.orderId) {
      this.setData({ errorText: '缺少订单ID' })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ loading: true, errorText: '' })
    try {
      const order = await storeApi.getOrderDetail(this.data.orderId, { role: this.data.role })
      const statusIndex = this.data.editStatusOptions.indexOf(order.status)
      this.setData({
        order,
        canEdit: this.canEditOrder(order),
        editStatusIndex: statusIndex >= 0 ? statusIndex : 0,
        editRemark: order.remark || '',
      })
    } catch (error) {
      this.setData({
        errorText: error.message || '详情加载失败',
        order: null,
      })
    }
    this.setData({ loading: false })
  },

  copyOrderId() {
    if (!this.data.order || !this.data.order.id) {
      return
    }
    wx.setClipboardData({ data: this.data.order.id })
  },

  canEditOrder(order) {
    return canEditOrderByRole(this.data.role, order)
  },

  onEditStatusChange(e) {
    this.setData({ editStatusIndex: Number(e.detail.value || 0) })
  },

  onEditRemarkInput(e) {
    this.setData({ editRemark: e.detail.value || '' })
  },

  normalizeSaveError(error) {
    if (isVersionConflictError(error)) {
      return {
        text: normalizeErrorMessage(error, '订单已被他人更新，请先刷新后重试'),
        suggestRefresh: true,
      }
    }
    return {
      text: normalizeErrorMessage(error, '保存失败'),
      suggestRefresh: false,
    }
  },

  handleSaveError(error) {
    const result = this.normalizeSaveError(error)
    if (!result.suggestRefresh) {
      wx.showToast({ title: result.text, icon: 'none' })
      return
    }

    wx.showModal({
      title: '保存失败',
      content: `${result.text}\n建议先刷新订单后再保存。`,
      confirmText: '刷新订单',
      cancelText: '稍后再试',
      success: (res) => {
        if (res.confirm) {
          this.loadDetail()
        }
      }
    })
  },

  async saveOrderUpdate() {
    if (!this.data.canEdit || !this.data.order) {
      wx.showToast({ title: '当前角色不可编辑', icon: 'none' })
      return
    }
    if (this.data.saving) {
      return
    }

    const targetStatus = this.data.editStatusOptions[this.data.editStatusIndex] || '未完工'
    const targetRemark = String(this.data.editRemark || '').trim()
    const currentStatus = this.data.order.status || ''
    const currentRemark = String(this.data.order.remark || '').trim()
    if (targetStatus === currentStatus && targetRemark === currentRemark) {
      wx.showToast({ title: '暂无变更', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const updated = await storeApi.updateOrder(this.data.order.id, {
        version: this.data.order.version,
        status: targetStatus,
        remark: targetRemark,
      })

      storeAuditApi.logOrderOperation({
        target_id: this.data.order.id,
        action: 'detail_save_update',
        result: 'success',
        before_status: currentStatus,
        after_status: targetStatus,
        source: 'order-detail',
        metadata: {
          remark_changed: targetRemark !== currentRemark,
        },
      })

      const statusIndex = this.data.editStatusOptions.indexOf(updated.status)
      this.setData({
        order: updated,
        canEdit: this.canEditOrder(updated),
        editStatusIndex: statusIndex >= 0 ? statusIndex : 0,
        editRemark: updated.remark || '',
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (error) {
      storeAuditApi.logOrderOperation({
        target_id: this.data.order.id,
        action: 'detail_save_update',
        result: 'failed',
        before_status: currentStatus,
        after_status: targetStatus,
        error_code: String((error && error.code) || ''),
        error_message: normalizeErrorMessage(error, '保存失败'),
        source: 'order-detail',
        metadata: {
          remark_changed: targetRemark !== currentRemark,
        },
      })
      this.handleSaveError(error)
    }
    this.setData({ saving: false })
  }
})
