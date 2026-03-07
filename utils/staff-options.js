const TECHNICIAN_ACCOUNTS = [
  { id: 'tech_wangao', name: '王澳' },
  { id: 'tech_wangdi', name: '王迪' },
  { id: 'tech_zhanglin', name: '张霖' },
  { id: 'tech_yangzhendong', name: '杨振东' },
  { id: 'tech_zhangfaqiang', name: '张发强' },
  { id: 'tech_linruihao', name: '林睿豪' },
  { id: 'tech_fangyuan', name: '方圆' },
  { id: 'tech_fanxiangyang', name: '范向阳' },
  { id: 'tech_fengguohao', name: '冯国豪' },
  { id: 'tech_yaozunyi', name: '姚遵义' },
  { id: 'tech_zhangyongzhi', name: '张永志' }
];

const SALES_ACCOUNTS = [
  { id: 'sales_mengao', name: '孟傲' },
  { id: 'sales_tianjiajia', name: '田佳佳' },
  { id: 'sales_zhoushilei', name: '周石磊' },
  { id: 'sales_cuitingting', name: '崔庭廷' },
  { id: 'sales_weipeng', name: '魏鹏' },
  { id: 'sales_libochao', name: '李博超' }
];

const FINANCE_ACCOUNTS = [
  { id: 'finance_huangyanting', name: '黄艳婷' }
];

const MANAGER_ACCOUNTS = [
  { id: 'manager_wujiabin', name: '吴佳彬' },
  { id: 'manager_yushuai', name: '余帅' }
];

const TECHNICIAN_OPTIONS = TECHNICIAN_ACCOUNTS.map((item) => item.name);

const SALES_OPTIONS = SALES_ACCOUNTS.map((item) => item.name);

function findTechnicianAccountByName(name) {
  const target = normalizeText(name);
  if (!target) {
    return null;
  }
  return TECHNICIAN_ACCOUNTS.find((item) => normalizeText(item.name) === target) || null;
}

function findTechnicianAccountById(accountId) {
  const target = normalizeText(accountId);
  if (!target) {
    return null;
  }
  return TECHNICIAN_ACCOUNTS.find((item) => normalizeText(item.id) === target) || null;
}

function normalizeText(value) {
  return String(value || '').trim();
}

module.exports = {
  TECHNICIAN_ACCOUNTS,
  SALES_ACCOUNTS,
  FINANCE_ACCOUNTS,
  MANAGER_ACCOUNTS,
  TECHNICIAN_OPTIONS,
  SALES_OPTIONS,
  findTechnicianAccountByName,
  findTechnicianAccountById
};
