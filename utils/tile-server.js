const PLUGIN_NAME = 'tile-server'

function resolvePlugin() {
  if (typeof uni === 'undefined' || typeof uni.requireNativePlugin !== 'function') {
    return null
  }

  try {
    return uni.requireNativePlugin(PLUGIN_NAME)
  } catch (error) {
    console.warn('[TileServer] 原生插件不可用:', error)
    return null
  }
}

export function checkTilePath(path) {
  const plugin = resolvePlugin()
  const value = String(path || '').trim()

  if (!value) {
    return Promise.resolve(false)
  }

  if (!plugin || typeof plugin.checkPath !== 'function') {
    console.warn('[TileServer] 当前环境缺少原生插件, 路径检查退化为非空判断')
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    try {
      plugin.checkPath({ path: value }, (result) => {
        resolve(Boolean(result && result.exists))
      })
    } catch (error) {
      console.warn('[TileServer] checkPath 调用失败:', error)
      resolve(false)
    }
  })
}

export function startTileServer({ port, basePath }) {
  const plugin = resolvePlugin()

  if (!plugin || typeof plugin.start !== 'function') {
    return Promise.resolve({
      success: false,
      message: '原生插件不可用'
    })
  }

  return new Promise((resolve) => {
    try {
      plugin.start({
        port,
        basePath
      }, (result) => {
        if (result && typeof result === 'object') {
          resolve(result)
          return
        }

        resolve({
          success: Boolean(result)
        })
      })
    } catch (error) {
      console.warn('[TileServer] start 调用失败:', error)
      resolve({
        success: false,
        message: error && error.message ? error.message : String(error)
      })
    }
  })
}

export function stopTileServer() {
  const plugin = resolvePlugin()

  if (!plugin || typeof plugin.stop !== 'function') {
    return Promise.resolve({
      success: true
    })
  }

  try {
    const result = plugin.stop()
    if (result && typeof result.then === 'function') {
      return result
        .then(() => ({ success: true }))
        .catch((error) => ({
          success: false,
          message: error && error.message ? error.message : String(error)
        }))
    }
  } catch (error) {
    return Promise.resolve({
      success: false,
      message: error && error.message ? error.message : String(error)
    })
  }

  return Promise.resolve({
    success: true
  })
}
