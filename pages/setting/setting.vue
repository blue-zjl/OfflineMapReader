<template>
  <view class="page">
    <scroll-view class="scroll" scroll-y>
      <view class="card">
        <text class="title">高德离线地图配置</text>
        <text class="subtitle">首次启动请填写瓦片根目录，路径需对应 {z}/{x}/{y}.png 的金字塔结构。</text>

        <view class="field">
          <text class="label">瓦片存储路径</text>
          <input
            v-model="form.tileBasePath"
            class="input"
            type="text"
            placeholder="/storage/XXXX-XXXX/tiles/"
            confirm-type="done"
          />
          <text class="hint">示例：/storage/emulated/0/GaodeTiles/</text>
        </view>

        <view class="grid">
          <view class="field half">
            <text class="label">最小层级</text>
            <input
              v-model="form.minZoom"
              class="input center"
              type="number"
              placeholder="9"
            />
          </view>

          <view class="field half">
            <text class="label">最大层级</text>
            <input
              v-model="form.maxZoom"
              class="input center"
              type="number"
              placeholder="17"
            />
          </view>
        </view>

        <view class="field">
          <text class="label">默认加载层级</text>
          <input
            v-model="form.defaultZoom"
            class="input center"
            type="number"
            placeholder="12"
          />
        </view>

        <button class="save-btn" :loading="saving" @click="handleSave">保存并进入地图</button>

        <view class="note">
          <text>提示：地图仅支持 Android 5+App，进入地图后会自动定位，失败则回退到上次坐标。</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { readConfig, saveConfig } from '../../utils/config.js'
import { checkTilePath } from '../../utils/tile-server.js'

export default {
  data() {
    return {
      saving: false,
      currentConfig: null,
      form: {
        tileBasePath: '',
        minZoom: 9,
        maxZoom: 17,
        defaultZoom: 12
      }
    }
  },
  onShow() {
    this.syncForm()
  },
  methods: {
    syncForm() {
      const config = readConfig()
      this.currentConfig = config
      this.form = {
        tileBasePath: config.tileBasePath || '',
        minZoom: config.minZoom,
        maxZoom: config.maxZoom,
        defaultZoom: config.defaultZoom
      }
    },
    toNumber(value, fallback) {
      const next = Number(value)
      return Number.isFinite(next) ? Math.trunc(next) : fallback
    },
    toast(title) {
      uni.showToast({
        title,
        icon: 'none'
      })
    },
    async handleSave() {
      if (this.saving) {
        return
      }

      const tileBasePath = String(this.form.tileBasePath || '').trim()
      const minZoom = this.toNumber(this.form.minZoom, 9)
      const maxZoom = this.toNumber(this.form.maxZoom, 17)
      const defaultZoom = this.toNumber(this.form.defaultZoom, 12)

      if (!tileBasePath) {
        this.toast('请输入瓦片存储路径')
        return
      }

      if (minZoom > maxZoom) {
        this.toast('最小层级不能大于最大层级')
        return
      }

      if (defaultZoom < minZoom || defaultZoom > maxZoom) {
        this.toast('默认层级需在最小/最大层级范围内')
        return
      }

      this.saving = true
      try {
        console.log('[Setting] 校验路径:', tileBasePath)
        const exists = await checkTilePath(tileBasePath)
        console.log('[Setting] 原生插件 checkPath 返回:', exists)

        if (!exists) {
          this.toast('路径不存在')
          return
        }

        saveConfig({
          tileBasePath,
          minZoom,
          maxZoom,
          defaultZoom,
          port: 18888
        })

        console.log('[Setting] 保存成功, 即将跳转到地图页')
        uni.reLaunch({
          url: '/pages/map/map'
        })
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style lang="scss">
.page {
  min-height: 100vh;
  background: #f5f7fb;
}

.scroll {
  height: 100vh;
}

.card {
  margin: 32rpx;
  padding: 32rpx;
  border-radius: 24rpx;
  background: #ffffff;
  box-shadow: 0 16rpx 40rpx rgba(15, 23, 42, 0.08);
}

.title {
  display: block;
  font-size: 40rpx;
  font-weight: 600;
  color: #0f172a;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  line-height: 1.7;
  color: #64748b;
}

.field {
  margin-top: 28rpx;
}

.label {
  display: block;
  margin-bottom: 14rpx;
  font-size: 28rpx;
  color: #334155;
}

.input {
  width: 100%;
  box-sizing: border-box;
  padding: 22rpx 24rpx;
  border: 1rpx solid #e2e8f0;
  border-radius: 16rpx;
  background: #f8fafc;
  font-size: 30rpx;
  color: #0f172a;
}

.center {
  text-align: center;
}

.hint {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #94a3b8;
}

.grid {
  display: flex;
  gap: 24rpx;
}

.half {
  flex: 1;
}

.save-btn {
  margin-top: 36rpx;
  border: none;
  border-radius: 18rpx;
  background: #1677ff;
  color: #ffffff;
  font-size: 32rpx;
}

.note {
  margin-top: 24rpx;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  background: #eef4ff;
  color: #2563eb;
  font-size: 24rpx;
  line-height: 1.7;
}
</style>
