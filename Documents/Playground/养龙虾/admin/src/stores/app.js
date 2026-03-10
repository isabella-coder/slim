/**
 * Pinia 状态管理 - 应用状态
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  // 状态
  const user = ref(null)
  const token = ref(localStorage.getItem('token') || '')
  const isLoading = ref(false)

  // 方法
  const setUser = (newUser) => {
    user.value = newUser
  }

  const setToken = (newToken) => {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  const logout = () => {
    user.value = null
    token.value = ''
    localStorage.removeItem('token')
  }

  const setLoading = (loading) => {
    isLoading.value = loading
  }

  return {
    // 状态
    user,
    token,
    isLoading,
    // 方法
    setUser,
    setToken,
    logout,
    setLoading,
  }
})
