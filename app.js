const { getFinanceConfig } = require('./config/finance.config');

App({
  onLaunch() {
    // Route trace helps quickly locate hidden redirects in DevTools console.
    if (typeof wx !== 'undefined' && wx && typeof wx.onAppRoute === 'function') {
      wx.onAppRoute((route) => {
        if (!route) {
          return;
        }
        const path = String(route.path || '');
        const type = String(route.openType || 'unknown');
        console.info('[route]', type, path);
      });
    }
  },

  onError(error) {
    console.error('[app-error]', error);
  },

  onUnhandledRejection(event) {
    console.error('[unhandled-rejection]', event);
  },

  onPageNotFound(event) {
    console.warn('[page-not-found]', event);
  },

  globalData: {
    servicePhone: '4008008899',
    financeConfig: getFinanceConfig()
  }
});
