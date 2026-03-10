<template>
  <div class="stats-page">
    <h2>📊 日报统计</h2>
    
    <div class="filters">
      <el-date-picker 
        v-model="selectedDate" 
        type="date"
        placeholder="选择日期"
        :default-value="new Date()"
      />
      <el-select v-model="selectedStore" placeholder="选择门店" clearable>
        <el-option label="BOP店" value="BOP" />
        <el-option label="龙膜店" value="LM" />
        <el-option label="全部门店" value="" />
      </el-select>
      <el-button type="primary" @click="loadStats">查询</el-button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">线索总数</div>
        <div class="value">{{ stats.lead_count }}</div>
      </div>
      <div class="stat-card">
        <div class="label">首响数量</div>
        <div class="value">{{ stats.first_reply_count }}</div>
      </div>
      <div class="stat-card">
        <div class="label">首响率</div>
        <div class="value">{{ stats.first_reply_rate?.toFixed(1) }}%</div>
      </div>
      <div class="stat-card">
        <div class="label">加微信数量</div>
        <div class="value">{{ stats.wechat_invite_count }}</div>
      </div>
      <div class="stat-card">
        <div class="label">加微信率</div>
        <div class="value">{{ stats.wechat_invite_rate?.toFixed(1) }}%</div>
      </div>
      <div class="stat-card">
        <div class="label">成功数量</div>
        <div class="value">{{ stats.wechat_success_count }}</div>
      </div>
      <div class="stat-card">
        <div class="label">成功率</div>
        <div class="value">{{ stats.wechat_success_rate?.toFixed(1) }}%</div>
      </div>
      <div class="stat-card">
        <div class="label">1M通过率</div>
        <div class="value">{{ sla1mRate }}%</div>
      </div>
      <div class="stat-card">
        <div class="label">3M通过率</div>
        <div class="value">{{ sla3mRate }}%</div>
      </div>
    </div>

    <div class="charts-container">
      <div class="chart-box">
        <h3>各项数据对比</h3>
        <div id="chart" style="width: 100%; height: 300px"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { statsApi } from '../utils/api'
import { ElMessage } from 'element-plus'

const selectedDate = ref(new Date())
const selectedStore = ref('')
const stats = ref({
  lead_count: 0,
  first_reply_count: 0,
  first_reply_rate: 0,
  wechat_invite_count: 0,
  wechat_invite_rate: 0,
  wechat_success_count: 0,
  wechat_success_rate: 0,
  sla_1m_pass_count: 0,
  sla_3m_pass_count: 0,
})

const sla1mRate = computed(() => {
  if (stats.value.lead_count === 0) return 0
  return ((stats.value.sla_1m_pass_count / stats.value.lead_count) * 100).toFixed(1)
})

const sla3mRate = computed(() => {
  if (stats.value.lead_count === 0) return 0
  return ((stats.value.sla_3m_pass_count / stats.value.lead_count) * 100).toFixed(1)
})

onMounted(() => {
  loadStats()
})

const loadStats = async () => {
  try {
    const dateStr = selectedDate.value.toISOString().split('T')[0]
    const data = await statsApi.daily(dateStr, selectedStore.value || null)
    
    if (data.by_store) {
      // 合并所有门店的数据
      stats.value = {
        lead_count: data.by_store.reduce((sum, s) => sum + s.lead_count, 0),
        first_reply_count: data.by_store.reduce((sum, s) => sum + s.first_reply_count, 0),
        first_reply_rate: data.by_store.reduce((sum, s) => sum + s.first_reply_rate, 0) / data.by_store.length,
        wechat_invite_count: data.by_store.reduce((sum, s) => sum + s.wechat_invite_count, 0),
        wechat_invite_rate: data.by_store.reduce((sum, s) => sum + s.wechat_invite_rate, 0) / data.by_store.length,
        wechat_success_count: data.by_store.reduce((sum, s) => sum + s.wechat_success_count, 0),
        wechat_success_rate: data.by_store.reduce((sum, s) => sum + s.wechat_success_rate, 0) / data.by_store.length,
        sla_1m_pass_count: data.by_store.reduce((sum, s) => sum + s.sla_1m_pass_count, 0),
        sla_3m_pass_count: data.by_store.reduce((sum, s) => sum + s.sla_3m_pass_count, 0),
      }
    } else {
      stats.value = data
    }
  } catch (error) {
    ElMessage.error('加载统计失败')
  }
}
</script>

<style scoped>
.stats-page {
  padding: 20px;
}

.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.filters > * {
  min-width: 150px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.stat-card .label {
  font-size: 12px;
  color: #666;
  margin-bottom: 10px;
}

.stat-card .value {
  font-size: 28px;
  font-weight: bold;
  color: #409eff;
}

.charts-container {
  background: white;
  padding: 20px;
  border-radius: 4px;
}

.chart-box h3 {
  margin-bottom: 15px;
}
</style>
