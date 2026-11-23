const travelMapRoot = new URL('../', document.currentScript.src);
const MAP_PROVIDER = 'https://tiles.openfreemap.org';
const MAP_PACKAGE_PREFIX = 'traveltraces-map-v1:';
const MAP_MAX_ZOOM = 14;
const MAP_MAX_TILES = 3000;
const MAP_MAX_BYTES = 50000000;
const MAP_GLYPHS = [0, 256, 512, 768, 1024, 1280, 1536, 1792, 2048, 2304, 3072, 3328, 3584, 8192, 12288, 12544, 65280];
let travelMapView, mapLibrePromise, offlineDownloadRunning = false, lastRouteFetch = 0;
const mapDayByTrip = new Map();
const SHORT_POINT_KEY = 'travelMapShortPointsV1';
const shortLookups = new Map();
const locationHintTimers = new WeakMap();
let savedShortPoints;

function validMapPoint(lat, lng) {
  if (lat === null || lng === null || String(lat).trim() === '' || String(lng).trim() === '') return null;
  lat = Number(lat); lng = Number(lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180
    ? [Number(lng.toFixed(6)), Number(lat.toFixed(6))] : null;
}

function pointFromText(value) {
  const match = String(value || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*$/);
  return match ? validMapPoint(match[1], match[2]) : null;
}

function pointFromMapLink(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (!/^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|[a-z]{2,3}\.[a-z]{2})$/i.test(url.hostname)) return null;
    const path = decodeURIComponent(url.pathname);
    const data = path.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (data && !path.includes('/dir/')) return validMapPoint(data[1], data[2]);
    for (const key of ['query', 'q', 'destination', 'll']) {
      const point = pointFromText(url.searchParams.get(key));
      if (point) return point;
    }
    return null;
  } catch { return null; }
}

function googleShortId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.host !== 'maps.app.goo.gl' || url.username || url.password) return '';
    return /^\/([A-Za-z0-9]{8,40})\/?$/.exec(url.pathname)?.[1] || '';
  } catch { return ''; }
}

function readShortPoint(id) {
  if (!id) return null;
  if (!savedShortPoints) {
    savedShortPoints = new Map();
    try {
      for (const [key, point] of JSON.parse(localStorage.getItem(SHORT_POINT_KEY) || '[]')) {
        const valid = validMapPoint(point?.[1], point?.[0]);
        if (typeof key === 'string' && valid) savedShortPoints.set(key, valid);
      }
    } catch { /* A fresh cache can be rebuilt from the saved itinerary links. */ }
  }
  return savedShortPoints.get(id) || null;
}

function lookupShortPoint(id) {
  const cached = readShortPoint(id);
  if (cached || !id || !navigator.onLine) return Promise.resolve(cached);
  if (shortLookups.has(id)) return shortLookups.get(id);
  const request = (async () => {
    try {
      const response = await fetch(SHARE_API_URL + '/map-location/' + id, { signal: AbortSignal.timeout(6500) });
      if (!response.ok) throw new Error('無法辨識短連結');
      const { point } = await response.json();
      const valid = validMapPoint(point?.[1], point?.[0]);
      if (valid) {
        savedShortPoints.set(id, valid);
        while (savedShortPoints.size > 240) savedShortPoints.delete(savedShortPoints.keys().next().value);
        try { localStorage.setItem(SHORT_POINT_KEY, JSON.stringify([...savedShortPoints])); } catch { /* The map still works without a persistent cache. */ }
      }
      return valid;
    } catch {
      shortLookups.delete(id);
      return null;
    }
  })();
  shortLookups.set(id, request);
  return request;
}

function tripMapDays(trip) {
  return trip.planDays.map(day => {
    const items = day.items.filter(item => String(item.map || '').trim());
    return {
      date: day.date,
      stops: items.map((item, i) => ({
        name: item.activity || '未命名地點', time: item.time, url: mapUrl(item.map), order: i + 1,
        point: pointFromText(item.coordinates) || pointFromMapLink(item.map) || readShortPoint(googleShortId(item.map)),
      })),
    };
  });
}

function updateLocationHint(row, tryShortLink = false) {
  const input = row.querySelector('[data-field="map"]');
  const coords = row.querySelector('[data-field="coordinates"]');
  const status = row.querySelector('[data-location-hint]');
  if (!input || !coords || !status) return;
  clearTimeout(locationHintTimers.get(row));
  const link = input.value.trim();
  const shortId = googleShortId(link);
  const point = pointFromText(coords.value) || pointFromMapLink(link) || readShortPoint(shortId);
  const fallback = '這個連結找不到可用的地標座標。可換一個地標連結，或在下方手動補座標。';
  status.textContent = !link ? '沒有連結的行程不會出現在地圖。' : point ? '已定位，可在旅程地圖查看。'
    : shortId ? '會自動辨識這個 Google Maps 短連結。' : fallback;
  row.querySelector('[data-location-details]').hidden = !link;
  if (!tryShortLink || !shortId || point) return;
  status.textContent = navigator.onLine ? '正在辨識 Google Maps 地標…' : '連上網路後會嘗試辨識 Google Maps 地標。';
  locationHintTimers.set(row, setTimeout(async () => {
    if (!row.isConnected || link !== input.value.trim()) return;
    const resolved = await lookupShortPoint(shortId);
    if (row.isConnected && link === input.value.trim() && !coords.value) {
      status.textContent = resolved ? '已辨識 Google Maps 地標，可直接儲存。' : fallback;
    }
  }, 320));
}

async function resolveMapShortLinks(view) {
  const stops = view.days.flatMap(day => day.stops).filter(stop => !stop.point && googleShortId(stop.url));
  if (!stops.length || !navigator.onLine) return;
  view.locating = true;
  view.status.textContent = '正在辨識 ' + stops.length + ' 個 Google Maps 短連結…';
  renderMapSelection(view);
  let cursor = 0;
  async function next() {
    while (travelMapView === view && cursor < stops.length) {
      const stop = stops[cursor++];
      stop.point = await lookupShortPoint(googleShortId(stop.url));
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, stops.length) }, next));
  view.locating = false;
  if (travelMapView === view) { view.status.textContent = ''; renderMapSelection(view); }
}

function mapResourcePath(value) {
  const path = value.replace(/^traveltile:\/\/[^/]+\//, '');
  return path.startsWith('font/') ? 'font/' + path.split('/').at(-1) : path;
}

function providerMapAsset(path) {
  if (path.startsWith('tile/')) return MAP_PROVIDER + '/planet/latest/' + path.slice(5);
  return MAP_PROVIDER + '/fonts/Noto%20Sans%20Regular/' + path.slice(5);
}

function mapCacheUrl(path) { return new URL('travel-map/offline/' + path, travelMapRoot).href; }

function makeTripMapStyle(cacheName) {
  const prefix = 'traveltile://' + (cacheName ? encodeURIComponent(cacheName) : 'online') + '/';
  const source = { source: 'streets' };
  const layer = (id, type, sourceLayer, options) => ({ id, type, ...source, 'source-layer': sourceLayer, ...options });
  const label = ['coalesce', ['get', 'name:zh-Hant'], ['get', 'name'], ['get', 'name:en'], ''];
  const rail = ['match', ['get', 'class'], ['rail', 'transit'], true, false];
  const station = ['match', ['get', 'class'], ['railway', 'bus'], true, false];
  return {
    version: 8,
    glyphs: prefix + 'font/{fontstack}/{range}.pbf',
    sources: {
      streets: { type: 'vector', tiles: [prefix + 'tile/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: MAP_MAX_ZOOM,
        attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
      route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f5f3eb' } },
      layer('water', 'fill', 'water', { paint: { 'fill-color': '#ccdfe5' } }),
      layer('parks', 'fill', 'park', { paint: { 'fill-color': '#e0e8d5', 'fill-opacity': .7 } }),
      layer('buildings', 'fill', 'building', { minzoom: 14, paint: { 'fill-color': '#e5dfd4' } }),
      layer('roads-casing', 'line', 'transportation', { filter: ['!', rail], paint: { 'line-color': '#d5cec0', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, .5, 14, 2.7, 18, 9] } }),
      layer('roads', 'line', 'transportation', { filter: ['!', rail], paint: { 'line-color': '#fffdfa', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, .3, 14, 1.8, 18, 7] } }),
      layer('rail', 'line', 'transportation', { filter: rail, minzoom: 10, paint: { 'line-color': '#7f89a6', 'line-width': 1.5, 'line-dasharray': [2, 1] } }),
      layer('road-labels', 'symbol', 'transportation_name', { minzoom: 12, layout: { 'symbol-placement': 'line', 'text-field': label, 'text-font': ['Noto Sans Regular'], 'text-size': 12 }, paint: { 'text-color': '#474a44', 'text-halo-color': '#fffdfa', 'text-halo-width': 1.5 } }),
      layer('station-dot', 'circle', 'poi', { minzoom: 14, filter: station, paint: { 'circle-radius': 3, 'circle-color': '#6f7c9a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } }),
      layer('station-labels', 'symbol', 'poi', { minzoom: 15, filter: station, layout: { 'text-field': label, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, .8] }, paint: { 'text-color': '#4b5879', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } }),
      { id: 'plan-order', source: 'route', type: 'line', filter: ['==', ['get', 'verified'], false], paint: { 'line-color': '#507764', 'line-width': 2.5, 'line-dasharray': [2, 2] } },
      { id: 'walking-route', source: 'route', type: 'line', filter: ['==', ['get', 'verified'], true], paint: { 'line-color': '#26674f', 'line-width': 4 } },
      { id: 'route-hit', source: 'route', type: 'line', paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': 24 } },
    ],
  };
}

function loadTripMapEngine() {
  if (!mapLibrePromise) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new URL('travel-map/vendor/maplibre-gl.css', travelMapRoot).href;
    document.head.append(css);
    mapLibrePromise = import(new URL('travel-map/vendor/maplibre-gl.mjs', travelMapRoot).href).then(lib => {
      lib.setWorkerUrl(new URL('travel-map/vendor/maplibre-gl-worker.mjs', travelMapRoot).href);
      lib.addProtocol('traveltile', async (request, controller) => {
        const key = decodeURIComponent(request.url.slice('traveltile://'.length).split('/')[0]);
        const path = mapResourcePath(request.url);
        const cached = key !== 'online' && 'caches' in window ? await caches.match(mapCacheUrl(path), { cacheName: key }) : null;
        if (cached) return { data: await cached.arrayBuffer() };
        if (!navigator.onLine) {
          if (path.startsWith('tile/')) return { data: new ArrayBuffer(0) };
          throw new Error('此字型未包含在離線地圖內');
        }
        const response = await fetch(providerMapAsset(path), { signal: controller.signal });
        if (response.status === 404 && path.startsWith('tile/')) return { data: new ArrayBuffer(0) };
        if (!response.ok) throw new Error('底圖暫時無法載入');
        return { data: await response.arrayBuffer() };
      });
      return lib;
    }).catch(error => { mapLibrePromise = null; css.remove(); throw error; });
  }
  return mapLibrePromise;
}

function mapTileJobs(points) {
  const jobs = new Set();
  for (const [lon, lat] of points) {
    const dLat = 3 / 110.57;
    const dLon = 3 / (111.32 * Math.cos(Math.min(85, Math.abs(lat) + dLat) * Math.PI / 180));
    for (let z = 0; z <= MAP_MAX_ZOOM; z++) {
      const n = 2 ** z;
      const toX = x => Math.floor((x + 180) / 360 * n);
      const toY = y => {
        const radians = Math.max(-85.05, Math.min(85.05, y)) * Math.PI / 180;
        return Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n)));
      };
      for (let x = toX(lon - dLon); x <= toX(lon + dLon); x++) {
        for (let y = toY(lat + dLat); y <= toY(lat - dLat); y++) {
          jobs.add('tile/' + z + '/' + ((x % n + n) % n) + '/' + y + '.pbf');
          if (jobs.size > MAP_MAX_TILES) throw new Error('範圍超過 3,000 個地圖小區塊，請改為分日下載');
        }
      }
    }
  }
  return [...jobs];
}

function tripMapFingerprint(days) {
  return JSON.stringify(days.map(day => [day.date, day.stops.map(stop => [stop.name, stop.time, stop.url, stop.point])]));
}

function mapPackageStem(tripId) {
  return MAP_PACKAGE_PREFIX + encodeURIComponent(accountSession?.accountId || 'guest') + ':' + encodeURIComponent(tripId) + ':';
}

async function listMapPackages(stem = MAP_PACKAGE_PREFIX) {
  if (!('caches' in window)) return [];
  const keys = (await caches.keys()).filter(key => key.startsWith(stem));
  const packages = await Promise.all(keys.map(async key => {
    const response = await caches.match(mapCacheUrl('package.json'), { cacheName: key });
    const meta = await response?.json().catch(() => null);
    return meta ? { ...meta, key } : null;
  }));
  return packages.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

function closeTripMap() {
  if (!travelMapView) return;
  travelMapView.map?.remove();
  travelMapView = null;
}

function tripMapMarkup() {
  return '<div class="trip-map-layout"><aside class="trip-map-sidebar"><label class="field-label">行程日期<select data-map-day></select></label><button type="button" class="button button-primary" data-map-save>下載離線地圖</button><p class="helper" role="status" data-map-offline-status></p></aside><div class="trip-map-content"><div class="trip-map-canvas" data-map-canvas aria-label="旅程地圖"></div><p class="helper" data-map-legend></p><div class="trip-map-warnings" data-map-warnings></div></div></div>';
}

function makeMapMarker(view, stop) {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'trip-map-marker';
  marker.textContent = stop.order;
  marker.title = stop.name;
  const detail = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = [stop.time, stop.name].filter(Boolean).join('　');
  detail.append(title);
  if (stop.url) {
    const link = document.createElement('a');
    link.href = stop.url;
    link.textContent = '用 Google Maps 開啟 ↗';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    detail.append(document.createElement('br'), link);
  }
  const popup = new view.lib.Popup({ offset: 20 }).setDOMContent(detail);
  return new view.lib.Marker({ element: marker }).setLngLat(stop.point).setPopup(popup).addTo(view.map);
}

function selectedMapDays(view) {
  const day = Number(view.day.value);
  return day < 0 ? view.days : [view.days[day]].filter(Boolean);
}

function legacyWalkingSegments(geometry, stops) {
  const points = geometry?.coordinates;
  if (geometry?.type !== 'LineString' || !points?.length) return [];
  let start = 0;
  return stops.slice(1).map((stop, index) => {
    let end = points.length - 1;
    if (index < stops.length - 2) {
      let best = Infinity;
      for (let i = start; i < points.length; i++) {
        const delta = (points[i][0] - stop.point[0]) ** 2 + (points[i][1] - stop.point[1]) ** 2;
        if (delta < best) { best = delta; end = i; }
      }
    }
    const segment = points.slice(start, end + 1);
    start = end;
    return segment;
  });
}

function dayRouteFeatures(day, walking) {
  const resolved = day.stops.every(stop => stop.point);
  const legs = resolved ? (walking?.legs || legacyWalkingSegments(walking, day.stops)) : [];
  return day.stops.slice(1).flatMap((to, i) => {
    const from = day.stops[i];
    if (!from.point || !to.point || from.point.join(',') === to.point.join(',')) return [];
    const coords = legs[i];
    const verified = coords?.length >= 2;
    return [{
      type: 'Feature',
      properties: {
        verified, fromName: from.name, toName: to.name,
        origin: from.point.slice().reverse().join(','), destination: to.point.slice().reverse().join(','),
      },
      geometry: { type: 'LineString', coordinates: verified ? coords : [from.point, to.point] },
    }];
  });
}

function googleRouteLink(properties) {
  const url = new URL('https://www.google.com/maps/dir/');
  url.search = new URLSearchParams({
    api: '1', origin: properties.origin, destination: properties.destination, dir_action: 'navigate',
    ...(properties.verified ? { travelmode: 'walking' } : {}),
  });
  return url.href;
}

function routeNavigationLink(properties, text) {
  const link = document.createElement('a');
  link.href = googleRouteLink(properties);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text;
  return link;
}

function bindMapRoutes(view, map) {
  map.on('mouseenter', 'route-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'route-hit', () => { map.getCanvas().style.cursor = ''; });
  map.on('click', 'route-hit', event => {
    const properties = event.features?.[0]?.properties;
    if (!properties) return;
    view.routePopup?.remove();
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = properties.fromName + ' → ' + properties.toName;
    content.append(title, document.createElement('br'), routeNavigationLink(properties, '在 Google Maps 導航 ↗'));
    view.routePopup = new view.lib.Popup({ offset: 10 }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
  });
}

function renderMapSelection(view) {
  const days = selectedMapDays(view);
  const stops = days.flatMap(day => day.stops);
  const points = stops.filter(stop => stop.point);
  const unresolved = stops.filter(stop => !stop.point);
  const { warnings, canvas, legend } = view;
  const features = days.flatMap(day => dayRouteFeatures(day, view.routes[day.date]));
  view.routePopup?.remove();
  canvas.hidden = !points.length;
  legend.textContent = points.length ? '虛線：行程順序　・　綠色實線：步行路線　・　點路線可開啟導航' : '目前沒有已定位的地標。';
  warnings.replaceChildren();
  if (unresolved.length && !view.locating) {
    const message = document.createElement('p');
    message.textContent = unresolved.length + ' 個行程有地圖連結，但找不到座標。請回到行程編輯補上。';
    warnings.append(message);
    const list = document.createElement('ul');
    for (const stop of unresolved) {
      const item = document.createElement('li');
      item.textContent = stop.name;
      list.append(item);
    }
    warnings.append(list);
  }
  const routeDay = days.length === 1 && !unresolved.length && points.length > 1 && points.length <= 25 ? days[0] : null;
  if (routeDay && !view.routes[routeDay.date] && navigator.onLine) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-soft';
    button.textContent = '查看當日步行路線';
    button.addEventListener('click', () => lookupWalkingRoute(view, routeDay, button));
    warnings.append(button);
  }
  if (days.some(day => view.routes[day.date])) {
    const credit = document.createElement('a');
    credit.href = 'https://www.openstreetmap.org/fixthemap';
    credit.target = '_blank'; credit.rel = 'noopener';
    credit.textContent = '步行路線：FOSSGIS / OSRM · 回報圖資問題';
    warnings.append(credit);
  }
  if (features.length) {
    const detail = document.createElement('details');
    const title = document.createElement('summary');
    title.textContent = '路段導航';
    const list = document.createElement('ul');
    for (const { properties } of features) {
      const item = document.createElement('li');
      item.append(routeNavigationLink(properties, properties.fromName + ' → ' + properties.toName + ' ↗'));
      list.append(item);
    }
    detail.append(title, list);
    warnings.append(detail);
  }
  view.save.disabled = view.isOfflinePage || view.locating || !points.length || offlineDownloadRunning;
  if (!view.map) return;
  view.markers.forEach(marker => marker.remove());
  view.markers = points.map(stop => makeMapMarker(view, stop));
  view.map.getSource('route')?.setData({ type: 'FeatureCollection', features });
  if (!points.length) return;
  view.map.resize();
  const bounds = new view.lib.LngLatBounds();
  points.forEach(stop => bounds.extend(stop.point));
  features.filter(feature => feature.properties.verified).forEach(feature => feature.geometry.coordinates.forEach(point => bounds.extend(point)));
  view.map.fitBounds(bounds, { padding: 45, maxZoom: 15, duration: 0 });
}

async function lookupWalkingRoute(view, day, button) {
  if (Date.now() - lastRouteFetch < 1100) return;
  lastRouteFetch = Date.now();
  button.disabled = true;
  button.textContent = '查詢步行路線中…';
  try {
    const coords = day.stops.map(stop => stop.point.join(',')).join(';');
    const response = await fetch('https://routing.openstreetmap.de/routed-foot/route/v1/driving/' + coords + '?overview=false&geometries=geojson&steps=true', { signal: AbortSignal.timeout(15000) });
    const result = response.ok ? await response.json() : null;
    const legs = result?.routes?.[0]?.legs?.map(leg => leg.steps.flatMap(step => step.geometry.coordinates));
    if (legs?.length !== day.stops.length - 1 || !legs.some(points => points.length >= 2)) throw new Error();
    if (travelMapView !== view) return;
    view.routes[day.date] = { legs };
    if (view.hasPackage) view.status.textContent = '步行路線已有更新，重新下載即可在離線時查看。';
    renderMapSelection(view);
  } catch {
    button.disabled = false;
    button.textContent = '暫時查不到步行路線，點此重試';
  }
}

async function mountTripMap(container, trip, offline = null) {
  closeTripMap();
  container.innerHTML = tripMapMarkup();
  const view = {
    trip, days: offline?.days || tripMapDays(trip), routes: offline?.routes || {}, isOfflinePage: Boolean(offline),
    day: container.querySelector('[data-map-day]'), save: container.querySelector('[data-map-save]'),
    status: container.querySelector('[data-map-offline-status]'), canvas: container.querySelector('[data-map-canvas]'),
    legend: container.querySelector('[data-map-legend]'), warnings: container.querySelector('[data-map-warnings]'),
    markers: [],
  };
  travelMapView = view;
  const all = view.days.length === 1 ? [] : [new Option('全部天數', '-1')];
  view.day.replaceChildren(...all, ...view.days.map((day, i) => new Option(day.date ? formatDate(day.date, { month: 'numeric', day: 'numeric', weekday: 'short' }) : '日期未定', String(i))));
  if ([...view.day.options].some(option => option.value === mapDayByTrip.get(trip.id))) view.day.value = mapDayByTrip.get(trip.id);
  view.day.addEventListener('change', () => { mapDayByTrip.set(trip.id, view.day.value); renderMapSelection(view); });
  view.save.addEventListener('click', () => downloadTripMap(view));
  if (offline) view.save.hidden = true;
  renderMapSelection(view);
  try {
    if (!offline) await resolveMapShortLinks(view);
    const packages = offline ? [offline] : await listMapPackages(mapPackageStem(trip.id));
    if (travelMapView !== view || !container.isConnected) return;
    const existing = packages.find(pack => pack.scope === 'all') || packages[0];
    view.hasPackage = Boolean(existing);
    if (existing) {
      const matching = existing.fingerprint === tripMapFingerprint(view.days);
      view.status.textContent = matching || offline ? '已有離線地圖・' + (existing.scope === 'all' ? '全部天數' : '部分日期') : '行程已有變更，離線地圖需要更新。';
      if (matching) Object.assign(view.routes, existing.routes || {});
    }
    if (!view.days.some(day => day.stops.some(stop => stop.point))) return;
    view.lib = await loadTripMapEngine();
    if (travelMapView !== view || !container.isConnected) return;
    const map = new view.lib.Map({
      container: view.canvas, style: makeTripMapStyle(existing?.key || ''), maxZoom: 18, renderWorldCopies: false,
      center: view.days.flatMap(day => day.stops).find(stop => stop.point).point, zoom: 13,
      dragRotate: false, pitchWithRotate: false, localIdeographFontFamily: 'sans-serif',
    });
    view.map = map;
    map.addControl(new view.lib.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      if (travelMapView !== view) return;
      bindMapRoutes(view, map);
      renderMapSelection(view);
    });
  } catch (error) {
    console.warn('無法載入旅程地圖', error);
    if (travelMapView === view) view.legend.textContent = '裝置目前無法載入地圖。可先從行程使用地圖連結。';
  }
}

async function downloadTripMap(view) {
  if (offlineDownloadRunning) return;
  if (!('serviceWorker' in navigator) || !('caches' in window) || !navigator.onLine) {
    view.status.textContent = '請連上網路，使用正式 HTTPS 網址下載離線地圖。';
    return;
  }
  const days = selectedMapDays(view);
  const points = days.flatMap(day => day.stops.map(stop => stop.point).filter(Boolean));
  if (!points.length) return;
  let jobs;
  try { jobs = mapTileJobs(points); }
  catch (error) { view.status.textContent = error.message; return; }
  const estimatedMb = Math.min(50, Math.max(1, Math.ceil(jobs.length * 28000 / 1000000)));
  if (!confirm('下載已定位地標周圍 3 公里的地圖，共 ' + jobs.length + ' 個地圖小區塊，預估約 ' + estimatedMb + ' MB，以實際下載為準。下載的地標與時間可在這台裝置免登入離線查看。')) return;
  offlineDownloadRunning = true;
  view.save.disabled = true;
  view.day.disabled = true;
  const scope = view.day.value === '-1' || view.days.length === 1 ? 'all' : days[0].date || 'undated';
  const stem = mapPackageStem(view.trip.id);
  const key = stem + crypto.randomUUID();
  const controller = new AbortController();
  let bytes = 0, done = 0;
  try {
    await navigator.serviceWorker.register(new URL('travel-sw.js', travelMapRoot), { updateViaCache: 'none' });
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('離線功能尚未準備好，請重新整理後再試')), 20000)),
    ]);
    const oldPackages = await listMapPackages(stem);
    const cache = await caches.open(key);
    const resources = [...jobs, ...MAP_GLYPHS.map(start => 'font/' + start + '-' + (start + 255) + '.pbf')];
    let cursor = 0;
    async function fetchNext() {
      while (cursor < resources.length && !controller.signal.aborted) {
        const path = resources[cursor++];
        const response = await fetch(SHARE_API_URL + '/map-assets/' + path, { signal: controller.signal });
        const missing = response.status === 404 && response.headers.get('Content-Type') === 'application/x-protobuf';
        if (!response.ok && !missing) throw new Error('地圖下載中斷，請稍後重試');
        const payload = missing ? new ArrayBuffer(0) : await response.arrayBuffer();
        bytes += payload.byteLength;
        if (bytes > MAP_MAX_BYTES) throw new Error('超過 50 MB 上限，請分天或分區下載');
        if (!missing || path.startsWith('tile/')) await cache.put(mapCacheUrl(path), new Response(payload));
        view.status.textContent = '下載中 ' + (++done) + '／' + resources.length + '・' + (bytes / 1000000).toFixed(1) + ' MB';
      }
    }
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => fetchNext().catch(error => { controller.abort(); throw error; })));
    const error = results.find(result => result.status === 'rejected' && result.reason?.name !== 'AbortError');
    if (error) throw error.reason;
    if (controller.signal.aborted) throw new Error('下載已中斷');
    const routes = Object.fromEntries(days.filter(day => view.routes[day.date]).map(day => [day.date, view.routes[day.date]]));
    await cache.put(mapCacheUrl('package.json'), Response.json({
      title: view.trip.title, tripId: view.trip.id, days, scope, routes, bytes, createdAt: Date.now(), fingerprint: tripMapFingerprint(view.days),
    }));
    for (const pack of oldPackages) if (pack.scope === scope || scope === 'all') await caches.delete(pack.key);
    view.hasPackage = true;
    view.status.textContent = '下載完成・' + (bytes / 1000000).toFixed(1) + ' MB。可從首頁的「離線地圖」開啟。';
  } catch (error) {
    await caches.delete(key);
    view.status.textContent = error.message || '無法下載地圖，請檢查瀏覽器剩餘空間';
  } finally {
    offlineDownloadRunning = false;
    view.save.disabled = false;
    view.day.disabled = false;
  }
}

async function renderOfflineMaps(key = '') {
  app.innerHTML = '<div class="page-intro"><h1>離線地圖</h1><p class="helper" role="status">讀取這台裝置的地圖…</p></div>';
  try {
    const packages = await listMapPackages();
    if (!location.hash.startsWith('#offline-maps')) return;
    const pack = packages.find(item => item.key === key);
    if (pack) {
      app.innerHTML = '<p><a href="#offline-maps">← 離線地圖</a></p><h1></h1><div data-offline-trip-map></div>';
      app.querySelector('h1').textContent = pack.title;
      await mountTripMap(app.querySelector('[data-offline-trip-map]'), { id: pack.tripId, title: pack.title }, pack);
      return;
    }
    const list = document.createElement('div');
    list.className = 'offline-map-list';
    for (const saved of packages) {
      const row = document.createElement('div');
      const open = document.createElement('a');
      open.href = '#offline-maps/' + encodeURIComponent(saved.key);
      open.textContent = saved.title + '・' + (saved.scope === 'all' ? '全部天數' : saved.scope);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'button button-ghost'; remove.textContent = '移除下載';
      remove.addEventListener('click', async () => {
        if (confirm('移除這台裝置的離線地圖？')) { await caches.delete(saved.key); renderOfflineMaps(); }
      });
      row.append(open, remove);
      list.append(row);
    }
    app.querySelector('[role="status"]').textContent = packages.length ? '地圖儲存在這台裝置，可在離線時開啟。' : '目前沒有下載。請從旅程的「旅程地圖」儲存要帶出門的範圍。';
    app.append(list);
  } catch {
    if (location.hash.startsWith('#offline-maps')) app.querySelector('[role="status"]').textContent = '這個瀏覽器無法讀取離線地圖。';
  }
}
