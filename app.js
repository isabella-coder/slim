const { getFinanceConfig } = require('./config/finance.config');

App({
  globalData: {
    servicePhone: '4008008899',
    financeConfig: getFinanceConfig()
  }
});
