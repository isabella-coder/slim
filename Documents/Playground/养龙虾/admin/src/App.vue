<template>
  <div id="app">
    <div class="app-layout">
      <!-- 侧边栏 -->
      <el-menu
        :collapse="isCollapse"
        class="app-sidebar"
        :default-active="activeMenu"
      >
        <el-menu-item index="/" @click="goTo('/')">
          <span>🏠 首页</span>
        </el-menu-item>
        
        <el-sub-menu index="1">
          <template #title>
            <span>⚙️ 系统管理</span>
          </template>
          <el-menu-item index="/accounts" @click="goTo('/accounts')">账号管理</el-menu-item>
          <el-menu-item index="/sales" @click="goTo('/sales')">销售管理</el-menu-item>
          <el-menu-item index="/settings" @click="goTo('/settings')">系统设置</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="2">
          <template #title>
            <span>📋 业务中心</span>
          </template>
          <el-menu-item index="/leads" @click="goTo('/leads')">线索中心</el-menu-item>
          <el-menu-item index="/allocation" @click="goTo('/allocation')">分配管理</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="3">
          <template #title>
            <span>📊 报表分析</span>
          </template>
          <el-menu-item index="/stats/daily" @click="goTo('/stats/daily')">日报</el-menu-item>
          <el-menu-item index="/stats/sales" @click="goTo('/stats/sales')">销售统计</el-menu-item>
          <el-menu-item index="/stats/sla" @click="goTo('/stats/sla')">SLA 统计</el-menu-item>
        </el-sub-menu>
      </el-menu>

      <!-- 主内容 -->
      <div class="app-content">
        <div class="app-header">
          <el-button @click="isCollapse = !isCollapse">
            {{ isCollapse ? '展开' : '收起' }}
          </el-button>
          <div class="breadcrumb">
            {{ $route.name || '首页' }}
          </div>
          <div class="user-menu">
            <span>Admin</span>
            <el-dropdown @command="handleCommand">
              <span class="user-button">
                👤
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">个人信息</el-dropdown-item>
                  <el-dropdown-item command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <div class="app-main">
          <router-view />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const isCollapse = ref(false)
const activeMenu = ref('/')

const goTo = (path) => {
  router.push(path)
  activeMenu.value = path
}

const handleCommand = (command) => {
  if (command === 'logout') {
    alert('已退出登录')
    // TODO: 清除登录信息，重定向到登录页面
  }
}
</script>

<style scoped>
#app {
  width: 100%;
  height: 100vh;
}

.app-layout {
  display: flex;
  height: 100%;
}

.app-sidebar {
  width: 200px;
  overflow-y: auto;
  border-right: 1px solid #e0e0e0;
}

.app-sidebar.el-menu--collapse {
  width: 64px;
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 60px;
  padding: 0 20px;
  border-bottom: 1px solid #e0e0e0;
  background-color: #f5f7fa;
}

.breadcrumb {
  flex: 1;
  font-size: 14px;
  color: #666;
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-button {
  cursor: pointer;
  font-size: 18px;
}

.app-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: #f5f7fa;
}
</style>
