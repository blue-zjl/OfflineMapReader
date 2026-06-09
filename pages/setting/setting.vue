<template>
  <view class="page">
    <view class="card">
      <text class="title">高德离线地图配置</text>
      <text class="subtitle"
        >首次启动请填写瓦片根目录，路径需对应 {z}/{x}/{y}.png
        的金字塔结构。</text
      >

      <view class="field">
        <text class="label">瓦片存储路径</text>
        <view class="path-box" @tap="openDirectoryBrowser">
          <text class="path-text">{{
            tileBasePath || "点击选择瓦片目录"
          }}</text>
        </view>
        <view class="path-actions">
          <view class="secondary-btn" @tap="openDirectoryBrowser"
            >浏览目录</view
          >
          <view
            class="secondary-btn"
            :class="{ disabled: !tileBasePath }"
            @tap="clearPath"
            >清空路径</view
          >
        </view>
        <text class="hint"
          >Android 端直接浏览真实目录，选择后会回填目录路径。</text
        >
      </view>

      <view class="field">
        <text class="label">最小层级</text>
        <view class="stepper">
          <view class="step-btn" @tap="changeZoom('min', -1)">-</view>
          <text class="step-value">{{ minZoom }}</text>
          <view class="step-btn" @tap="changeZoom('min', 1)">+</view>
        </view>
      </view>

      <view class="field">
        <text class="label">最大层级</text>
        <view class="stepper">
          <view class="step-btn" @tap="changeZoom('max', -1)">-</view>
          <text class="step-value">{{ maxZoom }}</text>
          <view class="step-btn" @tap="changeZoom('max', 1)">+</view>
        </view>
      </view>

      <view class="field">
        <text class="label">默认加载层级</text>
        <view class="stepper">
          <view class="step-btn" @tap="changeZoom('default', -1)">-</view>
          <text class="step-value">{{ defaultZoom }}</text>
          <view class="step-btn" @tap="changeZoom('default', 1)">+</view>
        </view>
      </view>

      <view class="save-btn" :class="{ disabled: saving }" @tap="handleSave">{{
        saving ? "保存中…" : "保存并进入地图"
      }}</view>

      <view class="note">
        <text
          >提示：地图仅支持 Android
          5+App，进入地图后会自动定位，失败则回退到上次坐标。</text
        >
      </view>
    </view>

    <view
      v-if="browserVisible"
      class="browser-mask"
      @tap="closeDirectoryBrowser"
    >
      <view class="browser-panel" @tap.stop>
        <view class="browser-header">
          <text class="browser-title">选择瓦片目录</text>
          <view class="browser-close" @tap="closeDirectoryBrowser">关闭</view>
        </view>

        <text class="browser-path">{{ browserCurrentPath || "/" }}</text>

        <view class="browser-toolbar">
          <view
            class="toolbar-btn"
            :class="{ disabled: browsing || !browserParentPath }"
            @tap="goParentDirectory"
            >上一级</view
          >
          <view
            class="toolbar-btn primary"
            :class="{ disabled: browsing || !browserCurrentPath }"
            @tap="selectCurrentDirectory"
            >选择当前目录</view
          >
        </view>

        <scroll-view class="browser-list" scroll-y>
          <view v-if="browsing" class="browser-state">正在读取目录…</view>
          <view
            v-else-if="browserDirectories.length === 0"
            class="browser-state"
            >当前目录下没有可读子目录</view
          >
          <view
            v-for="item in browserDirectories"
            :key="item.path"
            class="browser-item"
            @tap="enterDirectory(item.path)"
          >
            <text class="browser-item-name">{{ item.name }}</text>
            <text class="browser-item-arrow">›</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script>
import { readConfig, saveConfig } from "../../utils/config.js";
import { checkTilePath, listTileDirectories } from "../../utils/tile-server.js";

const ROOT_BROWSER_PATH = "/storage/";
const MIN_ALLOWED_ZOOM = 0;
const MAX_ALLOWED_ZOOM = 22;

export default {
  data() {
    return {
      saving: false,
      tileBasePath: "",
      minZoom: 9,
      maxZoom: 17,
      defaultZoom: 12,
      browserVisible: false,
      browsing: false,
      browserCurrentPath: ROOT_BROWSER_PATH,
      browserParentPath: "",
      browserDirectories: [],
    };
  },
  onShow() {
    this.syncForm();
  },
  methods: {
    syncForm() {
      const config = readConfig();
      this.tileBasePath = config.tileBasePath || "";
      this.minZoom = Number(config.minZoom);
      this.maxZoom = Number(config.maxZoom);
      this.defaultZoom = Number(config.defaultZoom);
    },
    toast(title) {
      uni.showToast({
        title,
        icon: "none",
      });
    },
    normalizeDirectoryPath(rawPath) {
      const next = String(rawPath || "")
        .trim()
        .replace(/\\/g, "/");
      if (!next) {
        return "";
      }
      return next.endsWith("/") ? next : `${next}/`;
    },
    normalizeDirectoryList(list) {
      if (Array.isArray(list)) {
        return list;
      }

      if (!list || typeof list !== "object") {
        return [];
      }

      return Object.keys(list)
        .filter((key) => key !== "length")
        .map((key) => list[key])
        .filter(Boolean);
    },
    clearPath() {
      if (!this.tileBasePath) {
        return;
      }
      this.tileBasePath = "";
    },
    async openDirectoryBrowser() {
      this.browserVisible = true;
      await this.loadDirectory(this.tileBasePath || ROOT_BROWSER_PATH);
    },
    closeDirectoryBrowser() {
      if (this.browsing) {
        return;
      }
      this.browserVisible = false;
    },
    async loadDirectory(path) {
      this.browsing = true;
      try {
        const result = await listTileDirectories(
          this.normalizeDirectoryPath(path) || ROOT_BROWSER_PATH,
        );
        if (!result.success) {
          this.toast(result.message || "目录读取失败");
          return;
        }

        this.browserCurrentPath =
          this.normalizeDirectoryPath(result.currentPath) || ROOT_BROWSER_PATH;
        this.browserParentPath = this.normalizeDirectoryPath(result.parentPath);
        this.browserDirectories = this.normalizeDirectoryList(
          result.directories,
        );
      } finally {
        this.browsing = false;
      }
    },
    enterDirectory(path) {
      if (!path || this.browsing) {
        return;
      }
      this.loadDirectory(path);
    },
    goParentDirectory() {
      if (!this.browserParentPath || this.browsing) {
        return;
      }
      this.loadDirectory(this.browserParentPath);
    },
    selectCurrentDirectory() {
      if (!this.browserCurrentPath || this.browsing) {
        return;
      }
      this.tileBasePath = this.normalizeDirectoryPath(this.browserCurrentPath);
      this.browserVisible = false;
    },
    clampZoom(value) {
      return Math.min(Math.max(value, MIN_ALLOWED_ZOOM), MAX_ALLOWED_ZOOM);
    },
    changeZoom(field, delta) {
      if (field === "min") {
        const nextMin = this.clampZoom(this.minZoom + delta);
        this.minZoom = Math.min(nextMin, this.maxZoom);
        if (this.defaultZoom < this.minZoom) {
          this.defaultZoom = this.minZoom;
        }
        return;
      }

      if (field === "max") {
        const nextMax = this.clampZoom(this.maxZoom + delta);
        this.maxZoom = Math.max(nextMax, this.minZoom);
        if (this.defaultZoom > this.maxZoom) {
          this.defaultZoom = this.maxZoom;
        }
        return;
      }

      const nextDefault = this.clampZoom(this.defaultZoom + delta);
      this.defaultZoom = Math.min(
        Math.max(nextDefault, this.minZoom),
        this.maxZoom,
      );
    },
    async handleSave() {
      if (this.saving) {
        return;
      }

      const tileBasePath = this.normalizeDirectoryPath(this.tileBasePath);
      if (!tileBasePath) {
        this.toast("请选择瓦片存储路径");
        return;
      }

      this.saving = true;
      try {
        console.log("[Setting] 校验路径:", tileBasePath);
        const exists = await checkTilePath(tileBasePath);
        console.log("[Setting] 原生插件 checkPath 返回:", exists);

        if (!exists) {
          this.toast("路径不存在");
          return;
        }

        saveConfig({
          tileBasePath,
          minZoom: this.minZoom,
          maxZoom: this.maxZoom,
          defaultZoom: this.defaultZoom,
          port: 18888,
        });

        console.log("[Setting] 保存成功, 即将跳转到地图页");
        uni.reLaunch({
          url: "/pages/map/map",
        });
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style lang="scss">
.page {
  min-height: 100vh;
  padding: 32rpx;
  box-sizing: border-box;
  background: #f5f7fb;
}

.card {
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

.path-box {
  min-height: 108rpx;
  padding: 22rpx 24rpx;
  border: 1rpx solid #e2e8f0;
  border-radius: 16rpx;
  background: #f8fafc;
  box-sizing: border-box;
}

.path-text {
  font-size: 28rpx;
  line-height: 1.7;
  color: #0f172a;
  word-break: break-all;
}

.path-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
}

.secondary-btn {
  padding: 14rpx 24rpx;
  border-radius: 999rpx;
  background: #e0efff;
  color: #1677ff;
  font-size: 24rpx;
}

.secondary-btn.disabled {
  opacity: 0.45;
}

.hint {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #94a3b8;
}

.stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx;
  border-radius: 18rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
}

.step-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background: #1677ff;
  color: #ffffff;
  font-size: 40rpx;
}

.step-value {
  font-size: 34rpx;
  font-weight: 600;
  color: #0f172a;
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 36rpx;
  padding: 24rpx;
  border-radius: 18rpx;
  background: #1677ff;
  color: #ffffff;
  font-size: 32rpx;
}

.save-btn.disabled {
  opacity: 0.6;
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

.browser-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  background: rgba(15, 23, 42, 0.45);
}

.browser-panel {
  width: 100%;
  height: 75vh;
  padding: 28rpx 24rpx 32rpx;
  box-sizing: border-box;
  border-radius: 28rpx 28rpx 0 0;
  background: #ffffff;
}

.browser-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.browser-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #0f172a;
}

.browser-close {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: #f1f5f9;
  color: #475569;
  font-size: 24rpx;
}

.browser-path {
  display: block;
  margin-top: 18rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #64748b;
  word-break: break-all;
}

.browser-toolbar {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.toolbar-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18rpx 12rpx;
  border-radius: 16rpx;
  background: #e2e8f0;
  color: #0f172a;
  font-size: 26rpx;
}

.toolbar-btn.primary {
  background: #1677ff;
  color: #ffffff;
}

.toolbar-btn.disabled {
  opacity: 0.45;
}

.browser-list {
  height: calc(75vh - 220rpx);
  margin-top: 20rpx;
}

.browser-state {
  padding: 36rpx 0;
  text-align: center;
  color: #94a3b8;
  font-size: 26rpx;
}

.browser-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 8rpx;
  border-bottom: 1rpx solid #eef2f7;
}

.browser-item-name {
  flex: 1;
  margin-right: 16rpx;
  font-size: 28rpx;
  color: #0f172a;
  word-break: break-all;
}

.browser-item-arrow {
  color: #94a3b8;
  font-size: 32rpx;
}
</style>
