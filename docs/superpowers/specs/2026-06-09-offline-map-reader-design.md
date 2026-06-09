# 高德地图离线读取器 — 设计规格

> 日期: 2026-06-09
> 版本: 1.0

---

## 1. 概述

构建一个基于 uni-app (Vue3, 5+App) 的高德地图离线瓦片读取器，从移动硬盘加载预下载的瓦片金字塔数据，在 WebView 中通过 Leaflet 渲染地图。

### 核心需求

| # | 需求 | 说明 |
|---|------|------|
| R1 | 离线瓦片读取 | 从移动硬盘加载 `{z}/{x}/{y}.png` 瓦片金字塔 |
| R2 | 路径可配置 | 应用首次启动进入设置页，手动输入瓦片存储路径 |
| R3 | 数据不可用提示 | 瓦片加载失败时 Toast 提示用户 |
| R4 | 层级可配置 | 地图缩放范围(minZoom/maxZoom)和默认加载层级可配置 |
| R5 | 横竖屏适配 | 地图页面响应式适配横竖屏 |
| R6 | GPS 定位 | 进入地图自动定位，失败回退上次保存坐标；提供手动定位按钮 |

---

## 2. 约束与非需求

### 约束
- 仅 Android 平台 (5+App)
- 瓦片格式：标准金字塔目录结构 `{z}/{x}/{y}.png`
- 地图类型：单一基础街道图（非卫星图）
- 坐标系：高德 GCJ-02，Leaflet 默认 EPSG:3857 兼容
- 不依赖云端服务，完全离线运行

### 明确不做
- 不支持卫星图/水系图切换
- 不支持 marker 标记打点
- 不支持地图搜索/路径规划
- 不支持 iOS 平台（当前阶段）

---

## 3. 技术架构

### 3.1 总览

```
┌──────────────────────────────────────────────────┐
│                   uni-app 层                      │
│                                                  │
│  ┌──────────────┐   ┌──────────────────────┐    │
│  │ setting.vue  │   │      map.vue          │    │
│  │ 配置页面      │   │  ┌────────────────┐  │    │
│  └──────┬───────┘   │  │  WebView 容器   │  │    │
│         │           │  │  (map.html)     │  │    │
│         │           │  │  Leaflet 渲染   │  │    │
│         │           │  └───────┬────────┘  │    │
│         │           │          │evalJS      │    │
│         │           │  ┌───────┴────────┐  │    │
│         │           │  │ 原生插件        │  │    │
│         │           │  │ TileServer.java │  │    │
│         │           │  │ NanoHTTPD       │  │    │
│         │           │  └───────┬────────┘  │    │
│         │           │          │读取文件     │    │
│         │           │  ┌───────┴────────┐  │    │
│         │           │  │   移动硬盘      │  │    │
│         │           │  │ tiles/         │  │    │
│         │           │  │  {z}/{x}/{y}.png│  │    │
│         │           │  └────────────────┘  │    │
│         │           └──────────────────────┘    │
│         │                                       │
│    uni.setStorageSync                       │
│    uni.getLocation (GPS)                    │
└──────────────────────────────────────────────────┘
```

### 3.2 技术选型

| 层 | 技术 | 说明 |
|---|------|------|
| 应用框架 | uni-app Vue3, 5+App | HBuilderX 项目 |
| 地图渲染 | Leaflet 1.7.1 | 打包为本地资源，无 CDN 依赖 |
| 瓦片 HTTP 服务 | NanoHTTPD | 单文件 Java 库，~50KB |
| 原生桥接 | uni-app 原生插件 | 封装 NanoHTTPD，导出 JS API |
| 配置存储 | `uni.setStorageSync` | 本地持久化 |
| GPS 定位 | `uni.getLocation` | uni-app 内置 API |
| uni ↔ WebView 通信 | `evalJS` + `postMessage` | 5+App WebView API |

---

## 4. 项目文件结构

```
OfflineMapReader/
├── App.vue                            # 启动路由判断
├── main.js
├── pages.json                         # 页面注册 (setting + map)
├── manifest.json                      # +GPS权限 +存储权限
├── pages/
│   ├── setting/
│   │   └── setting.vue                # 首次配置页
│   └── map/
│       └── map.vue                    # 地图页 (WebView容器)
├── hybrid/
│   └── html/
│       ├── map.html                   # Leaflet 地图页面
│       └── leaflet/                   # Leaflet 脱机资源
│           ├── leaflet.js             # Leaflet 核心 JS
│           └── leaflet.css            # Leaflet 核心 CSS
├── nativeplugins/
│   └── tile-server/                   # 原生插件
│       ├── package.json               # 插件元信息
│       └── android/
│           ├── libs/
│           │   └── nanohttpd-2.3.1.jar
│           └── TileServer.java        # NanoHTTPD 封装
└── utils/
    └── config.js                      # 配置读写工具函数
```

---

## 5. 数据流

### 5.1 启动路由

```
App.vue onLaunch
  ├─ 读取 uni.getStorageSync('map_config')
  ├─ 无值或 hasConfig !== true ?
  │   └─ uni.reLaunch({ url: '/pages/setting/setting' })
  └─ 有值 ?
      └─ uni.reLaunch({ url: '/pages/map/map' })
```

### 5.2 配置流程

```
setting.vue
  ├─ 表单字段:
  │   ├─ tileBasePath  (文本, 示例: /storage/XXXX-XXXX/tiles/)
  │   ├─ minZoom       (数字, 默认 9)
  │   ├─ maxZoom       (数字, 默认 17)
  │   └─ defaultZoom   (数字, 默认 12)
  │
  ├─ 保存按钮:
  │   ├─ 校验路径格式 (非空)
  │   ├─ 调用原生插件检测目录是否存在
  │   │   ├─ 不存在 → Toast "路径不存在"
  │   │   └─ 存在 →
  │   │       uni.setStorageSync('map_config', {
  │   │         tileBasePath, minZoom, maxZoom, defaultZoom,
  │   │         port: 18888,
  │   │         lastLat: 39.9087,   // 默认北京
  │   │         lastLng: 116.3975,
  │   │         hasConfig: true
  │   │       })
  │   │       uni.reLaunch({ url: '/pages/map/map' })
```

### 5.3 地图加载流程

```
map.vue onShow
  │
  ├─ 1. 读取配置
  │     config = uni.getStorageSync('map_config')
  │
  ├─ 2. 启动瓦片 HTTP 服务
  │     原生插件: tileServer.start(config.tileBasePath, config.port)
  │     ├─ 成功 → 继续
  │     └─ 失败 → Toast "瓦片服务启动失败" + 显示⚙按钮
  │
  ├─ 3. 构建 WebView
  │     wv = plus.webview.create(
  │       'hybrid/html/map.html?port={port}&minZoom={min}&maxZoom={max}&zoom={def}',
  │       'map-webview',
  │       { top:'0', bottom:'0', left:'0', right:'0' }
  │     )
  │     wv.show()
  │
  ├─ 4. GPS 定位
  │     uni.getLocation({ type: 'gcj02' })
  │       .then(res → {
  │         更新 lastLat/lastLng 到 storage
  │         wv.evalJS(`moveTo(${res.latitude}, ${res.longitude}, ${config.defaultZoom})`)
  │       })
  │       .catch(→ {
  │         使用 config.lastLat/lastLng 回退
  │         wv.evalJS(`moveTo(${lastLat}, ${lastLng}, ${config.defaultZoom})`)
  │       })
  │
  ├─ 5. 监听瓦片错误
  │     wv.addEventListener('onMessage', e → {
  │       if (e.data?.action === 'tileerror') {
  │         首次则 uni.showToast("瓦片数据不可用，请检查存储路径")
  │         标记已提示(避免重复弹出)
  │       }
  │     })
  │
  └─ 6. 浮动按钮
        [📍定位] → 重新 uni.getLocation() → evalJS('moveTo(...)')
        [⚙设置] → uni.navigateTo({ url: '/pages/setting/setting' })

map.vue onHide
  └─ 原生插件: tileServer.stop()
```

### 5.4 map.html 内部逻辑

```
URL 参数解析:
  port, minZoom, maxZoom, zoom

初始化:
  map = L.map('mapContainer', {
    minZoom, maxZoom,
    zoom: zoom,
    center: [39.9087, 116.3975],  // 默认，等待 GPS 更新
    zoomControl: true,
    attributionControl: false,
    crs: L.CRS.EPSG3857           // 高德 GCJ-02 兼容
  })

  tileLayer = L.tileLayer(`http://localhost:${port}/{z}/{x}/{y}.png`, {
    tms: true,
    minZoom: minZoom,
    maxZoom: maxZoom,
    errorTileUrl: ''              // 静默失败，空白
  }).addTo(map)

  // 瓦片加载失败统计
  let initialTileErrors = 0
  tileLayer.on('tileerror', () → {
    initialTileErrors++
    if (initialTileErrors >= 3) {  // 连续3个瓦片失败则告警
      uni.postMessage({ data: { action: 'tileerror' } })
    }
  })

全局函数 (供 uni-app evalJS 调用):
  function moveTo(lat, lng, z) {
    map.setView([lat, lng], z || map.getZoom())
  }

横竖屏适配:
  window.addEventListener('resize', () → map.invalidateSize())
```

---

## 6. NanoHTTPD 原生插件设计

### 6.1 TileServer.java 核心逻辑

```java
public class TileServer extends NanoHTTPD {
    private String tileBasePath;

    public TileServer(int port, String basePath) {
        super(port);
        this.tileBasePath = basePath;
    }

    @Override
    public Response serve(IHTTPSession session) {
        String uri = session.getUri();               // /{z}/{x}/{y}.png
        File file = new File(tileBasePath, uri);

        if (file.exists() && file.isFile()) {
            String mime = getMimeType(uri);           // image/png
            return newChunkedResponse(Status.OK, mime, new FileInputStream(file));
        } else {
            return newFixedLengthResponse(Status.NOT_FOUND, "text/plain", "404");
        }
    }
}
```

### 6.2 插件 JS API

```js
// uni-app 侧调用
const tileServer = uni.requireNativePlugin('tile-server')

// 启动服务
tileServer.start({
  port: 18888,
  basePath: '/storage/XXXX-XXXX/tiles/'
}, (result) => {
  // result.success: true/false
})

// 停止服务
tileServer.stop()

// 检测路径是否存在
tileServer.checkPath({
  path: '/storage/XXXX-XXXX/tiles/'
}, (result) => {
  // result.exists: true/false
})
```

---

## 7. 页面布局

### 7.1 setting.vue 布局

```
┌─────────────────────────────────┐
│  ← 高德离线地图配置               │  (导航栏)
├─────────────────────────────────┤
│                                 │
│  瓦片存储路径                    │
│  ┌─────────────────────────┐   │
│  │ /storage/HDD1/tiles/    │   │  (输入框)
│  └─────────────────────────┘   │
│  示例: /storage/emulated/0/     │  (灰色提示文字)
│  GaodeTiles/                    │
│                                 │
│  地图显示层级                    │
│  最小 [ 9 ]   最大 [ 17 ]       │  (数字输入)
│                                 │
│  默认加载层级                    │
│  [ 12 ]                        │  (数字输入)
│                                 │
│  ┌─────────────────────────┐   │
│  │        保存并进入地图      │   │  (主按钮, 蓝色)
│  └─────────────────────────┘   │
│                                 │
│  提示:                           │
│  瓦片需按 {z}/{x}/{y}.png       │  (底部灰色提示)
│  的目录结构存放。                │
└─────────────────────────────────┘
```

### 7.2 map.vue 布局

```
┌──────────────────────────────────────┐
│                              [📍][⚙] │  ← 浮动按钮区(右上角)
│                                      │
│                                      │
│          WebView 全屏地图             │
│          (Leaflet 渲染)              │
│                                      │
│                                      │
│                                      │
│                                      │
├──────────────────────────────────────┤
│  Toast(底部):                         │
│  "瓦片数据不可用，请检查存储路径"      │  ← 仅错误时显示
└──────────────────────────────────────┘
```

- 导航栏隐藏 (`navigationStyle: "custom"`)
- WebView 填充整个屏幕 (`top:0, bottom:0`)
- 浮动按钮使用 `position: fixed`，横竖屏自适应
- 定位按钮 📍：圆形，半透明背景，右下角或右上角

---

## 8. 配置存储结构

```javascript
// key: 'map_config'
{
  tileBasePath: '/storage/XXXX-XXXX/tiles/',
  minZoom: 9,
  maxZoom: 17,
  defaultZoom: 12,
  port: 18888,
  lastLat: 39.9087,       // GPS回退坐标
  lastLng: 116.3975,
  hasConfig: true
}
```

---

## 9. 权限配置 (manifest.json)

```json
"app-plus": {
  "distribute": {
    "android": {
      "permissions": [
        "<uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\"/>",
        "<uses-permission android:name=\"android.permission.ACCESS_COARSE_LOCATION\"/>",
        "<uses-permission android:name=\"android.permission.READ_EXTERNAL_STORAGE\"/>",
        "<uses-permission android:name=\"android.permission.WRITE_EXTERNAL_STORAGE\"/>",
        "<uses-permission android:name=\"android.permission.INTERNET\"/>"
      ]
    }
  }
}
```

---

## 10. 页面路由配置 (pages.json)

```json
{
  "pages": [
    {
      "path": "pages/setting/setting",
      "style": {
        "navigationBarTitleText": "地图配置"
      }
    },
    {
      "path": "pages/map/map",
      "style": {
        "navigationBarTitleText": "",
        "navigationStyle": "custom",
        "app-plus": {
          "titleNView": false
        }
      }
    }
  ]
}
```

---

## 11. 错误处理矩阵

| 场景 | 触发时机 | 处理方式 |
|------|----------|----------|
| 首次启动无配置 | App.vue onLaunch | 直接进入 setting.vue |
| 配置路径不存在 | setting 保存时 | 调用原生 checkPath，不存在则 Toast + 阻止保存 |
| 瓦片 HTTP 服务启动失败 | map.vue onShow | Toast "瓦片服务启动失败"，地图空白，显示设置按钮 |
| 首屏瓦片全部 404 | map.html tileerror | 连续3次失败后 postMessage，uni-app 侧 Toast |
| 缩放/平移时瓦片缺失 | map.html tileerror | 静默失败，瓦片区域空白 |
| GPS 定位失败 | map.vue getLocation | 回退到 storage 中的 lastLat/lastLng |
| GPS 完全不可用（首次） | map.vue getLocation | 使用北京默认坐标 (39.9087, 116.3975) |
| 横竖屏切换 | map.html resize | Leaflet map.invalidateSize() 自动重绘 |

---

## 12. 调试日志

> **原则：每个关键节点打日志，用统一前缀区分模块，方便 logcat 过滤。**
>
> `[App]` | `[Config]` | `[MapPage]` | `[MapHTML]` | `[TileServer]`

### 12.1 App.vue

```js
console.log('[App] onLaunch, 读取配置:', uni.getStorageSync('map_config'))
console.log('[App] 跳转目标:', hasConfig ? 'map' : 'setting')
```

### 12.2 utils/config.js

```js
readConfig():
  console.log('[Config] 读取 map_config:', result)
  console.log('[Config] 配置为空, 需要首次设置')
saveConfig(data):
  console.log('[Config] 保存配置:', JSON.stringify(data))
  console.log('[Config] 保存完成, hasConfig:', hasConfig)
```

### 12.3 setting.vue

```js
onLoad:
  console.log('[Setting] 页面加载, 当前配置:', currentConfig)
校验路径:
  console.log('[Setting] 校验路径:', tileBasePath)
  console.log('[Setting] 原生插件 checkPath 返回:', result)
保存:
  console.log('[Setting] 保存配置: minZoom=%d maxZoom=%d defaultZoom=%d path=%s', ...)
  console.log('[Setting] 保存成功, 即将跳转到地图页')
```

### 12.4 map.vue

```js
onLoad:
  console.log('[MapPage] ======== 地图页加载 ========')
  console.log('[MapPage] 读取配置:', config)

onShow:
  console.log('[MapPage] onShow, 配置: hasConfig=%s path=%s', ...)

启动瓦片服务:
  console.log('[MapPage] 启动 TileServer: port=%d path=%s', ...)
  console.log('[MapPage] TileServer start 结果:', result)
  console.error('[MapPage] TileServer 启动失败:', error)

创建 WebView:
  console.log('[MapPage] WebView URL:', url)
  console.log('[MapPage] WebView 创建完成, 等待 UniAppJSBridgeReady')

GPS:
  console.log('[MapPage] 获取 GPS...')
  console.log('[MapPage] GPS 成功: lat=%f lng=%f', lat, lng)
  console.warn('[MapPage] GPS 失败: %s, 回退上次坐标', error)

WebView 通信:
  console.log('[MapPage] WebView 消息:', e.data)
  console.warn('[MapPage] 收到 tileerror 事件')

按钮:
  console.log('[MapPage] 点击定位按钮')
  console.log('[MapPage] 点击设置按钮')

onHide:
  console.log('[MapPage] onHide, 停止 TileServer')
  console.log('[MapPage] TileServer stop 结果:', result)
```

### 12.5 map.html (WebView 内)

```js
UniAppJSBridgeReady:
  console.log('[MapHTML] UniAppJSBridgeReady 触发')
  console.log('[MapHTML] URL 参数: port=%s minZoom=%d maxZoom=%d zoom=%d', ...)

initMap:
  console.log('[MapHTML] 初始化 Leaflet, options:', JSON.stringify(opts))
  console.log('[MapHTML] tileUrl: http://localhost:%d/{z}/{x}/{y}.png', port)

tileLayer:
  console.log('[MapHTML] tileLayer 创建完成, 添加到 map')
  console.log('[MapHTML] tileLayer 第一次 load 事件触发')
  console.warn('[MapHTML] tileLayer tileerror #%d: url=%s', errorCount, url)
  console.warn('[MapHTML] tileLayer 连续 %d 次失败, 发送 tileerror 给 uni-app', errorCount)

moveTo:
  console.log('[MapHTML] moveTo: lat=%f lng=%f zoom=%d', lat, lng, zoom)

resize:
  console.log('[MapHTML] 窗口 resize, invalidateSize')
```

### 12.6 TileServer.java

```java
Log.d("TileServer", "服务器启动: port=" + port + " basePath=" + basePath);
Log.d("TileServer", "收到请求: " + uri);
Log.d("TileServer", "文件存在: " + file.getAbsolutePath() + " size=" + file.length());
Log.w("TileServer", "文件不存在 (404): " + file.getAbsolutePath());
Log.d("TileServer", "服务器停止");
```

### 12.7 日志过滤命令

```bash
# Android logcat 按模块过滤
adb logcat | findstr "\[App\]"      # App 路由
adb logcat | findstr "\[Config\]"   # 配置读写
adb logcat | findstr "\[Setting\]"  # 设置页
adb logcat | findstr "\[MapPage\]"  # 地图页
adb logcat | findstr "\[MapHTML\]"  # WebView 地图
adb logcat | findstr "TileServer"   # 原生插件

# 看全部
adb logcat | findstr "\[App\]|\[Config\]|\[Setting\]|\[MapPage\]|\[MapHTML\]|TileServer"
```

---

## 13. 依赖清单

| 依赖 | 版本 | 来源 | 用途 |
|------|------|------|------|
| Leaflet | 1.7.1 | 本地打包 hybrid/html/leaflet/ | 地图渲染 |
| NanoHTTPD | 2.3.1 | Maven/jar 本地引入 | 嵌入式 HTTP 瓦片服务 |
| uni-app | Vue3 | HBuilderX 内置 | 应用框架 |
| 5+Runtime | - | HBuilderX 内置 | WebView、GPS、文件 API |

**不依赖 CDN、不依赖网络。** Leaflet CSS/JS 全部打包为项目本地文件。

---

## 14. 基于参考文件的改动摘要

参考文件: `uni_flood_warning/static/map/map.html`

| 保留 | 移除 |
|------|------|
| Leaflet 核心 (L.map, L.tileLayer) | 三种地图切换 (基础/卫星/水系) |
| TMS 瓦片加载模式 | 百度/BIGEMAP 双坐标系 (proj4) |
| UniAppJSBridgeReady 通信机制 | marker 标记及数据更新 |
| WebView postMessage 事件 | 定时轮询 (startDataUpdate) |
| | 行政区域边界 (drawBounds) |
| | 远端 tile server URL |

| 新增 |
|------|
| 本地 NanoHTTPD 瓦片服务 |
| GPS 定位 + 手动定位按钮 |
| 设置页面 (路径/层级配置) |
| 瓦片缺失错误提示 |
| 全屏地图 + 横竖屏适配 |
| Leaflet 资源本地打包 (离线) |
