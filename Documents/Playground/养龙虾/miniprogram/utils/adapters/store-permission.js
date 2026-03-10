function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase()
  if (!role) {
    return 'sales'
  }
  return role
}

function getCurrentRole() {
  return normalizeRole(wx.getStorageSync('mini_role') || wx.getStorageSync('user_role') || 'sales')
}

function canAccessStoreOps(role) {
  const target = normalizeRole(role)
  return ['manager', 'sales', 'finance', 'technician'].includes(target)
}

function canBatchEditOrderRole(role) {
  const target = normalizeRole(role)
  return target === 'manager' || target === 'sales'
}

function canUseMineOrderView(role) {
  const target = normalizeRole(role)
  return target === 'sales' || target === 'technician'
}

function isOrderOwner(order, salesName) {
  const owner = String((order && order.salesBrandText) || '').trim().toLowerCase()
  const me = String(salesName || '').trim().toLowerCase()
  return !!me && owner === me
}

function canEditOrder(role, order, options = {}) {
  const target = normalizeRole(role)
  if (target === 'manager') {
    return true
  }
  if (target === 'sales') {
    const salesName = String(options.salesName || wx.getStorageSync('sales_name') || '')
    return isOrderOwner(order, salesName)
  }
  return false
}

module.exports = {
  normalizeRole,
  getCurrentRole,
  canAccessStoreOps,
  canBatchEditOrderRole,
  canUseMineOrderView,
  canEditOrder,
  isOrderOwner,
}
