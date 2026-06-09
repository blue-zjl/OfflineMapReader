(function (global) {
  'use strict'

  var TILE_SIZE = 256
  var MIN_LAT = -85.05112878
  var MAX_LAT = 85.05112878

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  function toLatLng(input) {
    if (Array.isArray(input)) {
      return {
        lat: Number(input[0]) || 0,
        lng: Number(input[1]) || 0
      }
    }

    if (input && typeof input === 'object') {
      return {
        lat: Number(input.lat) || 0,
        lng: Number(input.lng) || 0
      }
    }

    return {
      lat: 0,
      lng: 0
    }
  }

  function project(lat, lng, zoom) {
    var scale = TILE_SIZE * Math.pow(2, zoom)
    var boundedLat = clamp(lat, MIN_LAT, MAX_LAT)
    var boundedLng = clamp(lng, -180, 180)
    var sin = Math.sin(boundedLat * Math.PI / 180)

    return {
      x: (boundedLng + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
    }
  }

  function unproject(x, y, zoom) {
    var scale = TILE_SIZE * Math.pow(2, zoom)
    var lng = x / scale * 360 - 180
    var n = Math.PI - 2 * Math.PI * y / scale
    var lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))

    return {
      lat: clamp(lat, MIN_LAT, MAX_LAT),
      lng: clamp(lng, -180, 180)
    }
  }

  function resolveContainer(container) {
    if (typeof container === 'string') {
      return document.getElementById(container)
    }

    return container
  }

  class Evented {
    constructor() {
      this._events = Object.create(null)
    }

    on(type, handler) {
      if (!type || typeof handler !== 'function') {
        return this
      }

      if (!this._events[type]) {
        this._events[type] = []
      }

      this._events[type].push(handler)
      return this
    }

    off(type, handler) {
      if (!type || !this._events[type]) {
        return this
      }

      if (!handler) {
        delete this._events[type]
        return this
      }

      this._events[type] = this._events[type].filter(function (listener) {
        return listener !== handler
      })
      return this
    }

    fire(type, detail) {
      var listeners = this._events[type]
      if (!listeners || listeners.length === 0) {
        return this
      }

      listeners.slice().forEach(function (listener) {
        try {
          listener.call(this, detail)
        } catch (error) {
          console.warn('[Leaflet] 事件处理失败:', type, error)
        }
      }, this)

      return this
    }
  }

  class LeafletMap extends Evented {
    constructor(container, options) {
      super()

      this._container = resolveContainer(container)
      if (!this._container) {
        throw new Error('Map container not found')
      }

      this.options = Object.assign({
        center: [0, 0],
        zoom: 0,
        minZoom: 0,
        maxZoom: 18,
        zoomControl: true,
        attributionControl: false,
        crs: null
      }, options || {})

      this._center = toLatLng(this.options.center)
      this._zoom = clamp(Number(this.options.zoom) || 0, this.options.minZoom, this.options.maxZoom)
      this._layers = []
      this._size = {
        width: 0,
        height: 0
      }
      this._dragState = null

      this._build()
      this.invalidateSize()
      this._bindEvents()
      this.setView(this._center, this._zoom, {
        silent: true
      })
    }

    _build() {
      this._container.classList.add('leaflet-map')
      this._container.innerHTML = ''

      this._tilePane = document.createElement('div')
      this._tilePane.className = 'leaflet-pane leaflet-tile-pane'
      this._container.appendChild(this._tilePane)

      this._controlPane = document.createElement('div')
      this._controlPane.className = 'leaflet-control-container'
      this._container.appendChild(this._controlPane)

      if (this.options.zoomControl !== false) {
        this._createZoomControl()
      }
    }

    _createZoomControl() {
      var control = document.createElement('div')
      control.className = 'leaflet-control leaflet-bar leaflet-control-zoom'

      var zoomIn = document.createElement('button')
      zoomIn.type = 'button'
      zoomIn.textContent = '+'
      zoomIn.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        this.setView(this._center, this._zoom + 1)
      }.bind(this))

      var zoomOut = document.createElement('button')
      zoomOut.type = 'button'
      zoomOut.textContent = '−'
      zoomOut.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        this.setView(this._center, this._zoom - 1)
      }.bind(this))

      control.appendChild(zoomIn)
      control.appendChild(zoomOut)
      this._controlPane.appendChild(control)
    }

    _bindEvents() {
      this._container.addEventListener('pointerdown', function (event) {
        if (event.target && event.target.closest && event.target.closest('.leaflet-control')) {
          return
        }

        if (typeof event.button === 'number' && event.button !== 0) {
          return
        }

        this._dragState = {
          startX: event.clientX,
          startY: event.clientY,
          center: this.getCenter(),
          zoom: this.getZoom()
        }

        if (this._container.setPointerCapture && event.pointerId !== undefined) {
          try {
            this._container.setPointerCapture(event.pointerId)
          } catch (error) {
            // ignore
          }
        }

        event.preventDefault()
      }.bind(this))

      this._container.addEventListener('pointermove', function (event) {
        if (!this._dragState) {
          return
        }

        var dx = event.clientX - this._dragState.startX
        var dy = event.clientY - this._dragState.startY
        var centerPoint = project(this._dragState.center.lat, this._dragState.center.lng, this._dragState.zoom)
        var nextCenter = unproject(centerPoint.x - dx, centerPoint.y - dy, this._dragState.zoom)
        this._center = nextCenter
        this._render()
        event.preventDefault()
      }.bind(this))

      var finishDrag = function () {
        if (!this._dragState) {
          return
        }

        this._dragState = null
        this.fire('moveend', {
          center: this.getCenter(),
          zoom: this.getZoom()
        })
      }.bind(this)

      this._container.addEventListener('pointerup', finishDrag)
      this._container.addEventListener('pointercancel', finishDrag)

      this._container.addEventListener('wheel', function (event) {
        if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) > 0) {
          event.preventDefault()
          var delta = event.deltaY < 0 ? 1 : -1
          this.setView(this._center, this._zoom + delta)
        }
      }.bind(this), {
        passive: false
      })
    }

    addLayer(layer) {
      if (this._layers.indexOf(layer) === -1) {
        this._layers.push(layer)
        layer._addTo(this)
      }

      this._render()
      return this
    }

    removeLayer(layer) {
      var index = this._layers.indexOf(layer)
      if (index >= 0) {
        this._layers.splice(index, 1)
      }

      if (layer && typeof layer._remove === 'function') {
        layer._remove()
      }

      this._render()
      return this
    }

    setView(center, zoom, options) {
      var nextCenter = toLatLng(center)
      this._center = {
        lat: clamp(nextCenter.lat, MIN_LAT, MAX_LAT),
        lng: clamp(nextCenter.lng, -180, 180)
      }

      if (typeof zoom === 'number' && Number.isFinite(zoom)) {
        this._zoom = clamp(zoom, this.options.minZoom, this.options.maxZoom)
      }

      this._render()

      if (!(options && options.silent)) {
        this.fire('moveend', {
          center: this.getCenter(),
          zoom: this.getZoom()
        })
      }

      return this
    }

    panBy(dx, dy) {
      var centerPoint = project(this._center.lat, this._center.lng, this._zoom)
      var nextCenter = unproject(centerPoint.x - dx, centerPoint.y - dy, this._zoom)
      return this.setView([nextCenter.lat, nextCenter.lng], this._zoom)
    }

    getZoom() {
      return this._zoom
    }

    getCenter() {
      return {
        lat: this._center.lat,
        lng: this._center.lng
      }
    }

    getSize() {
      return {
        width: this._size.width,
        height: this._size.height
      }
    }

    invalidateSize() {
      var rect = this._container.getBoundingClientRect()
      this._size = {
        width: rect.width || this._container.clientWidth || 0,
        height: rect.height || this._container.clientHeight || 0
      }
      this._render()
      return this
    }

    _render() {
      if (!this._size || !this._size.width || !this._size.height) {
        return
      }

      this.fire('move', {
        center: this.getCenter(),
        zoom: this.getZoom()
      })

      this._layers.forEach(function (layer) {
        if (layer && typeof layer._render === 'function') {
          layer._render()
        }
      })
    }
  }

  class TileLayer extends Evented {
    constructor(urlTemplate, options) {
      super()
      this._urlTemplate = urlTemplate
      this.options = Object.assign({
        tms: false,
        minZoom: 0,
        maxZoom: 18,
        errorTileUrl: ''
      }, options || {})
      this._map = null
      this._container = null
      this._consecutiveErrors = 0
    }

    addTo(map) {
      map.addLayer(this)
      return this
    }

    _addTo(map) {
      this._map = map
      this._container = document.createElement('div')
      this._container.className = 'leaflet-layer leaflet-tile-layer'
      this._map._tilePane.appendChild(this._container)
    }

    _remove() {
      if (this._container && this._container.parentNode) {
        this._container.parentNode.removeChild(this._container)
      }

      this._container = null
      this._map = null
    }

    _buildUrl(zoom, x, y) {
      var tileY = this.options.tms ? (Math.pow(2, zoom) - 1 - y) : y
      return this._urlTemplate
        .replace('{z}', zoom)
        .replace('{x}', x)
        .replace('{y}', tileY)
    }

    _render() {
      if (!this._map || !this._container) {
        return
      }

      var map = this._map
      var zoom = clamp(map.getZoom(), this.options.minZoom, this.options.maxZoom)
      if (zoom !== map.getZoom()) {
        map._zoom = zoom
      }

      var size = map.getSize()
      if (!size.width || !size.height) {
        return
      }

      var centerPoint = project(map.getCenter().lat, map.getCenter().lng, zoom)
      var topLeft = {
        x: centerPoint.x - size.width / 2,
        y: centerPoint.y - size.height / 2
      }
      var startX = Math.floor(topLeft.x / TILE_SIZE) - 1
      var endX = Math.floor((topLeft.x + size.width) / TILE_SIZE) + 1
      var startY = Math.floor(topLeft.y / TILE_SIZE) - 1
      var endY = Math.floor((topLeft.y + size.height) / TILE_SIZE) + 1
      var maxIndex = Math.pow(2, zoom) - 1
      var fragment = document.createDocumentFragment()

      this._container.innerHTML = ''

      for (var x = startX; x <= endX; x += 1) {
        for (var y = startY; y <= endY; y += 1) {
          if (x < 0 || y < 0 || x > maxIndex || y > maxIndex) {
            continue
          }

          var tile = document.createElement('img')
          tile.className = 'leaflet-tile'
          tile.draggable = false
          tile.width = TILE_SIZE
          tile.height = TILE_SIZE
          tile.style.width = TILE_SIZE + 'px'
          tile.style.height = TILE_SIZE + 'px'
          tile.style.transform = 'translate3d(' + Math.round(x * TILE_SIZE - topLeft.x) + 'px, ' + Math.round(y * TILE_SIZE - topLeft.y) + 'px, 0)'

          (function (coords, currentZoom, tileX, tileY, layer) {
            var url = layer._buildUrl(currentZoom, tileX, tileY)
            tile.src = url

            tile.onload = function () {
              layer._consecutiveErrors = 0
              layer.fire('tileload', {
                url: url,
                coords: {
                  z: currentZoom,
                  x: tileX,
                  y: tileY
                }
              })
            }

            tile.onerror = function () {
              layer._consecutiveErrors += 1
              layer.fire('tileerror', {
                url: url,
                coords: {
                  z: currentZoom,
                  x: tileX,
                  y: tileY
                },
                count: layer._consecutiveErrors
              })
            }
          })(null, zoom, x, y, this)

          fragment.appendChild(tile)
        }
      }

      this._container.appendChild(fragment)
      this.fire('load', {
        zoom: zoom,
        center: map.getCenter()
      })
    }
  }

  var CRS = {
    EPSG3857: {
      code: 'EPSG:3857'
    }
  }

  global.L = {
    map: function (container, options) {
      return new LeafletMap(container, options)
    },
    tileLayer: function (urlTemplate, options) {
      return new TileLayer(urlTemplate, options)
    },
    latLng: function (lat, lng) {
      return toLatLng([lat, lng])
    },
    CRS: CRS
  }
})(window)
