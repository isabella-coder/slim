const {
  TECHNICIAN_ACCOUNTS,
  SALES_ACCOUNTS,
  FINANCE_ACCOUNTS,
  MANAGER_ACCOUNTS
} = require('./staff-options');

const USER_CONTEXT_KEY = 'currentUserContext';

const DEFAULT_MANAGER = {
  id: 'manager_root',
  name: '管理员'
};

const MANAGER_ACCOUNT = buildAccount(
  MANAGER_ACCOUNTS[0] || DEFAULT_MANAGER,
  'MANAGER'
);

function getAvailableAccounts() {
  const managers = MANAGER_ACCOUNTS.map((item) => buildAccount(item, 'MANAGER'));
  const sales = SALES_ACCOUNTS.map((item) => buildAccount(item, 'SALES'));
  const finance = FINANCE_ACCOUNTS.map((item) => buildAccount(item, 'FINANCE'));
  const technicians = TECHNICIAN_ACCOUNTS.map((item) => ({
    accountId: item.id,
    accountName: item.name,
    role: 'TECHNICIAN',
    roleLabel: getRoleLabel('TECHNICIAN')
  }));

  const managerList = managers.length > 0 ? managers : [MANAGER_ACCOUNT];
  return managerList
    .concat(sales)
    .concat(finance)
    .concat(technicians);
}

function getCurrentUserContext() {
  try {
    const raw = wx.getStorageSync(USER_CONTEXT_KEY);
    return normalizeUserContext(raw);
  } catch (error) {
    return MANAGER_ACCOUNT;
  }
}

function setCurrentUserContextById(accountId) {
  const target = String(accountId || '').trim();
  const accounts = getAvailableAccounts();
  const matched = accounts.find((item) => item.accountId === target);
  const context = matched || MANAGER_ACCOUNT;
  wx.setStorageSync(USER_CONTEXT_KEY, context);
  return context;
}

function isManagerContext(context) {
  return normalizeRole(context && context.role) === 'MANAGER';
}

function isTechnicianContext(context) {
  return normalizeRole(context && context.role) === 'TECHNICIAN';
}

function isSalesContext(context) {
  return normalizeRole(context && context.role) === 'SALES';
}

function isFinanceContext(context) {
  return normalizeRole(context && context.role) === 'FINANCE';
}

function canCreateOrderContext(context) {
  return isManagerContext(context) || isSalesContext(context);
}

function canDispatchOrderContext(context) {
  return isManagerContext(context) || isSalesContext(context);
}

function canViewSalesBoardContext(context) {
  return isManagerContext(context) || isSalesContext(context);
}

function canEditOrderContext(context, order) {
  if (isManagerContext(context)) {
    return true;
  }
  if (!isSalesContext(context)) {
    return false;
  }

  const accountName = String(context && context.accountName ? context.accountName : '').trim().toLowerCase();
  const owner = String(order && order.salesBrandText ? order.salesBrandText : '').trim().toLowerCase();
  if (!accountName || !owner) {
    return false;
  }
  return owner === accountName;
}

function normalizeUserContext(source) {
  const raw = source && typeof source === 'object' ? source : {};
  const accountId = String(raw.accountId || '').trim();
  if (!accountId) {
    return MANAGER_ACCOUNT;
  }

  const matched = getAvailableAccounts().find((item) => item.accountId === accountId);
  return matched || MANAGER_ACCOUNT;
}

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

function getRoleLabel(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'MANAGER') {
    return '最高权限';
  }
  if (normalizedRole === 'SALES') {
    return '销售账号';
  }
  if (normalizedRole === 'FINANCE') {
    return '财务账号';
  }
  return '施工账号';
}

function buildAccount(source, role) {
  const normalizedRole = normalizeRole(role);
  return {
    accountId: source && source.id ? String(source.id) : '',
    accountName: source && source.name ? String(source.name) : '',
    role: normalizedRole,
    roleLabel: getRoleLabel(normalizedRole)
  };
}

module.exports = {
  MANAGER_ACCOUNT,
  canCreateOrderContext,
  canDispatchOrderContext,
  canEditOrderContext,
  canViewSalesBoardContext,
  getAvailableAccounts,
  getCurrentUserContext,
  getRoleLabel,
  isFinanceContext,
  isManagerContext,
  isSalesContext,
  isTechnicianContext,
  setCurrentUserContextById
};
