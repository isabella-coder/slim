const TOKEN_KEY = "admin_console_token";
const SALES_FILTER_KEY = "admin_console_sales_filter";

const state = {
  token: "",
  user: null,
  activeTab: "orders",
  orders: {
    view: "ALL",
    status: "ALL",
    salesOwner: "",
    keyword: "",
  },
  dispatch: {
    view: "ALL",
    date: getTodayDate(),
  },
  followups: {
    view: "ALL",
    status: "ALL",
  },
  finance: {
    eventType: "ALL",
    serviceType: "ALL",
    keyword: "",
    limit: "200",
  },
  security: {
    users: [],
  },
};

const el = {
  loginPanel: document.getElementById("loginPanel"),
  appPanel: document.getElementById("appPanel"),
  loginForm: document.getElementById("loginForm"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginError: document.getElementById("loginError"),
  logoutBtn: document.getElementById("logoutBtn"),
  userBadge: document.getElementById("userBadge"),
  welcomeText: document.getElementById("welcomeText"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  financeTabBtn: document.querySelector('.tab-btn[data-tab="finance"]'),
  securityTabBtn: document.querySelector('.tab-btn[data-tab="security"]'),
  tabs: {
    orders: document.getElementById("ordersTab"),
    dispatch: document.getElementById("dispatchTab"),
    followups: document.getElementById("followupsTab"),
    finance: document.getElementById("financeTab"),
    security: document.getElementById("securityTab"),
  },
  ordersViewSelect: document.getElementById("ordersViewSelect"),
  ordersStatusSelect: document.getElementById("ordersStatusSelect"),
  ordersSalesInput: document.getElementById("ordersSalesInput"),
  ordersKeywordInput: document.getElementById("ordersKeywordInput"),
  ordersRefreshBtn: document.getElementById("ordersRefreshBtn"),
  ordersStats: document.getElementById("ordersStats"),
  ordersTbody: document.getElementById("ordersTbody"),
  dispatchDateInput: document.getElementById("dispatchDateInput"),
  dispatchViewSelect: document.getElementById("dispatchViewSelect"),
  dispatchRefreshBtn: document.getElementById("dispatchRefreshBtn"),
  dispatchStats: document.getElementById("dispatchStats"),
  dispatchCapacity: document.getElementById("dispatchCapacity"),
  dispatchTbody: document.getElementById("dispatchTbody"),
  followupsViewSelect: document.getElementById("followupsViewSelect"),
  followupsStatusSelect: document.getElementById("followupsStatusSelect"),
  followupsRefreshBtn: document.getElementById("followupsRefreshBtn"),
  followupsStats: document.getElementById("followupsStats"),
  followupsTbody: document.getElementById("followupsTbody"),
  financeEventTypeSelect: document.getElementById("financeEventTypeSelect"),
  financeServiceTypeSelect: document.getElementById("financeServiceTypeSelect"),
  financeKeywordInput: document.getElementById("financeKeywordInput"),
  financeLimitSelect: document.getElementById("financeLimitSelect"),
  financeRefreshBtn: document.getElementById("financeRefreshBtn"),
  financeStats: document.getElementById("financeStats"),
  financeTbody: document.getElementById("financeTbody"),
  changePasswordForm: document.getElementById("changePasswordForm"),
  currentPasswordInput: document.getElementById("currentPasswordInput"),
  newPasswordInput: document.getElementById("newPasswordInput"),
  confirmPasswordInput: document.getElementById("confirmPasswordInput"),
  changePasswordMessage: document.getElementById("changePasswordMessage"),
  resetPasswordPanel: document.getElementById("resetPasswordPanel"),
  resetPasswordForm: document.getElementById("resetPasswordForm"),
  resetUserSelect: document.getElementById("resetUserSelect"),
  resetNewPasswordInput: document.getElementById("resetNewPasswordInput"),
  resetPasswordMessage: document.getElementById("resetPasswordMessage"),
};

init();

function init() {
  bindEvents();
  state.token = localStorage.getItem(TOKEN_KEY) || "";
  state.orders.salesOwner = localStorage.getItem(SALES_FILTER_KEY) || "";
  el.ordersSalesInput.value = state.orders.salesOwner;
  el.dispatchDateInput.value = state.dispatch.date;

  if (!state.token) {
    showLogin();
    return;
  }

  restoreSession();
}

function bindEvents() {
  el.loginForm.addEventListener("submit", onLoginSubmit);
  el.logoutBtn.addEventListener("click", logout);

  el.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  el.ordersViewSelect.addEventListener("change", () => {
    state.orders.view = el.ordersViewSelect.value;
    loadOrders();
  });
  el.ordersStatusSelect.addEventListener("change", () => {
    state.orders.status = el.ordersStatusSelect.value;
    loadOrders();
  });
  el.ordersSalesInput.addEventListener("input", () => {
    state.orders.salesOwner = el.ordersSalesInput.value.trim();
    localStorage.setItem(SALES_FILTER_KEY, state.orders.salesOwner);
  });
  el.ordersKeywordInput.addEventListener("input", () => {
    state.orders.keyword = el.ordersKeywordInput.value.trim();
  });
  el.ordersRefreshBtn.addEventListener("click", loadOrders);

  el.dispatchDateInput.addEventListener("change", () => {
    state.dispatch.date = el.dispatchDateInput.value || getTodayDate();
    loadDispatch();
  });
  el.dispatchViewSelect.addEventListener("change", () => {
    state.dispatch.view = el.dispatchViewSelect.value;
    loadDispatch();
  });
  el.dispatchRefreshBtn.addEventListener("click", loadDispatch);

  el.followupsViewSelect.addEventListener("change", () => {
    state.followups.view = el.followupsViewSelect.value;
    loadFollowups();
  });
  el.followupsStatusSelect.addEventListener("change", () => {
    state.followups.status = el.followupsStatusSelect.value;
    loadFollowups();
  });
  el.followupsRefreshBtn.addEventListener("click", loadFollowups);

  el.financeEventTypeSelect.addEventListener("change", () => {
    state.finance.eventType = el.financeEventTypeSelect.value;
    loadFinanceLogs();
  });
  el.financeServiceTypeSelect.addEventListener("change", () => {
    state.finance.serviceType = el.financeServiceTypeSelect.value;
    loadFinanceLogs();
  });
  el.financeLimitSelect.addEventListener("change", () => {
    state.finance.limit = el.financeLimitSelect.value;
    loadFinanceLogs();
  });
  el.financeKeywordInput.addEventListener("input", () => {
    state.finance.keyword = el.financeKeywordInput.value.trim();
  });
  el.financeRefreshBtn.addEventListener("click", loadFinanceLogs);

  el.changePasswordForm.addEventListener("submit", onChangePasswordSubmit);
  el.resetPasswordForm.addEventListener("submit", onResetPasswordSubmit);
}

async function restoreSession() {
  try {
    const result = await request("/api/me");
    state.user = result.user;
    setupAfterLogin();
  } catch (error) {
    showLogin();
  }
}

async function onLoginSubmit(event) {
  event.preventDefault();
  el.loginError.textContent = "";
  const username = el.usernameInput.value.trim();
  const password = el.passwordInput.value.trim();
  if (!username || !password) {
    el.loginError.textContent = "请输入账号和密码";
    return;
  }

  try {
    const result = await request("/api/login", {
      method: "POST",
      auth: false,
      body: { username, password },
    });
    state.token = result.token;
    state.user = result.user;
    localStorage.setItem(TOKEN_KEY, state.token);
    setupAfterLogin();
  } catch (error) {
    el.loginError.textContent = error.message || "登录失败";
  }
}

function setupAfterLogin() {
  fillViewSelect(el.ordersViewSelect, state.user.permissions.canViewAll);
  fillViewSelect(el.dispatchViewSelect, state.user.permissions.canViewAll);
  fillViewSelect(el.followupsViewSelect, state.user.permissions.canViewAll);

  if (!state.user.permissions.canViewAll) {
    state.orders.view = "MINE";
    state.dispatch.view = "MINE";
    state.followups.view = "MINE";
  }

  el.ordersViewSelect.value = state.orders.view;
  el.dispatchViewSelect.value = state.dispatch.view;
  el.followupsViewSelect.value = state.followups.view;
  el.ordersStatusSelect.value = state.orders.status;
  el.followupsStatusSelect.value = state.followups.status;
  el.financeEventTypeSelect.value = state.finance.eventType;
  el.financeServiceTypeSelect.value = state.finance.serviceType;
  el.financeLimitSelect.value = state.finance.limit;
  el.financeKeywordInput.value = state.finance.keyword;

  const roleText = getRoleText(state.user.role);
  el.userBadge.textContent = `${state.user.name} · ${roleText}`;
  el.userBadge.classList.remove("hidden");
  el.welcomeText.textContent = `当前账号：${state.user.name}（${roleText}）`;

  const canViewFinance = isFinanceViewer(state.user.role);
  el.financeTabBtn.classList.toggle("hidden", !canViewFinance);
  const isManager = isManagerRole(state.user.role);
  el.resetPasswordPanel.classList.toggle("hidden", !isManager);
  resetSecurityMessages();
  resetSecurityForms();
  if (!canViewFinance && state.activeTab === "finance") {
    state.activeTab = "orders";
  }

  showApp();
  switchTab(state.activeTab);
  loadOrders();
  loadDispatch();
  loadFollowups();
  if (canViewFinance) {
    loadFinanceLogs();
  }
  if (isManager) {
    loadManagedUsers();
  } else {
    state.security.users = [];
    renderResetUserOptions([]);
  }
}

function switchTab(tabName) {
  if (tabName === "finance" && !isFinanceViewer(state.user && state.user.role)) {
    return;
  }

  state.activeTab = tabName;
  el.tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  Object.keys(el.tabs).forEach((key) => {
    el.tabs[key].classList.toggle("hidden", key !== tabName);
  });

  if (tabName === "finance") {
    loadFinanceLogs();
  }
}

async function loadOrders() {
  try {
    const params = new URLSearchParams();
    params.set("view", state.orders.view);
    params.set("status", state.orders.status);
    if (state.orders.keyword) {
      params.set("keyword", state.orders.keyword);
    }
    if (state.orders.salesOwner) {
      params.set("salesOwner", state.orders.salesOwner);
    }
    const result = await request(`/api/orders?${params.toString()}`);
    renderOrderStats(result.stats || {});
    renderOrders(result.items || []);
  } catch (error) {
    renderErrorRow(el.ordersTbody, error.message, 9);
  }
}

async function loadDispatch() {
  try {
    const params = new URLSearchParams();
    params.set("date", state.dispatch.date);
    params.set("view", state.dispatch.view);
    const result = await request(`/api/dispatch?${params.toString()}`);
    renderDispatchStats(result.stats || {});
    renderDispatchCapacity(result.capacity || []);
    renderDispatchRows(result.entries || []);
  } catch (error) {
    renderErrorRow(el.dispatchTbody, error.message, 7);
  }
}

async function loadFollowups() {
  try {
    const params = new URLSearchParams();
    params.set("view", state.followups.view);
    params.set("status", state.followups.status);
    const result = await request(`/api/followups?${params.toString()}`);
    renderFollowupStats(result.stats || {});
    renderFollowupRows(result.items || []);
  } catch (error) {
    renderErrorRow(el.followupsTbody, error.message, 7);
  }
}

async function loadFinanceLogs() {
  if (!isFinanceViewer(state.user && state.user.role)) {
    return;
  }

  try {
    const params = new URLSearchParams();
    params.set("eventType", state.finance.eventType || "ALL");
    params.set("serviceType", state.finance.serviceType || "ALL");
    params.set("limit", state.finance.limit || "200");
    if (state.finance.keyword) {
      params.set("keyword", state.finance.keyword);
    }

    const result = await request(`/api/finance/sync-logs?${params.toString()}`);
    renderFinanceStats(result.stats || {});
    renderFinanceRows(result.items || []);
  } catch (error) {
    renderCards(el.financeStats, []);
    renderErrorRow(el.financeTbody, error.message, 9);
  }
}

async function loadManagedUsers() {
  if (!isManagerRole(state.user && state.user.role)) {
    renderResetUserOptions([]);
    return;
  }

  try {
    const result = await request("/api/users");
    const items = Array.isArray(result.items) ? result.items : [];
    state.security.users = items;
    renderResetUserOptions(items);
  } catch (error) {
    state.security.users = [];
    renderResetUserOptions([]);
    setMessage(el.resetPasswordMessage, error.message || "员工列表加载失败", true);
  }
}

async function onChangePasswordSubmit(event) {
  event.preventDefault();
  const currentPassword = el.currentPasswordInput.value.trim();
  const newPassword = el.newPasswordInput.value.trim();
  const confirmPassword = el.confirmPasswordInput.value.trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    setMessage(el.changePasswordMessage, "请完整填写三项密码", true);
    return;
  }
  if (newPassword.length < 4) {
    setMessage(el.changePasswordMessage, "新密码至少 4 位", true);
    return;
  }
  if (newPassword !== confirmPassword) {
    setMessage(el.changePasswordMessage, "两次输入的新密码不一致", true);
    return;
  }
  if (newPassword === currentPassword) {
    setMessage(el.changePasswordMessage, "新密码不能与当前密码相同", true);
    return;
  }

  try {
    const result = await request("/api/password/change", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
    setMessage(el.changePasswordMessage, result.message || "密码修改成功", false);
    el.currentPasswordInput.value = "";
    el.newPasswordInput.value = "";
    el.confirmPasswordInput.value = "";
  } catch (error) {
    setMessage(el.changePasswordMessage, error.message || "密码修改失败", true);
  }
}

async function onResetPasswordSubmit(event) {
  event.preventDefault();
  if (!isManagerRole(state.user && state.user.role)) {
    setMessage(el.resetPasswordMessage, "仅店长可重置密码", true);
    return;
  }

  const username = el.resetUserSelect.value;
  const newPassword = el.resetNewPasswordInput.value.trim();
  if (!username) {
    setMessage(el.resetPasswordMessage, "请选择员工账号", true);
    return;
  }
  if (newPassword.length < 4) {
    setMessage(el.resetPasswordMessage, "新密码至少 4 位", true);
    return;
  }

  try {
    const result = await request("/api/users/reset-password", {
      method: "POST",
      body: { username, newPassword },
    });
    setMessage(el.resetPasswordMessage, result.message || "密码已重置", false);
    el.resetNewPasswordInput.value = "";
  } catch (error) {
    setMessage(el.resetPasswordMessage, error.message || "重置失败", true);
  }
}

async function markFollowupDone(orderId, type) {
  const remark = window.prompt("回访备注（可空）", "") || "";
  try {
    await request("/api/followups/mark-done", {
      method: "POST",
      body: { orderId, type, remark },
    });
    loadFollowups();
  } catch (error) {
    alert(error.message || "更新失败");
  }
}

function renderOrderStats(stats) {
  const cards = [
    { label: "订单总数", value: stats.total || 0 },
    { label: "未完工", value: stats.pending || 0 },
    { label: "已完工", value: stats.confirmed || 0 },
    { label: "已取消", value: stats.cancelled || 0 },
  ];
  renderCards(el.ordersStats, cards);
}

function renderOrders(items) {
  const rows = items.map((item) => {
    const total = item.priceSummary && Number.isFinite(Number(item.priceSummary.totalPrice))
      ? Number(item.priceSummary.totalPrice)
      : 0;
    return `
      <tr>
        <td>${escapeHtml(item.id || "")}</td>
        <td>${buildStatusTag(item.status)}</td>
        <td>${escapeHtml(item.customerName || "未填写")}</td>
        <td>${escapeHtml(item.carModel || "")} / ${escapeHtml(item.plateNumber || "未填")}</td>
        <td>${escapeHtml(item.salesBrandText || "未填写")}</td>
        <td>${escapeHtml(item.store || "未填写")}</td>
        <td>${escapeHtml(item.appointmentDate || "")} ${escapeHtml(item.appointmentTime || "")}</td>
        <td>¥${total}</td>
        <td>${escapeHtml(item.deliveryStatus || "待交车验收")}</td>
      </tr>
    `;
  }).join("");

  el.ordersTbody.innerHTML = rows || `<tr><td colspan="9">暂无订单</td></tr>`;
}

function renderDispatchStats(stats) {
  const cards = [
    { label: "总工单", value: stats.total || 0 },
    { label: "已派工", value: stats.assigned || 0 },
    { label: "未派工", value: stats.unassigned || 0 },
    { label: "冲突数", value: stats.conflict || 0 },
  ];
  renderCards(el.dispatchStats, cards);
}

function renderDispatchCapacity(capacity) {
  const cards = capacity.map((item) => ({
    label: `${item.store} (${item.assigned}/${item.limit})`,
    value: item.full ? "已满" : `剩余${item.remaining}`,
  }));
  renderCards(el.dispatchCapacity, cards);
}

function renderDispatchRows(items) {
  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.time || "--:--")}</td>
      <td>${escapeHtml(item.workBay || "未分配")}</td>
      <td>${escapeHtml(item.technicianDisplay || item.technicianName || "未分配")}</td>
      <td>${escapeHtml(item.id || "")}</td>
      <td>${escapeHtml(item.customerName || "未填")}</td>
      <td>${escapeHtml(item.carModel || "")} / ${escapeHtml(item.plateNumber || "未填")}</td>
      <td class="${item.conflictText ? "conflict-text" : ""}">${escapeHtml(item.conflictText || "正常")}</td>
    </tr>
  `).join("");

  el.dispatchTbody.innerHTML = rows || `<tr><td colspan="7">该日期暂无排班</td></tr>`;
}

function renderFollowupStats(stats) {
  const cards = [
    { label: "回访总数", value: stats.total || 0 },
    { label: "今日到期", value: stats.dueToday || 0 },
    { label: "已逾期", value: stats.overdue || 0 },
    { label: "已完成", value: stats.done || 0 },
  ];
  renderCards(el.followupsStats, cards);
}

function renderFollowupRows(items) {
  const rows = items.map((item) => {
    const canMark = item.status !== "DONE";
    return `
      <tr>
        <td>${escapeHtml(item.label || "")}</td>
        <td>${escapeHtml(item.dueDateText || "")}</td>
        <td>${buildFollowupTag(item.status)}</td>
        <td>${escapeHtml(item.orderId || "")}</td>
        <td>${escapeHtml(item.customerName || "未填")}</td>
        <td>${escapeHtml(item.salesOwner || "未填")}</td>
        <td>
          ${
            canMark
              ? `<button class="action-btn" data-order="${escapeHtml(item.orderId || "")}" data-type="${escapeHtml(item.type || "")}">标记已回访</button>`
              : `<span class="tag tag-success">完成 ${escapeHtml(item.doneAt || "")}</span>`
          }
        </td>
      </tr>
    `;
  }).join("");

  el.followupsTbody.innerHTML = rows || `<tr><td colspan="7">暂无回访数据</td></tr>`;
  Array.from(el.followupsTbody.querySelectorAll(".action-btn")).forEach((btn) => {
    btn.addEventListener("click", () => {
      markFollowupDone(btn.dataset.order, btn.dataset.type);
    });
  });
}

function renderFinanceStats(stats) {
  const cards = [
    { label: "日志总数", value: stats.total || 0 },
    { label: "同步成功", value: stats.success || 0 },
    { label: "同步失败", value: stats.failed || 0 },
    { label: "累计金额", value: `¥${Number(stats.totalAmount || 0).toFixed(2)}` },
  ];
  renderCards(el.financeStats, cards);
}

function renderFinanceRows(items) {
  const rows = items.map((item) => {
    const amount = Number.isFinite(Number(item.totalPrice)) ? Number(item.totalPrice) : 0;
    return `
      <tr>
        <td>${escapeHtml(item.receivedAt || "")}</td>
        <td>${escapeHtml(item.orderId || "")}</td>
        <td>${escapeHtml(item.eventType || "")}</td>
        <td>${escapeHtml(item.source || "")}</td>
        <td>${escapeHtml(item.serviceType || "")}</td>
        <td>${escapeHtml(item.orderStatus || "")}</td>
        <td>¥${amount.toFixed(2)}</td>
        <td>${escapeHtml(item.externalId || "-")}</td>
        <td>${buildFinanceResultTag(item.result)}</td>
      </tr>
    `;
  }).join("");

  el.financeTbody.innerHTML = rows || `<tr><td colspan="9">暂无财务日志</td></tr>`;
}

function renderResetUserOptions(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    el.resetUserSelect.innerHTML = `<option value="">暂无员工账号</option>`;
    return;
  }

  el.resetUserSelect.innerHTML = list
    .map((item) => `<option value="${escapeHtml(item.username || "")}">${escapeHtml(`${item.name || item.username}（${getRoleText(item.role)}）`)}</option>`)
    .join("");
}

function setMessage(container, text, isError) {
  if (!container) {
    return;
  }
  container.textContent = text || "";
  container.classList.remove("success", "error");
  if (!text) {
    return;
  }
  container.classList.add(isError ? "error" : "success");
}

function resetSecurityMessages() {
  setMessage(el.changePasswordMessage, "", false);
  setMessage(el.resetPasswordMessage, "", false);
}

function resetSecurityForms() {
  el.currentPasswordInput.value = "";
  el.newPasswordInput.value = "";
  el.confirmPasswordInput.value = "";
  el.resetNewPasswordInput.value = "";
}

function renderCards(container, cards) {
  container.innerHTML = cards
    .map(
      (item) => `
      <div class="card-item">
        <small>${escapeHtml(item.label)}</small>
        <strong>${escapeHtml(String(item.value))}</strong>
      </div>
    `
    )
    .join("");
}

function renderErrorRow(tbody, message, colspan) {
  const span = Number.isFinite(Number(colspan)) ? Number(colspan) : 9;
  tbody.innerHTML = `<tr><td colspan="${span}">${escapeHtml(message || "加载失败")}</td></tr>`;
}

function fillViewSelect(selectEl, canViewAll) {
  const options = canViewAll
    ? [
        { value: "ALL", text: "全部订单" },
        { value: "MINE", text: "我的订单" },
      ]
    : [{ value: "MINE", text: "我的订单" }];
  selectEl.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.text}</option>`)
    .join("");
}

function showLogin() {
  el.loginPanel.classList.remove("hidden");
  el.appPanel.classList.add("hidden");
  el.userBadge.classList.add("hidden");
  resetSecurityMessages();
  resetSecurityForms();
  renderResetUserOptions([]);
  el.resetPasswordPanel.classList.add("hidden");
  state.token = "";
  state.user = null;
}

function showApp() {
  el.loginPanel.classList.add("hidden");
  el.appPanel.classList.remove("hidden");
}

async function logout() {
  try {
    if (state.token) {
      await request("/api/logout", { method: "POST" });
    }
  } catch (error) {
    // ignore
  }
  localStorage.removeItem(TOKEN_KEY);
  state.token = "";
  showLogin();
}

async function request(url, options = {}) {
  const method = options.method || "GET";
  const headers = { "Content-Type": "application/json" };
  if (options.auth !== false && state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    if (response.status === 409 && data.code === "ORDER_VERSION_CONFLICT") {
      const message = handleOrderVersionConflict(data);
      throw new Error(message);
    }
    const message = data.message || `请求失败 (${response.status})`;
    if (response.status === 401 && options.auth !== false) {
      localStorage.removeItem(TOKEN_KEY);
      showLogin();
    }
    throw new Error(message);
  }
  return data;
}

function handleOrderVersionConflict(data) {
  const currentVersion = Number.isFinite(Number(data && data.currentVersion))
    ? Number(data.currentVersion)
    : null;
  const baseMessage = data && data.message ? data.message : "订单已被其他人更新";
  const confirmMessage = `${baseMessage}\n${currentVersion !== null ? `最新版本：${currentVersion}\n` : ""}点击“确定”以服务器为准并刷新数据；点击“取消”手动重试。`;
  const useServer = window.confirm(confirmMessage);
  if (useServer) {
    loadOrders();
    loadDispatch();
    loadFollowups();
    if (isFinanceViewer(state.user && state.user.role)) {
      loadFinanceLogs();
    }
    return "已按服务器最新数据刷新。";
  }
  return "已保留本地修改，请手动重试。";
}

function getRoleText(role) {
  if (role === "manager") {
    return "店长";
  }
  if (role === "sales") {
    return "销售";
  }
  if (role === "technician") {
    return "施工";
  }
  if (role === "finance") {
    return "财务";
  }
  return role || "未知角色";
}

function isFinanceViewer(role) {
  const key = String(role || "").toLowerCase();
  return key === "manager" || key === "finance";
}

function isManagerRole(role) {
  return String(role || "").toLowerCase() === "manager";
}

function buildStatusTag(status) {
  const text = escapeHtml(status || "");
  if (status === "未完工") {
    return `<span class="tag tag-pending">${text}</span>`;
  }
  if (status === "已取消") {
    return `<span class="tag tag-cancel">${text}</span>`;
  }
  if (status === "已完工") {
    return `<span class="tag tag-success">${text}</span>`;
  }
  return `<span class="tag">${text || "未知"}</span>`;
}

function buildFollowupTag(status) {
  if (status === "DONE") {
    return `<span class="tag tag-success">已完成</span>`;
  }
  if (status === "OVERDUE") {
    return `<span class="tag tag-cancel">已逾期</span>`;
  }
  if (status === "DUE_TODAY") {
    return `<span class="tag tag-pending">今日到期</span>`;
  }
  return `<span class="tag">待处理</span>`;
}

function buildFinanceResultTag(result) {
  const text = String(result || "").toUpperCase();
  if (text === "SUCCESS") {
    return `<span class="tag tag-success">成功</span>`;
  }
  if (text === "FAILED") {
    return `<span class="tag tag-cancel">失败</span>`;
  }
  return `<span class="tag">未知</span>`;
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
