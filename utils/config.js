export const STORAGE_KEY = 'map_config'

export const DEFAULT_CENTER = {
  lat: 39.9087,
  lng: 116.3975
}

export const DEFAULT_CONFIG = {
  tileBasePath: '',
  minZoom: 9,
  maxZoom: 17,
  defaultZoom: 12,
  port: 18888,
  lastLat: DEFAULT_CENTER.lat,
  lastLng: DEFAULT_CENTER.lng,
  hasConfig: false
}

function toNumber(value, fallback) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function toInteger(value, fallback) {
  const next = parseInt(value, 10)
  return Number.isFinite(next) ? next : fallback
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function normalizeRawConfig(raw) {
  if (!raw) {
    return {}
  }

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch (error) {
      console.warn('[Config] 配置字符串解析失败:', error)
      return {}
    }
  }

  if (typeof raw === 'object') {
    return raw
  }

  return {}
}

export function normalizeConfig(raw) {
  const source = normalizeRawConfig(raw)
  const minZoom = toInteger(source.minZoom, DEFAULT_CONFIG.minZoom)
  const maxZoom = toInteger(source.maxZoom, DEFAULT_CONFIG.maxZoom)
  const safeMinZoom = Math.min(minZoom, maxZoom)
  const safeMaxZoom = Math.max(minZoom, maxZoom)
  const defaultZoom = clamp(
    toInteger(source.defaultZoom, DEFAULT_CONFIG.defaultZoom),
    safeMinZoom,
    safeMaxZoom
  )

  return {
    tileBasePath: typeof source.tileBasePath === 'string' ? source.tileBasePath.trim() : DEFAULT_CONFIG.tileBasePath,
    minZoom: safeMinZoom,
    maxZoom: safeMaxZoom,
    defaultZoom,
    port: toInteger(source.port, DEFAULT_CONFIG.port),
    lastLat: toNumber(source.lastLat, DEFAULT_CENTER.lat),
    lastLng: toNumber(source.lastLng, DEFAULT_CENTER.lng),
    hasConfig: source.hasConfig === true
  }
}

export function readConfig() {
  const result = normalizeConfig(uni.getStorageSync(STORAGE_KEY))
  console.log('[Config] 读取 map_config:', result)
  if (!result.hasConfig) {
    console.log('[Config] 配置为空, 需要首次设置')
  }
  return result
}

export function saveConfig(data) {
  const next = normalizeConfig({
    ...DEFAULT_CONFIG,
    ...readConfig(),
    ...data,
    hasConfig: true
  })
  console.log('[Config] 保存配置:', JSON.stringify(next))
  uni.setStorageSync(STORAGE_KEY, next)
  console.log('[Config] 保存完成, hasConfig:', next.hasConfig)
  return next
}

export function updateLastLocation(lat, lng) {
  const current = readConfig()
  const next = saveConfig({
    ...current,
    lastLat: toNumber(lat, DEFAULT_CENTER.lat),
    lastLng: toNumber(lng, DEFAULT_CENTER.lng)
  })
  return next
}

export function buildMapUrl(config) {
  const next = normalizeConfig(config)
  return `hybrid/html/map.html?port=${encodeURIComponent(next.port)}&minZoom=${encodeURIComponent(next.minZoom)}&maxZoom=${encodeURIComponent(next.maxZoom)}&zoom=${encodeURIComponent(next.defaultZoom)}`
}

export function getDefaultLocation() {
  return {
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng
  }
}
