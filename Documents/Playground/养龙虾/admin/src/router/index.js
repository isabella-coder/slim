/**
 * 路由配置
 */

import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../pages/Home.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/accounts',
    name: 'Accounts',
    component: () => import('../pages/Accounts.vue'),
    meta: { title: '账号管理' }
  },
  {
    path: '/leads',
    name: 'Leads',
    component: () => import('../pages/Leads.vue'),
    meta: { title: '线索中心' }
  },
  {
    path: '/leads/:id',
    name: 'LeadDetail',
    component: () => import('../pages/LeadDetail.vue'),
    meta: { title: '线索详情' }
  },
  {
    path: '/allocation',
    name: 'Allocation',
    component: () => import('../pages/Allocation.vue'),
    meta: { title: '分配管理' }
  },
  {
    path: '/stats/daily',
    name: 'StatsDaily',
    component: () => import('../pages/StatsDaily.vue'),
    meta: { title: '日报统计' }
  },
  {
    path: '/stats/sales',
    name: 'StatsSales',
    component: () => import('../pages/StatsSales.vue'),
    meta: { title: '销售统计' }
  },
  {
    path: '/stats/sla',
    name: 'StatsSla',
    component: () => import('../pages/StatsSla.vue'),
    meta: { title: 'SLA 统计' }
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
