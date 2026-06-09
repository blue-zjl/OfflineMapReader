<template>
  <view class="page">
    <view class="map-host" id="mapHost"></view>

    <view class="actions">
      <view class="action-btn" @click="handleLocate">📍</view>
      <view class="action-btn" @click="handleOpenSetting">⚙</view>
    </view>

    <view v-if="statusText" class="status-tip">
      <text>{{ statusText }}</text>
    </view>
  </view>
</template>

<script>
import {
  buildMapUrl,
  DEFAULT_CENTER,
  readConfig,
  updateLastLocation
} from '../../utils/config.js'
import {
  startTileServer,
  stopTileServer
} from '../../utils/tile-server.js'

export default {
  data() {
    return {
      config: null,
      mapWebview: null,
      mapReady: false,
      pendingScripts: [],
      boundMessageHandler: null,
      tileErrorShown: false,
      locationPending: false,
      serviceFailed: false,
      statusText: '正在初始化地图…'
    }
  },
  onShow() {
    this.bootstrap()
  },
  onHide() {
    this.cleanup()
  },
  onUnload() {
    this.cleanup()
  },
  methods: {
    bootstrap() {
      const config = readConfig()
      this.config = config

      if (!config.hasConfig) {
        uni.reLaunch({
          url: '/pages/setting/setting'
        })
        return
      }

      this.statusText = '正在启动瓦片服务…'
      this.tileErrorShown = false
      this.ensureMessageBridge()
      this.startFlow()
    },
    ensureMessageBridge() {
      if (!this.boundMessageHandler) {
        this.boundMessageHandler = this.handleMapMessage.bind(this)
      }

      window.__handleMapMessage = this.boundMessageHandler
    },
    async startFlow() {
      const result = await startTileServer({
        port: this.config.port,
        basePath: this.config.tileBasePath
      })

      console.log('[MapPage] TileServer start 结果:', result)

      if (!result || result.success === false) {
        const message = (result && result.message) || '瓦片服务启动失败'
        console.warn('[MapPage] TileServer 启动失败:', message)
        this.serviceFailed = true
        this.statusText = message
        uni.showToast({
          title: '瓦片服务启动失败',
          icon: 'none'
        })
      } else {
        this.serviceFailed = false
        this.statusText = '正在加载地图…'
      }

      this.createMapWebview()
      this.requestLocation()
    },
    createMapWebview() {
      if (typeof plus === 'undefined' || !plus.webview) {
        this.statusText = '当前环境不支持 WebView'
        return
      }

      this.destroyMapWebview()

      const url = buildMapUrl(this.config)
      console.log('[MapPage] WebView URL:', url)

      const currentWebview = plus.webview.currentWebview()
      const childWebview = plus.webview.create(url, 'offline-map-webview', {
        top: '0px',
        bottom: '0px',
        left: '0px',
        right: '0px',
        background: '#ffffff'
      })

      const onLoaded = () => {
        console.log('[MapPage] WebView 创建完成, 等待 UniAppJSBridgeReady')
        this.mapReady = true
        this.flushPendingScripts()
      }

      const onMessage = (event) => {
        this.handleMapMessage(event)
      }

      childWebview.addEventListener('loaded', onLoaded, false)
      childWebview.addEventListener('message', onMessage, false)
      childWebview.addEventListener('onMessage', onMessage, false)

      currentWebview.append(childWebview)
      childWebview.show()
      this.mapWebview = childWebview
    },
    destroyMapWebview() {
      if (!this.mapWebview) {
        this.mapReady = false
        return
      }

      try {
        this.mapWebview.close()
      } catch (error) {
        console.warn('[MapPage] 关闭 WebView 失败:', error)
      }

      this.mapWebview = null
      this.mapReady = false
      this.pendingScripts = []
    },
    cleanup() {
      this.destroyMapWebview()
      stopTileServer().then((result) => {
        console.log('[MapPage] TileServer stop 结果:', result)
      })

      if (window.__handleMapMessage === this.boundMessageHandler) {
        delete window.__handleMapMessage
      }
    },
    handleMapMessage(event) {
      const payload = this.extractMessagePayload(event)
      if (!payload) {
        return
      }

      console.log('[MapPage] WebView 消息:', payload)

      if (payload.action === 'tileerror') {
        if (this.serviceFailed) {
          return
        }

        if (!this.tileErrorShown) {
          this.tileErrorShown = true
          this.statusText = payload.message || '瓦片数据不可用，请检查存储路径'
          uni.showToast({
            title: this.statusText,
            icon: 'none',
            duration: 2500
          })
        }
      }
    },
    extractMessagePayload(event) {
      if (!event) {
        return null
      }

      const data = event.data ?? event.detail ?? event.message ?? event
      if (!data) {
        return null
      }

      if (data.data && typeof data.data === 'object') {
        return data.data
      }

      if (data.action) {
        return data
      }

      if (typeof data === 'string') {
        try {
          return JSON.parse(data)
        } catch (error) {
          return {
            message: data
          }
        }
      }

      return data.data || null
    },
    queueMapScript(script) {
      if (!script) {
        return
      }

      if (this.mapWebview && this.mapReady) {
        try {
          this.mapWebview.evalJS(script)
        } catch (error) {
          console.warn('[MapPage] evalJS 失败, 已加入队列:', error)
          this.pendingScripts.push(script)
        }
        return
      }

      this.pendingScripts.push(script)
    },
    flushPendingScripts() {
      if (!this.mapWebview || !this.mapReady || this.pendingScripts.length === 0) {
        return
      }

      const scripts = this.pendingScripts.splice(0, this.pendingScripts.length)
      scripts.forEach((script) => {
        try {
          this.mapWebview.evalJS(script)
        } catch (error) {
          console.warn('[MapPage] 执行延迟脚本失败:', error)
        }
      })
    },
    syncMapView() {
      if (!this.config) {
        return
      }

      this.moveTo(this.config.lastLat, this.config.lastLng, this.config.defaultZoom)
    },
    moveTo(lat, lng, zoom) {
      const nextLat = Number(lat)
      const nextLng = Number(lng)
      const nextZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : this.config.defaultZoom

      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
        return
      }

      const script = `window.moveTo(${JSON.stringify(nextLat)}, ${JSON.stringify(nextLng)}, ${JSON.stringify(nextZoom)})`
      this.queueMapScript(script)
    },
    async requestLocation() {
      if (!this.config) {
        return
      }

      console.log('[MapPage] 获取 GPS...')
      this.locationPending = true

      try {
        const location = await uni.getLocation({
          type: 'gcj02'
        })

        console.log('[MapPage] GPS 成功:', location.latitude, location.longitude)
        updateLastLocation(location.latitude, location.longitude)
        if (!this.serviceFailed) {
          this.statusText = ''
        }
        this.moveTo(location.latitude, location.longitude, this.config.defaultZoom)
      } catch (error) {
        console.warn('[MapPage] GPS 失败: %s, 回退上次坐标', error)
        const lastLat = Number.isFinite(Number(this.config.lastLat)) ? Number(this.config.lastLat) : DEFAULT_CENTER.lat
        const lastLng = Number.isFinite(Number(this.config.lastLng)) ? Number(this.config.lastLng) : DEFAULT_CENTER.lng
        this.statusText = 'GPS 定位失败，已回退到保存坐标'
        this.moveTo(lastLat, lastLng, this.config.defaultZoom)
      } finally {
        this.locationPending = false
      }
    },
    handleLocate() {
      console.log('[MapPage] 点击定位按钮')
      this.requestLocation()
    },
    handleOpenSetting() {
      console.log('[MapPage] 点击设置按钮')
      uni.navigateTo({
        url: '/pages/setting/setting'
      })
    }
  }
}
</script>

<style lang="scss">
.page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #ffffff;
}

.map-host {
  position: absolute;
  inset: 0;
}

.actions {
  position: fixed;
  top: calc(var(--status-bar-height) + 24rpx);
  right: 24rpx;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  border-radius: 44rpx;
  background: rgba(15, 23, 42, 0.72);
  color: #ffffff;
  font-size: 40rpx;
  box-shadow: 0 16rpx 30rpx rgba(15, 23, 42, 0.2);
}

.status-tip {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: 32rpx;
  z-index: 20;
  padding: 20rpx 24rpx;
  border-radius: 18rpx;
  background: rgba(15, 23, 42, 0.72);
  color: #ffffff;
  font-size: 26rpx;
  line-height: 1.7;
}
</style>
