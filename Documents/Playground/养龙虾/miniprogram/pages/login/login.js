const { getFinanceConfig, setFinanceBaseUrl } = require('../../config/finance.config');
const { loginMiniProgram } = require('../../utils/mini-auth');
const { hasMiniAuthSession } = require('../../utils/page-access');

Page({
  data: {
    baseUrlInput: '',
    usernameInput: '',
    passwordInput: '',
    submitting: false,
    errorText: '',
    checkingSession: true
  },

  onShow() {
    if (hasMiniAuthSession()) {
      this.finishLoginFlow();
      return;
    }

    const financeConfig = getFinanceConfig();
    this.setData({
      checkingSession: false,
      baseUrlInput: financeConfig.baseUrl || '',
      errorText: ''
    });
  },

  onBaseUrlInput(event) {
    this.setData({
      baseUrlInput: event.detail.value || ''
    });
  },

  onUsernameInput(event) {
    this.setData({
      usernameInput: event.detail.value || '',
      errorText: ''
    });
  },

  onPasswordInput(event) {
    this.setData({
      passwordInput: event.detail.value || '',
      errorText: ''
    });
  },

  onLoginSubmit() {
    if (this.data.submitting) {
      return;
    }

    const baseUrl = String(this.data.baseUrlInput || '').trim();
    const username = String(this.data.usernameInput || '').trim();
    const password = String(this.data.passwordInput || '').trim();
    if (!baseUrl) {
      this.setData({ errorText: '请先填写后端地址（Base URL）' });
      return;
    }

    setFinanceBaseUrl(baseUrl);
    this.setData({
      submitting: true,
      errorText: ''
    });

    loginMiniProgram({
      baseUrl,
      username,
      password
    })
      .then(() => {
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        });
        this.finishLoginFlow();
      })
      .catch((error) => {
        this.setData({
          errorText: String((error && error.message) || '登录失败，请稍后重试')
        });
      })
      .finally(() => {
        this.setData({
          submitting: false
        });
      });
  },

  finishLoginFlow() {
    var pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }

    wx.reLaunch({
      url: '/pages/index/index'
    });
  }
});
