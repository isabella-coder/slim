const { clearMiniAuthSession } = require('../../utils/mini-auth');
const { getFinanceConfig } = require('../../config/finance.config');
const {
  getValidMiniAuthSession,
  navigateToStoreLogin
} = require('../../utils/page-access');
const {
  getCurrentUserContext,
  isManagerContext,
  isSalesContext
} = require('../../utils/user-context');

const PAGE_SIZE = 20;
const LEAD_STATUSES = ['待联系', '已联系', '已到店', '已成交', '已流失'];

var STATUS_CLASS_MAP = {
  '待联系': 'status-pending',
  '已联系': 'status-contacted',
  '已到店': 'status-visited',
  '已成交': 'status-closed',
  '已流失': 'status-lost'
};

function addStatusClass(items) {
  for (var i = 0; i < items.length; i++) {
    var s = items[i].leadStatus || '待联系';
    items[i]._statusClass = STATUS_CLASS_MAP[s] || 'status-pending';
  }
  return items;
}

Page({
  data: {
    leads: [],         // 全量数据（从 API 取回）
    filteredLeads: [],  // 筛选+搜索+分页后的展示数据
    stats: { total: 0, S: 0, A: 0, B: 0, C: 0 },
    needLogin: false,
    gradeFilter: 'ALL',
    statusFilter: 'ALL',
    keyword: '',
    loading: false,
    currentUser: {},
    page: 1,
    totalPages: 1,
    followupDueCount: 0,
    followupDueItems: []
  },

  onLoad() {
    const ctx = getCurrentUserContext();
    this.setData({ currentUser: ctx });
  },

  onShow() {
    this.loadLeads();
    this.loadFollowupDue();
  },

  onPullDownRefresh() {
    this.loadLeads().then(() => wx.stopPullDownRefresh());
  },

  // ─── 等级筛选 ───
  filterByGrade(e) {
    const grade = (e.currentTarget.dataset.grade || 'ALL').toUpperCase();
    if (grade === this.data.gradeFilter) return;
    this.setData({ gradeFilter: grade, page: 1 });
    this.loadLeads();
  },

  // ─── 状态筛选 ───
  filterByStatus(e) {
    const status = e.currentTarget.dataset.status || 'ALL';
    if (status === this.data.statusFilter) return;
    this.setData({ statusFilter: status, page: 1 });
    this.applyLocalFilters();
  },

  // ─── 搜索 ───
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  doSearch() {
    this.setData({ page: 1 });
    this.applyLocalFilters();
  },

  // ─── 分页 ───
  prevPage() {
    if (this.data.page > 1) {
      this.setData({ page: this.data.page - 1 });
      this.applyLocalFilters();
    }
  },

  nextPage() {
    if (this.data.page < this.data.totalPages) {
      this.setData({ page: this.data.page + 1 });
      this.applyLocalFilters();
    }
  },

  // ─── 本地筛选（状态+搜索+分页）───
  applyLocalFilters() {
    let list = this.data.leads.slice();
    const { statusFilter, keyword, page } = this.data;

    // 状态筛选
    if (statusFilter && statusFilter !== 'ALL') {
      list = list.filter(o => (o.leadStatus || '待联系') === statusFilter);
    }

    // 关键词搜索
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(o =>
        (o.customerName || '').toLowerCase().includes(kw) ||
        (o.carModel || '').toLowerCase().includes(kw) ||
        (o.phone || '').includes(kw)
      );
    }

    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    this.setData({
      filteredLeads: list.slice(start, end),
      page: safePage,
      totalPages
    });
  },

  // ─── 加载线索 ───
  loadLeads() {
    const session = getValidMiniAuthSession();
    if (!session) {
      this.setData({
        needLogin: true,
        loading: false,
        leads: [],
        filteredLeads: []
      });
      return Promise.resolve();
    }

    this.setData({ loading: true, needLogin: false });
    const baseUrl = getFinanceConfig().baseUrl.replace(/\/+$/, '');
    const grade = this.data.gradeFilter;
    const url = `${baseUrl}/api/v1/store/leads?grade=${grade}`;

    return new Promise((resolve) => {
      wx.request({
        url,
        method: 'GET',
        header: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        timeout: 10000,
        success: (res) => {
          if (res.statusCode === 200 && res.data && (res.data.ok || res.data.success || res.data.code === 0)) {
            const items = Array.isArray(res.data.items) ? res.data.items : [];
            addStatusClass(items);
            const stats = res.data.stats || {};
            this.setData({ leads: items, stats: stats, loading: false, needLogin: false });
            this.applyLocalFilters();
          } else if (res.statusCode === 401) {
            clearMiniAuthSession();
            this.setData({
              needLogin: true,
              loading: false,
              leads: [],
              filteredLeads: []
            });
          } else {
            wx.showToast({ title: '加载失败', icon: 'none' });
            this.setData({ loading: false });
          }
          resolve();
        },
        fail: () => {
          wx.showToast({ title: '网络错误', icon: 'none' });
          this.setData({ loading: false });
          resolve();
        }
      });
    });
  },

  // ─── 跳转详情 ───
  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` });
    }
  },

  // ─── 展开/折叠对话摘要 ───
  toggleSummary(e) {
    const idx = e.currentTarget.dataset.index;
    const key = `filteredLeads[${idx}]._expanded`;
    this.setData({ [key]: !this.data.filteredLeads[idx]._expanded });
  },

  // ─── 线索状态修改 ───
  showStatusPicker(e) {
    const id = e.currentTarget.dataset.id;
    const idx = e.currentTarget.dataset.index;
    wx.showActionSheet({
      itemList: LEAD_STATUSES,
      success: (res) => {
        const newStatus = LEAD_STATUSES[res.tapIndex];
        this.updateLeadStatus(id, newStatus, idx);
      }
    });
  },

  updateLeadStatus(leadId, newStatus, displayIdx) {
    const session = getValidMiniAuthSession();
    if (!session) {
      this.setData({ needLogin: true });
      return;
    }

    const baseUrl = getFinanceConfig().baseUrl.replace(/\/+$/, '');
    wx.showLoading({ title: '更新中...' });

    wx.request({
      url: `${baseUrl}/api/v1/store/leads/update-status`,
      method: 'POST',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      data: { id: leadId, leadStatus: newStatus },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data && (res.data.ok || res.data.success || res.data.code === 0)) {
          wx.showToast({ title: `已更新为${newStatus}` });
          // 同步本地数据
          const leads = this.data.leads;
          const found = leads.find(o => o.id === leadId);
          if (found) {
            found.leadStatus = newStatus;
            found._statusClass = STATUS_CLASS_MAP[newStatus] || 'status-pending';
          }
          this.setData({ leads: leads });
          this.applyLocalFilters();
        } else {
          const message = (res && res.data && res.data.message) ? res.data.message : '更新失败';
          wx.showToast({ title: message, icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // ─── 回访到期加载 ───
  loadFollowupDue() {
    const session = getValidMiniAuthSession();
    if (!session) {
      this.setData({ needLogin: true, followupDueCount: 0, followupDueItems: [] });
      return;
    }
    const baseUrl = getFinanceConfig().baseUrl.replace(/\/+$/, '');
    wx.request({
      url: `${baseUrl}/api/v1/store/leads/followup-due`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${session.token}` },
      success: (res) => {
        if (res.statusCode === 200 && res.data && (res.data.ok || res.data.success || res.data.code === 0)) {
          this.setData({
            needLogin: false,
            followupDueCount: res.data.total || 0,
            followupDueItems: res.data.items || []
          });
          return;
        }
        if (res.statusCode === 401) {
          clearMiniAuthSession();
          this.setData({ needLogin: true, followupDueCount: 0, followupDueItems: [] });
        }
      }
    });
  },

  goLogin() {
    navigateToStoreLogin();
  },

  // ─── 显示回访到期详情 ───
  showFollowupDue() {
    const items = this.data.followupDueItems;
    if (!items.length) return;
    const lines = items.slice(0, 10).map(i =>
      `${i.customerName} | ${i.followupType} | ${i.overdueDays > 0 ? '逾期' + i.overdueDays + '天' : '今日到期'}`
    );
    if (items.length > 10) lines.push(`...还有 ${items.length - 10} 条`);
    wx.showModal({
      title: `${items.length} 条待回访线索`,
      content: lines.join('\n'),
      showCancel: false
    });
  },

  // ─── 一键转为贴膜订单 ───
  convertToOrder(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    const params = [
      `customerName=${encodeURIComponent(item.customerName || '')}`,
      `phone=${encodeURIComponent(item.phone || '')}`,
      `carModel=${encodeURIComponent(item.carModel || '')}`,
      `fromLead=${encodeURIComponent(item.id || '')}`
    ].join('&');
    wx.navigateTo({ url: `/pages/film-order/film-order?${params}` });
  },

  // ─── 拨打电话 ───
  callCustomer(e) {
    const phone = e.currentTarget.dataset.phone;
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone });
    } else {
      wx.showToast({ title: '暂无电话', icon: 'none' });
    }
  },

  // ─── 复制微信号 ───
  copyWechat(e) {
    const wechat = e.currentTarget.dataset.wechat;
    if (wechat) {
      wx.setClipboardData({
        data: wechat,
        success: () => wx.showToast({ title: '已复制微信号' })
      });
    }
  }
});
