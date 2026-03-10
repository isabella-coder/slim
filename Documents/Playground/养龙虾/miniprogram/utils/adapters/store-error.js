function normalizeErrorMessage(error, fallbackText) {
  const message = String((error && error.message) || '').trim()
  return message || String(fallbackText || 'Request failed')
}

function isVersionConflictError(error) {
  const code = String((error && error.code) || '').toUpperCase()
  const message = String((error && error.message) || '').toLowerCase()
  return code === 'ORDER_VERSION_CONFLICT' || /version|conflict|\u7248\u672c|\u51b2\u7a81/.test(message)
}

function getCurrentVersion(error) {
  const version = Number(error && error.currentVersion)
  if (Number.isFinite(version)) {
    return version
  }
  const responseVersion = Number(error && error.response && error.response.currentVersion)
  if (Number.isFinite(responseVersion)) {
    return responseVersion
  }
  return null
}

module.exports = {
  normalizeErrorMessage,
  isVersionConflictError,
  getCurrentVersion,
}
