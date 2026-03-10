<template>
  <div class="leads-page">
    <div class="header">
      <h2>📋 线索中心</h2>
      <div class="filters">
        <el-select v-model="filters.store_code" placeholder="选择门店" clearable>
          <el-option label="BOP店" value="BOP" />
          <el-option label="龙膜店" value="LM" />
        </el-select>
        <el-select v-model="filters.status" placeholder="选择状态" clearable>
          <el-option label="已创建" value="created" />
          <el-option label="已分配" value="assigned" />
          <el-option label="已首响" value="first_reply" />
          <el-option label="已邀请加微信" value="wechat_invited" />
          <el-option label="已完成" value="completed" />
        </el-select>
        <el-button type="primary" @click="loadLeads">搜索</el-button>
      </div>
    </div>

    <div class="stats-cards">
      <div class="stat-card">
        <span class="label">今日线索</span>
        <span class="value">{{ todayStats.lead_count }}</span>
      </div>
      <div class="stat-card">
        <span class="label">首响率</span>
        <span class="value">{{ todayStats.first_reply_rate?.toFixed(1) }}%</span>
      </div>
      <div class="stat-card">
        <span class="label">微信率</span>
        <span class="value">{{ todayStats.wechat_success_rate?.toFixed(1) }}%</span>
      </div>
    </div>

    <div class="table-container">
      <el-table :data="leads" stripe style="width: 100%">
        <el-table-column prop="lead_id" label="线索ID" width="150" />
        <el-table-column prop="customer_nickname" label="客户" width="100" />
        <el-table-column prop="car_model" label="车型" width="100" />
        <el-table-column prop="service_type" label="服务" width="100" />
        <el-table-column prop="budget_range" label="预算" width="100" />
        <el-table-column prop="platform" label="来源" width="80">
          <template #default="{ row }">
            <el-tag :type="row.platform === 'douyin' ? 'success' : 'info'">
              {{ row.platform === 'douyin' ? '抖音' : '小红书' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="assigned_to" label="分配销售" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="wechat_status" label="微信状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getWechatType(row.wechat_status)">
              {{ getWechatLabel(row.wechat_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewDetail(row.lead_id)">详情</el-button>
            <el-button link type="success" @click="handleFirstReply(row.lead_id)" 
              v-if="row.status === 'assigned'">首响</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="total"
        layout="total, sizes, prev, pager, next"
        @change="loadLeads"
        style="margin-top: 20px; text-align: right"
      />
    </div>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailVisible" title="线索详情" width="70%">
      <div v-if="currentLead" class="detail-content">
        <div class="detail-item">
          <span class="label">线索ID:</span>
          <span class="value">{{ currentLead.lead_id }}</span>
        </div>
        <div class="detail-item">
          <span class="label">客户昵称:</span>
          <span class="value">{{ currentLead.customer_nickname }}</span>
        </div>
        <div class="detail-item">
          <span class="label">车型:</span>
          <span class="value">{{ currentLead.car_model }}</span>
        </div>
        <div class="detail-item">
          <span class="label">服务:</span>
          <span class="value">{{ currentLead.service_type }}</span>
        </div>
        <div class="detail-item">
          <span class="label">预算:</span>
          <span class="value">{{ currentLead.budget_range }}</span>
        </div>
        <div class="detail-item">
          <span class="label">来源渠道:</span>
          <span class="value">{{ currentLead.platform }} / {{ currentLead.account_code }}</span>
        </div>
        <div class="detail-item">
          <span class="label">分配销售:</span>
          <span class="value">{{ currentLead.assigned_to }}</span>
        </div>
        <div class="detail-item">
          <span class="label">分配时间:</span>
          <span class="value">{{ formatTime(currentLead.assigned_at) }}</span>
        </div>
        <div class="detail-item">
          <span class="label">微信状态:</span>
          <el-tag :type="getWechatType(currentLead.wechat_status)">
            {{ getWechatLabel(currentLead.wechat_status) }}
          </el-tag>
        </div>
        <div class="detail-item">
          <span class="label">聊天摘要:</span>
          <div class="summary">{{ currentLead.conversation_summary }}</div>
        </div>

        <!-- 操作按钮 -->
        <div class="actions">
          <el-button 
            type="primary" 
            @click="recordFirstReply" 
            v-if="currentLead.status === 'assigned'">
            记录首响
          </el-button>
          <el-button 
            type="primary" 
            @click="recordWechatInvite" 
            v-if="currentLead.status === 'first_reply'">
            发起加微信
          </el-button>
          <el-button 
            type="primary" 
            @click="updateWechatStatus" 
            v-if="currentLead.status === 'wechat_invited'">
            确认微信状态
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 操作对话框 -->
    <el-dialog v-model="actionDialogVisible" :title="actionTitle" width="40%">
      <div v-if="actionType === 'wechat'" class="action-form">
        <el-form-item label="微信状态">
          <el-select v-model="wechatStatus">
            <el-option label="已加上微信" value="success" />
            <el-option label="拒绝加微信" value="refused" />
            <el-option label="加微信失败" value="failed" />
            <el-option label="继续平台沟通" value="continued" />
          </el-select>
        </el-form-item>
      </div>
      <template #footer>
        <el-button @click="actionDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAction">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { leadApi, statsApi } from '../utils/api'
import { ElMessage } from 'element-plus'

const leads = ref([])
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const detailVisible = ref(false)
const actionDialogVisible = ref(false)
const currentLead = ref(null)
const todayStats = ref({})
const filters = ref({ store_code: null, status: null })
const actionType = ref('')
const actionTitle = ref('')
const wechatStatus = ref('')

onMounted(() => {
  loadLeads()
  loadTodayStats()
})

const loadLeads = async () => {
  try {
    const data = await leadApi.list({
      page: currentPage.value,
      page_size: pageSize.value,
      store_code: filters.value.store_code,
      status: filters.value.status
    })
    leads.value = data.items
    total.value = data.total
  } catch (error) {
    ElMessage.error('加载线索失败')
  }
}

const loadTodayStats = async () => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const data = await statsApi.daily(today)
    todayStats.value = data.by_store?.[0] || data
  } catch (error) {
    console.error('加载统计失败', error)
  }
}

const viewDetail = async (leadId) => {
  try {
    const data = await leadApi.get(leadId)
    currentLead.value = data
    detailVisible.value = true
  } catch (error) {
    ElMessage.error('加载详情失败')
  }
}

const recordFirstReply = async () => {
  try {
    await leadApi.firstReply(currentLead.value.lead_id)
    currentLead.value.status = 'first_reply'
    ElMessage.success('首响已记录')
    loadLeads()
  } catch (error) {
    ElMessage.error('记录首响失败')
  }
}

const recordWechatInvite = async () => {
  try {
    await leadApi.wechatInvite(currentLead.value.lead_id)
    currentLead.value.status = 'wechat_invited'
    ElMessage.success('已发起加微信')
    loadLeads()
  } catch (error) {
    ElMessage.error('发起加微信失败')
  }
}

const updateWechatStatus = () => {
  actionType.value = 'wechat'
  actionTitle.value = '确认微信状态'
  actionDialogVisible.value = true
}

const submitAction = async () => {
  try {
    await leadApi.updateWechatStatus(currentLead.value.lead_id, wechatStatus.value)
    currentLead.value.wechat_status = wechatStatus.value
    ElMessage.success('微信状态已更新')
    actionDialogVisible.value = false
    loadLeads()
  } catch (error) {
    ElMessage.error('更新失败')
  }
}

const handleFirstReply = async (leadId) => {
  try {
    await leadApi.firstReply(leadId)
    ElMessage.success('首响已记录')
    loadLeads()
  } catch (error) {
    ElMessage.error('记录首响失败')
  }
}

const getStatusType = (status) => {
  const types = {
    'created': 'info',
    'assigned': 'warning',
    'first_reply': 'success',
    'wechat_invited': 'success',
    'completed': ''
  }
  return types[status] || ''
}

const getStatusLabel = (status) => {
  const labels = {
    'created': '待分配',
    'assigned': '待首响',
    'first_reply': '待加微信',
    'wechat_invited': '确认中',
    'completed': '已完成'
  }
  return labels[status] || status
}

const getWechatType = (status) => {
  const types = {
    'pending': 'info',
    'success': 'success',
    'refused': 'danger',
    'failed': 'warning'
  }
  return types[status] || ''
}

const getWechatLabel = (status) => {
  const labels = {
    'pending': '未发起',
    'invited': '已发起',
    'customer_sent': '客户已发微信号',
    'sales_sent': '销售已发微信号',
    'success': '已加上微信',
    'refused': '拒绝加微信',
    'failed': '加微信失败'
  }
  return labels[status] || status
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}
</script>

<style scoped>
.leads-page {
  padding: 20px;
}

.header {
  margin-bottom: 20px;
}

.header h2 {
  margin-bottom: 15px;
}

.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.filters > * {
  min-width: 150px;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-bottom: 20px;
}

.stat-card {
  background: white;
  padding: 15px;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-card .label {
  color: #666;
  font-size: 14px;
}

.stat-card .value {
  font-size: 24px;
  font-weight: bold;
  color: #409eff;
}

.table-container {
  background: white;
  padding: 20px;
  border-radius: 4px;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.detail-item {
  display: flex;
  gap: 15px;
  align-items: flex-start;
}

.detail-item .label {
  font-weight: bold;
  color: #333;
  min-width: 100px;
}

.detail-item .value {
  color: #666;
}

.summary {
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  color: #666;
  line-height: 1.6;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.action-form {
  padding: 20px 0;
}
</style>
