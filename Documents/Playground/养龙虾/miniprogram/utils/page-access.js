const { getMiniAuthSession } = require('./mini-auth');

function getValidMiniAuthSession() {
  const session = getMiniAuthSession();
  if (session && session.token && session.user) {
    return session;
  }
  return null;
}

function hasMiniAuthSession() {
  return Boolean(getValidMiniAuthSession());
}

function navigateToStoreLogin() {
  if (typeof wx === 'undefined' || !wx || typeof wx.navigateTo !== 'function') {
    return;
  }
  wx.navigateTo({
    url: '/pages/login?scene=store'
  });
}

function relaunchToStoreLogin() {
  if (typeof wx === 'undefined' || !wx) {
    return;
  }
  if (typeof wx.reLaunch === 'function') {
    wx.reLaunch({
      url: '/pages/login?scene=store'
    });
    return;
  }
  navigateToStoreLogin();
}

function ensureMiniSessionOrNavigate() {
  if (hasMiniAuthSession()) {
    return true;
  }
  navigateToStoreLogin();
  return false;
}

module.exports = {
  ensureMiniSessionOrNavigate,
  getValidMiniAuthSession,
  hasMiniAuthSession,
  navigateToStoreLogin,
  relaunchToStoreLogin
};