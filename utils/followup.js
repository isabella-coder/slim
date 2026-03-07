const FOLLOWUP_RULES = [
  { type: 'D7', label: '7天回访', days: 7 },
  { type: 'D30', label: '30天回访', days: 30 },
  { type: 'D60', label: '60天回访', days: 60 },
  { type: 'D180', label: '180天回访', days: 180 }
];

function summarizeFollowupOrders(orders, now) {
  const list = Array.isArray(orders) ? orders : [];
  const currentDate = now instanceof Date ? now : new Date();
  const stats = {
    total: 0,
    dueToday: 0,
    overdue: 0,
    pending: 0,
    done: 0
  };

  list.forEach((order) => {
    const items = buildFollowupItems(order, currentDate);
    if (items.length === 0) {
      return;
    }

    items.forEach((item) => {
      stats.total += 1;
      if (item.status === 'DONE') {
        stats.done += 1;
      } else if (item.status === 'DUE_TODAY') {
        stats.dueToday += 1;
      } else if (item.status === 'OVERDUE') {
        stats.overdue += 1;
      } else {
        stats.pending += 1;
      }
    });
  });

  return stats;
}

function buildFollowupItems(order, now) {
  if (!order || typeof order !== 'object' || order.status === '已取消') {
    return [];
  }

  if (order.deliveryStatus !== '交车通过') {
    return [];
  }

  const currentDate = now instanceof Date ? now : new Date();
  const deliveryDate = parseDateTimeText(order.deliveryPassedAt);
  if (!deliveryDate) {
    return [];
  }

  const records = normalizeFollowupRecords(order.followupRecords);
  const recordMap = {};
  records.forEach((record) => {
    recordMap[record.type] = record;
  });

  return FOLLOWUP_RULES.map((rule) => {
    const dueDate = addDays(deliveryDate, rule.days);
    const dueText = formatDate(dueDate);
    const record = recordMap[rule.type];
    const done = Boolean(record && record.done);
    const status = done ? 'DONE' : getPendingStatus(dueDate, currentDate);

    return {
      type: rule.type,
      label: rule.label,
      days: rule.days,
      dueDateText: dueText,
      done,
      doneAt: record ? record.doneAt : '',
      remark: record ? record.remark : '',
      status
    };
  });
}

function markFollowupDone(records, type, doneAt, remark) {
  const normalizedType = String(type || '').trim().toUpperCase();
  if (!normalizedType) {
    return normalizeFollowupRecords(records);
  }

  const list = normalizeFollowupRecords(records).slice();
  const index = list.findIndex((item) => item.type === normalizedType);
  const nextRecord = {
    type: normalizedType,
    done: true,
    doneAt: doneAt || '',
    remark: String(remark || '').trim()
  };

  if (index >= 0) {
    list.splice(index, 1, nextRecord);
  } else {
    list.push(nextRecord);
  }

  return list;
}

function normalizeFollowupRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((item) => {
    const type = String(item && item.type ? item.type : '').trim().toUpperCase();
    if (!type) {
      return null;
    }

    return {
      type,
      done: Boolean(item && item.done),
      doneAt: item && item.doneAt ? String(item.doneAt) : '',
      remark: item && item.remark ? String(item.remark) : ''
    };
  }).filter((item) => Boolean(item));
}

function parseDateTimeText(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\//g, '-').replace(/\./g, '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return parseDate(`${normalized}T00:00:00`);
  }

  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(normalized)) {
    const isoText = normalized.replace(/\s+/, 'T');
    return parseDate(`${isoText}:00`);
  }

  return parseDate(normalized);
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getPendingStatus(dueDate, now) {
  const dueDay = startOfDay(dueDate).getTime();
  const nowDay = startOfDay(now).getTime();

  if (nowDay > dueDay) {
    return 'OVERDUE';
  }
  if (nowDay === dueDay) {
    return 'DUE_TODAY';
  }
  return 'PENDING';
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = {
  FOLLOWUP_RULES,
  buildFollowupItems,
  formatDate,
  markFollowupDone,
  normalizeFollowupRecords,
  parseDateTimeText,
  summarizeFollowupOrders
};
