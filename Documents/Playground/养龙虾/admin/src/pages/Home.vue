<template>
  <div class="home">
    <h1>欢迎使用上海两店客资中台系统</h1>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">今日线索总数</div>
        <div class="stat-value">{{ todayStats.lead_count }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">首响率</div>
        <div class="stat-value">{{ todayStats.first_reply_rate?.toFixed(1) }}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">加微信成功率</div>
        <div class="stat-value">{{ todayStats.wechat_success_rate?.toFixed(1) }}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">SLA 1M 通过率</div>
        <div class="stat-value">{{ sla1mRate }}%</div>
      </div>
    </div>

    <div class="quick-links">
      <h3>快速导航</h3>
      <el-button type="primary" @click="$router.push('/accounts')">📱 账号管理</el-button>
      <el-button type="primary" @click="$router.push('/leads')">📋 线索中心</el-button>
      <el-button type="primary" @click="$router.push('/stats/daily')">📊 日报统计</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { statsApi } from '../utils/api'

const todayStats = ref({
  lead_count: 0,
  first_reply_rate: 0,
  wechat_success_rate: 0,
  sla_1m_pass_count: 0,
})

const sla1mRate = computed(() => {
  if (todayStats.value.lead_count === 0) return 0
  return ((todayStats.value.sla_1m_pass_count / todayStats.value.lead_count) * 100).toFixed(1)
})

onMounted(async () => {
  try {
    // 获取今日统计
    const today = new Date().toISOString().split('T')[0]
    const stats = await statsApi.daily(today)
    if (stats) {
      todayStats.value = stats
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error)
  }
})
</script>

<style scoped>
.home {
  padding: 20px;
}

h1 {
  margin-bottom: 30px;
  color: #333;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #409eff;
}

.quick-links {
  background: white;
  padding: 20px;
  border-radius: 4px;
}

.quick-links h3 {
  margin-bottom: 15px;
}

.quick-links button {
  margin-right: 10px;
  margin-bottom: 10px;
}
</style>
