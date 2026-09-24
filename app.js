const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modal-content');
const fileInput = document.querySelector('#file');
const toastElement = document.querySelector('#toast');
const confirmDialog = document.querySelector('#confirm-dialog');
const confirmTitle = document.querySelector('#confirm-title');
const confirmMessage = document.querySelector('#confirm-message');
const DEFAULT_DOCUMENT_TITLE = document.title;

const STORAGE_KEY = 'travelBookV3';
const PREVIOUS_KEYS = ['travelBookV2', 'travelBook'];
const SHARE_KEY_STORAGE = 'travelShareWriteKey';
const SHARE_RECORDS_STORAGE = 'travelShareRecords';
const SHARE_API_URL = 'https://travel-share-api.ryankian7.workers.dev';
const PUBLIC_SITE_URL = 'https://kian731.github.io/traveltraces/';
const TURNSTILE_SITE_KEY = '0x4AAAAAAEvwNDo21D2D_HK8';
const SHARE_REFRESH_INTERVAL = 5000;
const HOME_HERO_IMAGE = 'https://images.unsplash.com/photo-1595789412965-8a2d37e7cfe5?auto=format&fit=crop&w=1800&q=85';
const DEFAULT_THEME = { accent: '#325e4b', warm: '#c66e45', background: '#f6f6f2' };
const DOMESTIC_TRANSPORTS = ['國內航班', '客運', '火車', '高鐵', '捷運', '開車', '機車', '渡輪', '自行車', '其他'];
const EXPENSE_CATEGORIES = ['住宿', '交通', '主食', '小吃', '零食', '飲料', '購物', '生活用品', '保健', '門票', '通訊', '其他'];
const EXPENSE_COLORS = ['#325e4b', '#c66e45', '#d5a94e', '#718b78', '#6f84a5', '#a56f83', '#8d7654', '#7f799d', '#4d8f92', '#b17b54', '#8a9b58', '#8b8f8c'];
const clone = value => JSON.parse(JSON.stringify(value));
const normalizeHex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;

const defaultNotes = [
  ['出發前檢查', '護照效期、簽證、保險與網路都確認好了嗎？', '建議護照至少保留六個月效期，並將重要文件備份到可離線存取的位置。'],
  ['行李與天氣', '依照季節整理衣物，保留一些空間給旅途中購買的物品。', '出發前三天再確認一次天氣；液體與行動電源也要符合航空公司的規定。'],
  ['交通與付款', '先查好機場往返市區的方式，準備至少兩種付款工具。', '將住宿地址保存成當地語言，並下載離線地圖，抵達時會輕鬆很多。']
];

const sampleTrip = {
  id: 'tokyo-autumn', title: '東京秋日散策', country: '日本', cities: ['東京'], origin: 'TPE｜桃園國際機場', destination: 'NRT｜東京成田國際機場',
  start: '2026-10-04T09:15', end: '2026-10-09T18:30', airline: '中華航空', flight: 'CI100', status: '已確認', people: '2', companions: 'Kian、Nina', budget: '42000',
  planDays: [
    { date: '2026-10-04', items: [{ time: '14:30', activity: '抵達與飯店入住', transport: 'Skyliner', map: '', note: '傍晚在上野散步' }] },
    { date: '2026-10-05', items: [{ time: '09:00', activity: '明治神宮與表參道', transport: 'JR 山手線', map: '', note: '預留時間逛選物店' }, { time: '18:00', activity: '澀谷晚餐', transport: '步行', map: '', note: '可視體力調整' }] }
  ],
  expenses: [{ date: '2026-10-04', category: '交通', item: '機票', price: '16800', quantity: '2', split: '2', note: '含托運行李' }, { date: '2026-10-04', category: '住宿', item: '住宿', price: '12400', quantity: '1', split: '2', note: '5 晚' }]
};

function defaultChecklist(settings) {
  return settings.checklistTemplates.map(group => ({ category: group.category, items: group.items.map(name => ({ name, checked: false })) }));
}

function defaultData() {
  const settings = normalizeSettings(TRAVEL_CATALOG);
  return { version: 3, settings, trips: [normalizeTrip(sampleTrip, settings)], countryNotes: {}, notes: clone(defaultNotes) };
}

function normalizeSettings(raw = {}) {
  const base = clone(TRAVEL_CATALOG);
  const savedTheme = raw.theme && typeof raw.theme === 'object' ? raw.theme : {};
  base.theme = { accent: normalizeHex(savedTheme.accent, DEFAULT_THEME.accent), warm: normalizeHex(savedTheme.warm, DEFAULT_THEME.warm), background: normalizeHex(savedTheme.background, DEFAULT_THEME.background) };
  const countries = raw.countries && typeof raw.countries === 'object' ? raw.countries : {};
  Object.entries(countries).forEach(([name, item]) => {
    base.countries[name] = {
      emoji: String(item.emoji || '🌍'), color: String(item.color || '#4f665b'), image: String(item.image || ''),
      cities: Array.isArray(item.cities) ? item.cities.map(String) : [], airports: Array.isArray(item.airports) ? item.airports.map(String) : []
    };
  });
  if (Array.isArray(raw.originAirports)) base.originAirports = raw.originAirports.map(String);
  if (raw.airlinesByAirport && typeof raw.airlinesByAirport === 'object') {
    Object.entries(raw.airlinesByAirport).forEach(([code, airlines]) => { if (Array.isArray(airlines)) base.airlinesByAirport[code] = airlines.map(String); });
  }
  if (Array.isArray(raw.checklistTemplates)) {
    base.checklistTemplates = raw.checklistTemplates.map(group => ({ category: String(group.category || '其他'), items: Array.isArray(group.items) ? group.items.map(String) : [] }));
  }
  return base;
}

function sortPlanItems(items = []) {
  return [...items].sort((a, b) => {
    const left = String(a.time || '99:99'); const right = String(b.time || '99:99');
    return left.localeCompare(right, 'zh-TW', { numeric: true });
  });
}

function normalizePlan(trip) {
  if (Array.isArray(trip.planDays)) return trip.planDays.map(day => ({
    date: String(day.date || ''), items: sortPlanItems(Array.isArray(day.items) ? day.items.map(item => ({ time: String(item.time || ''), activity: String(item.activity || ''), transport: String(item.transport || ''), map: String(item.map || ''), note: String(item.note || '') })) : [])
  }));
  const grouped = new Map();
  (Array.isArray(trip.plan) ? trip.plan : []).forEach(row => {
    if (!Array.isArray(row)) return;
    const date = String(row[0] || '');
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push({ time: String(row[1] || ''), activity: String(row[2] || ''), transport: String(row[3] || ''), map: '', note: String(row[4] || '') });
  });
  return [...grouped].map(([date, items]) => ({ date, items: sortPlanItems(items) }));
}

function normalizeExpenses(trip) {
  if (Array.isArray(trip.expenses)) return trip.expenses.map(row => ({ date: String(row.date || ''), category: String(row.category || '其他'), item: String(row.item || ''), price: String(row.price || ''), quantity: String(row.quantity || '1'), split: String(row.split || ''), note: String(row.note || '') }));
  return (Array.isArray(trip.cost) ? trip.cost : []).filter(Array.isArray).map(row => ({ date: '', category: '其他', item: String(row[0] || ''), price: String(row[1] || ''), quantity: String(row[2] || '1'), split: '', note: String(row[3] || '') }));
}

function normalizeChecklist(raw, settings) {
  if (!Array.isArray(raw)) return defaultChecklist(settings);
  return raw.map(group => ({ category: String(group.category || '其他'), items: Array.isArray(group.items) ? group.items.map(item => typeof item === 'string' ? { name: item, checked: false } : { name: String(item.name || ''), checked: Boolean(item.checked) }) : [] }));
}

function normalizeTrip(trip = {}, settings = data?.settings || normalizeSettings()) {
  return {
    id: String(trip.id || crypto.randomUUID()), title: String(trip.title || '未命名旅程'), country: String(trip.country || '日本'),
    travelScope: trip.travelScope === 'domestic' ? 'domestic' : 'international', domesticTransport: String(trip.domesticTransport || ''), transportDetail: String(trip.transportDetail || ''),
    cities: Array.isArray(trip.cities) ? trip.cities.map(String) : [], origin: String(trip.origin || ''), destination: String(trip.destination || ''),
    coverImage: String(trip.coverImage || ''),
    start: String(trip.start || ''), end: String(trip.end || ''), airline: String(trip.airline || ''), flight: String(trip.flight || ''),
    sameReturnAirline: trip.sameReturnAirline === undefined ? true : Boolean(trip.sameReturnAirline), returnAirline: String(trip.returnAirline || ''), returnFlight: String(trip.returnFlight || ''), status: String(trip.status || ''),
    people: String(trip.people || '1'), companions: String(trip.companions || ''), budget: String(trip.budget || ''), budgetCurrency: String(trip.budgetCurrency || 'TWD').trim().toUpperCase() || 'TWD',
    planDays: normalizePlan(trip), expenses: normalizeExpenses(trip), checklist: normalizeChecklist(trip.checklist, settings)
  };
}

function normalizeData(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.trips)) throw new Error('資料格式不正確');
  const settings = normalizeSettings(raw.settings);
  return { version: 3, settings, trips: raw.trips.map(trip => normalizeTrip(trip, settings)), countryNotes: raw.countryNotes && typeof raw.countryNotes === 'object' ? raw.countryNotes : (raw.country || {}), notes: Array.isArray(raw.notes) ? raw.notes : (Array.isArray(raw.info) ? raw.info : clone(defaultNotes)) };
}

function loadData() {
  for (const key of [STORAGE_KEY, ...PREVIOUS_KEYS]) {
    try { const saved = localStorage.getItem(key); if (saved) return normalizeData(JSON.parse(saved)); }
    catch (error) { console.warn(`無法讀取 ${key}`, error); }
  }
  return defaultData();
}

let data = loadData();
let homeStatsScope = 'all';
let activePlanDraft = [];
let activeExpenseDraft = [];
let activeSharedImport = null;
let activeCollaboration = null;
let shareRefreshTimer = null;
function shadeHex(hex, amount = -22) { const clean = String(hex || '').replace('#', ''); if (!/^[0-9a-f]{6}$/i.test(clean)) return DEFAULT_THEME.accent; const value = Number.parseInt(clean, 16); const channel = shift => Math.max(0, Math.min(255, shift + amount)); return `#${[value >> 16, value >> 8 & 255, value & 255].map(channel => channel.toString(16).padStart(2, '0')).join('')}`; }
function applyTheme(theme = data.settings.theme || DEFAULT_THEME) { const root = document.documentElement; root.style.setProperty('--accent', theme.accent || DEFAULT_THEME.accent); root.style.setProperty('--accent-hover', shadeHex(theme.accent || DEFAULT_THEME.accent)); root.style.setProperty('--warm', theme.warm || DEFAULT_THEME.warm); root.style.setProperty('--bg', theme.background || DEFAULT_THEME.background); }
applyTheme();
saveData();

function saveData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch (error) { console.error('無法儲存旅行資料', error); alert('瀏覽器儲存空間不足，請改用較小的封面圖片或先備份並移除不需要的圖片。'); return false; } }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function linkifyText(value) {
  const text = String(value ?? ''); const pattern = /(?:https?:\/\/|www\.)[^\s<>"']+/gi; let output = ''; let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    let visible = match[0]; const trailingMatch = visible.match(/[.,，。!?！？;；:：)）\]】]+$/); const trailing = trailingMatch?.[0] || '';
    if (trailing) visible = visible.slice(0, -trailing.length);
    const href = visible.toLowerCase().startsWith('www.') ? `https://${visible}` : visible;
    output += escapeHtml(text.slice(lastIndex, match.index)) + `<a class="auto-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(visible)}</a>` + escapeHtml(trailing);
    lastIndex = match.index + match[0].length;
  }
  return output + escapeHtml(text.slice(lastIndex));
}
function lines(value) { return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean); }
function airportCode(value) { return String(value || '').split(/[｜|\s]/)[0].toUpperCase(); }
function countryOf(name) { return data.settings.countries[name] || { emoji: '🌍', color: '#4f665b', image: '', cities: [], airports: [] }; }
function formatDate(value, options = { year: 'numeric', month: 'short', day: 'numeric' }) { if (!value) return '日期未定'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '日期未定' : new Intl.DateTimeFormat('zh-TW', options).format(date); }
function tripDays(trip) { if (!trip.start || !trip.end) return '天數未定'; const start = new Date(trip.start); const end = new Date(trip.end); const diff = Math.max(0, Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000)); return `${diff + 1} 天 ${diff} 夜`; }
function isUpcoming(trip) { return !trip.end || new Date(trip.end) >= new Date(); }
function money(value) { return new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(Number(value) || 0); }
function routeText(trip) { return [trip.origin, trip.destination].filter(Boolean).join(' → ') || '路線未設定'; }
function routeCodeText(trip) { return [airportCode(trip.origin), airportCode(trip.destination)].filter(Boolean).join(' → ') || '路線未設定'; }
function personalExpense(row) { return ((Number(row.price) || 0) * (Number(row.quantity) || 1)) / Math.max(1, Number(row.split) || 1); }
function isRecordComplete(trip) { return Boolean(trip.title && trip.country && trip.origin && trip.destination && trip.start && trip.end); }
function tripImage(trip) { return trip.coverImage || countryOf(trip.country).image; }
function countdown(trip) {
  if (!trip.start) return { value: '—', label: '日期未定' };
  const now = new Date(); const start = new Date(trip.start); const days = Math.ceil((start - now) / 86400000);
  if (days > 0) return { value: days, label: '天後出發' };
  if (days === 0) return { value: 'TODAY', label: '今天出發' };
  return { value: '—', label: '旅程已開始' };
}

function nearestTripCountdown(trips) {
  const now = new Date();
  const active = trips.find(trip => trip.start && trip.end && new Date(trip.start) <= now && new Date(trip.end) >= now);
  if (active) return { trip: active, text: '進行中', active: true };
  const future = trips.filter(trip => trip.start && new Date(trip.start) > now).sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  if (!future) return null;
  return { trip: future, text: countdownDetail(future.start, now), active: false };
}

function countdownDetail(start, now = new Date()) {
  const totalSeconds = Math.max(0, Math.floor((new Date(start) - now) / 1000));
  const days = Math.floor(totalSeconds / 86400); const hours = Math.floor(totalSeconds % 86400 / 3600); const minutes = Math.floor(totalSeconds % 3600 / 60); const seconds = totalSeconds % 60;
  return `倒數 ${days}天 ${hours}小時 ${minutes}分 ${seconds}秒`;
}

let homeCountdownTimer;
function startHomeCountdown() {
  clearInterval(homeCountdownTimer); const element = app.querySelector('[data-next-countdown]'); if (!element) return;
  const update = () => { const remaining = new Date(element.dataset.nextCountdown) - new Date(); if (remaining <= 0) { element.textContent = '進行中'; clearInterval(homeCountdownTimer); return; } element.textContent = countdownDetail(element.dataset.nextCountdown); };
  update(); homeCountdownTimer = setInterval(update, 1000);
}

let toastTimer;
function showToast(message) { toastElement.textContent = message; toastElement.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastElement.classList.remove('show'), 2600); }
let confirmResolver;
function closeDeleteConfirmation(confirmed) { if (!confirmResolver) return; const resolve = confirmResolver; confirmResolver = null; if (confirmDialog.open) confirmDialog.close(); resolve(confirmed); }
function confirmDeletion(message, title = '確認刪除') {
  if (confirmResolver) closeDeleteConfirmation(false);
  confirmTitle.textContent = title; confirmMessage.textContent = message; confirmDialog.showModal();
  return new Promise(resolve => { confirmResolver = resolve; });
}
function emptyState(title, copy, action = true) { return `<div class="empty"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p>${action ? '<button class="button button-primary" data-action="new">新增第一趟旅程</button>' : ''}</div>`; }
function pageBack(actions = '') { return `<div class="page-back"><button class="button button-ghost" data-action="back" type="button">← 返回上一頁</button>${actions ? `<div class="page-back-actions">${actions}</div>` : ''}</div>`; }

function tripCard(trip) {
  const destination = countryOf(trip.country);
  const upcoming = isUpcoming(trip); const remaining = countdown(trip); const complete = isRecordComplete(trip);
  return `<a class="trip-card ${upcoming ? 'upcoming-card' : 'past-card'}" href="#trip/${encodeURIComponent(trip.id)}" aria-label="查看${escapeHtml(trip.title)}旅程">${upcoming ? `<div class="trip-countdown"><b>${remaining.value}</b><span>${remaining.label}</span></div>` : ''}<div class="trip-thumb" role="img" aria-label="${escapeHtml(trip.country)}旅行風景" style="--image:url('${tripImage(trip)}');--fallback:${destination.color}"></div><div class="trip-body"><div class="memory-mobile-head"><strong>${escapeHtml(trip.country)}</strong><span>${escapeHtml(routeCodeText(trip))}</span></div><p class="memory-trip-title">${escapeHtml(trip.title)}</p><div class="trip-title-row"><h3>${escapeHtml(trip.title)}</h3><p class="trip-route">${escapeHtml(routeText(trip))}</p></div><div class="record-row"><span class="status ${upcoming ? '' : 'past'}">${upcoming ? '即將出發' : '旅程回憶'}</span>${complete ? '' : '<span class="record-state">待完成記錄</span>'}</div><p class="trip-meta"><span>${formatDate(trip.start)}－${formatDate(trip.end)}</span><span>${tripDays(trip)}</span></p><div class="trip-cities">${(trip.cities.length ? trip.cities : ['尚未選擇']).map(city => `<span class="city-tag">${escapeHtml(city)}</span>`).join('')}</div></div></a>`;
}

function notesMarkup(notes, context = 'home') {
  return notes.map((note, index) => `<article class="note-card"><div class="topline"><h3>${escapeHtml(note[0])}</h3>${context === 'home' ? '' : `<button class="icon-button" data-action="edit-${context}-note" data-index="${index}" aria-label="編輯${escapeHtml(note[0])}">✎</button>`}</div><p>${linkifyText(note[1])}</p><button class="text-button" data-action="read-${context}-note" data-index="${index}">閱讀更多 →</button></article>`).join('');
}

function renderHome() {
  const upcoming = [...data.trips].filter(isUpcoming).sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'));
  const past = [...data.trips].filter(trip => !isUpcoming(trip)).sort((a, b) => b.start.localeCompare(a.start));
  const currentYear = new Date().getFullYear();
  const scopedTrips = homeStatsScope === 'year' ? data.trips.filter(trip => trip.start && new Date(trip.start).getFullYear() === currentYear) : data.trips;
  const countries = new Set(scopedTrips.map(trip => trip.country)).size;
  const cities = new Set(scopedTrips.flatMap(trip => trip.cities)).size;
  const totalDays = scopedTrips.reduce((sum, trip) => { if (!trip.start || !trip.end) return sum; const start = new Date(trip.start); const end = new Date(trip.end); return sum + Math.max(1, Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1); }, 0);
  const visitedCountries = Object.entries(data.settings.countries).filter(([name]) => data.trips.some(trip => trip.country === name));
  const nextCountdown = nearestTripCountdown(upcoming);
  const hero = countryOf('日本');
  app.innerHTML = `<section class="hero" style="--hero-image:url('${HOME_HERO_IMAGE}');--fallback:${hero.color}"><div class="hero-content"><p class="eyebrow">Personal travel archive</p><h1>把走過的地方，<br>好好收藏起來。</h1><p>從出發前的規劃，到旅途後的回憶，都放在同一個簡單、安靜的地方。</p><button class="button button-primary" data-action="new">規劃一趟新旅程</button></div></section>
  <div class="stats" aria-label="旅行統計"><div class="stats-scope"><span class="scope-mark" aria-hidden="true">🏅</span><div><button class="${homeStatsScope === 'all' ? 'active' : ''}" data-stats-scope="all">總和</button><button class="${homeStatsScope === 'year' ? 'active' : ''}" data-stats-scope="year">今年</button></div></div><div class="stat"><b>${countries}</b><span>個國家</span></div><div class="stat"><b>${cities}</b><span>個城市</span></div><div class="stat"><b>${totalDays}</b><span>個旅行日</span></div></div>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Destinations</p><h2>目的地收藏</h2></div><div class="carousel-controls"><button class="icon-button" data-carousel="prev" aria-label="上一個目的地">←</button><button class="icon-button" data-carousel="next" aria-label="下一個目的地">→</button></div></div>
    <div class="country-carousel" id="country-carousel">${visitedCountries.map(([name, item]) => { const count = data.trips.filter(trip => trip.country === name).length; return `<button class="country-card" data-country="${escapeHtml(name)}" style="--image:url('${item.image}');--fallback:${item.color}"><span class="country-emoji">${item.emoji}</span><span><strong>${escapeHtml(name)}</strong><br>${count} 趟旅程</span></button>`; }).join('') || emptyState('還沒有目的地收藏', '建立第一趟旅程後，目的地會出現在這裡。')}</div>
  </section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Up next</p><div class="next-title-row"><h2>即將出發</h2>${nextCountdown ? `<div class="next-countdown ${nextCountdown.active ? 'active' : ''}"><span>${escapeHtml(nextCountdown.trip.title)}</span><b ${nextCountdown.active ? '' : `data-next-countdown="${escapeHtml(nextCountdown.trip.start)}"`}>${escapeHtml(nextCountdown.text)}</b></div>` : ''}</div></div></div><div class="trip-list">${upcoming.length ? upcoming.map(tripCard).join('') : emptyState('還沒有即將出發的旅程', '新增日期與目的地，開始慢慢期待。')}</div></section>
  <section class="section" id="memories"><div class="section-head"><div><p class="eyebrow">Memories</p><h2>旅行回憶</h2></div></div><div class="trip-list">${past.length ? past.map(tripCard).join('') : emptyState('回憶正在累積', '完成的旅程會收藏在這裡。', false)}</div></section>
  <section class="section" id="notes"><div class="section-head"><div><p class="eyebrow">Travel notes</p><h2>旅行筆記</h2></div><p class="section-copy notes-copy">把每次出發都會用到的提醒，整理成自己的旅行清單。</p></div><div class="note-grid">${notesMarkup(data.notes)}</div></section>`;
  startHomeCountdown();
}

function countryNotes(country) { const notes = data.countryNotes[country]; return Array.isArray(notes) && notes.length ? notes : defaultNotes; }
function renderCountry(country, city = '') {
  const destination = countryOf(country); const countryTrips = data.trips.filter(trip => trip.country === country); const visitedCities = [...new Set(countryTrips.flatMap(trip => trip.cities))]; const trips = countryTrips.filter(trip => !city || trip.cities.includes(city));
  app.innerHTML = `${pageBack()}<section class="page-intro"><p class="eyebrow">Destination archive</p><h1>${destination.emoji} ${escapeHtml(country)}</h1><p class="section-copy">${countryTrips.length} 趟旅程，造訪過 ${visitedCities.length} 個城市。</p><div class="cover-strip" role="img" aria-label="${escapeHtml(country)}旅行風景" style="--cover:url('${destination.image}');--fallback:${destination.color}"></div></section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">My history</p><h2>我的 ${escapeHtml(country)} 旅程</h2></div><button class="button button-primary" data-action="new" data-country="${escapeHtml(country)}">新增旅程</button></div><div class="filters"><button class="filter ${city ? '' : 'active'}" data-city="" data-country="${escapeHtml(country)}">全部</button>${visitedCities.map(name => `<button class="filter ${city === name ? 'active' : ''}" data-city="${escapeHtml(name)}" data-country="${escapeHtml(country)}">${escapeHtml(name)}</button>`).join('')}</div><div class="trip-list">${trips.length ? trips.map(tripCard).join('') : emptyState(city ? `還沒有 ${city} 的紀錄` : `還沒有 ${country} 的旅程`, '新增一趟旅程，建立你的目的地收藏。')}</div></section>
  <section class="section country-notes"><div class="section-head"><div><p class="eyebrow">Quick notes</p><h2>出發小筆記</h2></div></div><div class="note-grid">${countryNotes(country).map((note, index) => `<article class="note-card"><div class="topline"><h3>${escapeHtml(note[0])}</h3><button class="icon-button" data-action="edit-country-note" data-country="${escapeHtml(country)}" data-index="${index}" aria-label="編輯${escapeHtml(note[0])}">✎</button></div><p>${linkifyText(note[1])}</p><button class="text-button" data-action="read-country-note" data-country="${escapeHtml(country)}" data-index="${index}">閱讀更多 →</button></article>`).join('')}</div></section>`;
}

function expenseAmount(row) { return (Number(row.price) || 0) * (Number(row.quantity) || 1); }
function tripMoney(trip, value) { return `${trip.budgetCurrency || 'TWD'} ${money(value)}`; }
function expenseChartMarkup(trip, gross, personal) {
  const totals = new Map();
  trip.expenses.forEach(row => totals.set(row.category || '其他', (totals.get(row.category || '其他') || 0) + expenseAmount(row)));
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]); let cursor = 0;
  const segments = entries.map(([, amount], index) => { const start = cursor; cursor += gross ? amount / gross * 100 : 0; return `${EXPENSE_COLORS[index % EXPENSE_COLORS.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`; });
  const chart = segments.length ? `conic-gradient(${segments.join(',')})` : 'conic-gradient(#e4e6e1 0 100%)';
  const budget = Number(trip.budget) || 0; const balance = budget - personal;
  return `<div class="expense-summary"><div class="expense-chart" style="--expense-chart:${chart}" role="img" aria-label="支出分類比例圓形圖"><div><strong>${escapeHtml(tripMoney(trip, gross))}</strong><span>總支出</span></div></div><div class="expense-legend">${entries.map(([category, amount], index) => `<div><i style="--legend-color:${EXPENSE_COLORS[index % EXPENSE_COLORS.length]}"></i><span>${escapeHtml(category)}</span><b>${escapeHtml(tripMoney(trip, amount))}</b><small>${gross ? Math.round(amount / gross * 100) : 0}%</small></div>`).join('')}</div><div class="expense-budget"><span>預算</span><strong>${budget ? escapeHtml(tripMoney(trip, budget)) : '尚未設定'}</strong>${budget ? `<small class="${balance < 0 ? 'over' : ''}">${balance < 0 ? `超出 ${escapeHtml(tripMoney(trip, Math.abs(balance)))}` : `剩餘 ${escapeHtml(tripMoney(trip, balance))}`}</small>` : ''}<span>個人實付</span><strong>${escapeHtml(tripMoney(trip, personal))}</strong></div></div>`;
}

function expenseListMarkup(trip) {
  const sorted = [...trip.expenses].sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));
  const groups = new Map(); sorted.forEach(row => { const date = row.date || ''; if (!groups.has(date)) groups.set(date, []); groups.get(date).push(row); });
  return [...groups].map(([date, rows]) => `<section class="expense-date-group"><h3>${date ? escapeHtml(formatDate(date, { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })) : '日期未設定'}</h3><div class="table-card"><div class="expense-display-head"><span>分類／項目</span><div class="expense-numbers-head"><span>單價／個人實付</span><span>數量</span><span>平分</span></div><span>備註</span></div>${rows.map(row => `<div class="expense-display-row"><strong><small class="expense-category-badge">${escapeHtml(row.category || '其他')}</small>${escapeHtml(row.item)}</strong><div class="expense-numbers"><span>${escapeHtml(tripMoney(trip, row.price))}${Number(row.split) > 1 ? `<small>個人 ${escapeHtml(tripMoney(trip, personalExpense(row)))}</small>` : ''}</span><span>${escapeHtml(row.quantity)}</span><span>${Number(row.split) > 1 ? `${escapeHtml(row.split)} 人` : '—'}</span></div><span class="expense-note preserve-lines">${linkifyText(row.note || '—')}</span></div>`).join('')}</div></section>`).join('');
}

function switchTripContentTab(tab) {
  const available = [...app.querySelectorAll('[data-trip-tab]')]; if (!available.some(button => button.dataset.tripTab === tab)) return;
  available.forEach(button => { const active = button.dataset.tripTab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  app.querySelectorAll('[data-trip-panel]').forEach(panel => { panel.hidden = panel.dataset.tripPanel !== tab; });
}

function renderTrip(id) {
  const trip = data.trips.find(item => item.id === id); if (!trip) return renderNotFound();
  const destination = countryOf(trip.country); const gross = trip.expenses.reduce((sum, row) => sum + expenseAmount(row), 0); const personal = trip.expenses.reduce((sum, row) => sum + personalExpense(row), 0);
  const checklistItems = trip.checklist.flatMap(group => group.items); const checked = checklistItems.filter(item => item.checked).length;
  const canQuickCheck = isUpcoming(trip);
  const travelDetails = trip.travelScope === 'domestic' ? `<div><span>旅遊類型</span><b>國內旅遊</b></div><div><span>主要交通</span><b>${escapeHtml([trip.domesticTransport, trip.transportDetail].filter(Boolean).join(' · ') || '尚未填寫')}</b></div>` : `<div><span>出國航班</span><b>${escapeHtml([trip.airline, trip.flight].filter(Boolean).join(' ') || '尚未填寫')}</b></div><div><span>回國航班</span><b>${escapeHtml([trip.sameReturnAirline ? trip.airline : trip.returnAirline, trip.returnFlight].filter(Boolean).join(' ') || '尚未填寫')}</b></div>`;
  const expenseContent = trip.expenses.length ? `${expenseChartMarkup(trip, gross, personal)}${expenseListMarkup(trip)}` : emptyState('還沒有支出紀錄', '記下每日住宿、交通與餐飲，預算會更清楚。', false);
  const topActions = `<button class="button button-ghost" data-action="print-trip" data-id="${escapeHtml(trip.id)}">匯出 PDF</button><button class="button button-ghost" data-action="share-trip" data-id="${escapeHtml(trip.id)}">分享旅程</button>`;
  app.innerHTML = `${pageBack(topActions)}<section class="trip-hero"><div class="trip-hero-copy"><p class="eyebrow">Trip record</p><div class="record-row"><h1>${escapeHtml(trip.title)}</h1>${isRecordComplete(trip) ? '' : '<span class="record-state">待完成記錄</span>'}</div><p class="route-large">${escapeHtml(routeText(trip))}</p><div class="detail-grid"><div class="detail-date-row"><div><span>旅行日期</span><b>${formatDate(trip.start)}－${formatDate(trip.end)}</b></div><div><span>旅行天數</span><b>${tripDays(trip)}</b></div></div>${travelDetails}<div><span>同行</span><b>${escapeHtml(trip.companions || `${trip.people || 1} 人`)}</b></div><div><span>預算</span><b>${trip.budget ? escapeHtml(tripMoney(trip, trip.budget)) : '尚未設定'}</b></div><div class="detail-status"><span>狀態</span><b>${escapeHtml(trip.status || '規劃中')}</b></div></div></div><div class="trip-hero-image" role="img" aria-label="${escapeHtml(trip.country)}旅行風景" style="--trip-image:url('${tripImage(trip)}');--fallback:${destination.color}"></div></section>
  <div class="trip-record-actions trip-content-tabs" role="tablist" aria-label="旅程內容"><button class="button active" type="button" role="tab" aria-selected="true" aria-controls="trip-itinerary" data-trip-tab="itinerary">每日行程</button><button class="button" type="button" role="tab" aria-selected="false" aria-controls="trip-expenses" data-trip-tab="expenses">旅行支出</button><button class="button" type="button" role="tab" aria-selected="false" aria-controls="trip-checklist" data-trip-tab="checklist">準備清單</button></div>
  <div class="trip-tab-panels"><section class="section trip-tab-panel" id="trip-itinerary" data-trip-panel="itinerary" role="tabpanel"><div class="section-head"><div><p class="eyebrow">Itinerary</p><h2>每日行程</h2></div><button class="button button-ghost" data-action="edit" data-id="${escapeHtml(trip.id)}" data-tab="itinerary">編輯</button></div>${trip.planDays.length ? `<div class="day-list">${trip.planDays.map(day => `<article class="day-card"><button class="day-date" type="button" data-toggle-trip-day aria-expanded="true"><span>${escapeHtml(formatDate(day.date, { month: 'short', day: 'numeric', weekday: 'short' }))}</span><span class="day-date-meta"><b>${day.items.length} 個行程</b><i aria-hidden="true">⌃</i></span></button><div class="day-items">${sortPlanItems(day.items).map(item => `<div class="timeline-item"><time>${escapeHtml(item.time || '未定')}</time><div><h3>${escapeHtml(item.activity || '未命名行程')}</h3><p class="transport preserve-lines">${escapeHtml(item.transport || '交通未定')}</p>${item.map ? `<a href="${escapeHtml(item.map)}" target="_blank" rel="noopener">開啟地圖 ↗</a>` : ''}</div><p class="preserve-lines">${linkifyText(item.note)}</p></div>`).join('')}</div></article>`).join('')}</div>` : emptyState('還沒有安排行程', '可以先記下最期待的一個地方。', false)}</section>
  <section class="section trip-tab-panel" id="trip-expenses" data-trip-panel="expenses" role="tabpanel" hidden><div class="section-head"><div><p class="eyebrow">Expenses</p><h2>旅行支出</h2></div><button class="button button-ghost" data-action="edit" data-id="${escapeHtml(trip.id)}" data-tab="expenses">編輯</button></div>${expenseContent}</section>
  <section class="section trip-tab-panel" id="trip-checklist" data-trip-panel="checklist" role="tabpanel" hidden><div class="section-head"><div><p class="eyebrow">Checklist</p><h2>旅程準備清單</h2></div><button class="button button-ghost" data-action="edit" data-id="${escapeHtml(trip.id)}" data-tab="checklist">編輯</button></div><div class="check-progress"><span style="--progress:${checklistItems.length ? checked / checklistItems.length * 100 : 0}%"></span></div><p class="section-copy">已完成 ${checked}／${checklistItems.length} 項 · ${canQuickCheck ? '可直接勾選更新' : '旅程已結束，請由編輯旅程更新'}</p><div class="checklist-view ${canQuickCheck ? '' : 'locked'}">${trip.checklist.map((group, groupIndex) => `<article><h3>${escapeHtml(group.category)}</h3>${group.items.map((item, itemIndex) => `<label class="read-check"><input type="checkbox" data-quick-check data-trip-id="${escapeHtml(trip.id)}" data-group-index="${groupIndex}" data-item-index="${itemIndex}" ${item.checked ? 'checked' : ''} ${canQuickCheck ? '' : 'disabled'}><span>${escapeHtml(item.name)}</span></label>`).join('')}</article>`).join('')}</div></section></div>`;
}

function loadShareRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(SHARE_RECORDS_STORAGE) || '[]');
    return Array.isArray(records) ? records.filter(record => record?.id && record?.deleteToken).map(record => ({ ...record, version: Number(record.version) || 1, updatedAt: Number(record.updatedAt) || Number(record.createdAt) || 0 })) : [];
  } catch { return []; }
}

function saveShareRecords(records) {
  localStorage.setItem(SHARE_RECORDS_STORAGE, JSON.stringify(records.slice(0, 100)));
}

function onlineShareUrl(id) {
  const url = new URL(PUBLIC_SITE_URL); url.hash = `share/${id}`; return url.href;
}

function collaborationUrl(id, editToken) {
  const url = new URL(PUBLIC_SITE_URL); url.hash = `collab/${id}/${editToken}`; return url.href;
}

function shareExpiryText(expiresAt) {
  const end = Number(expiresAt); if (!end) return '到期時間未知';
  if (end <= Date.now()) return '已到期';
  const remaining = end - Date.now(); const days = Math.floor(remaining / 86400000); const hours = Math.floor(remaining % 86400000 / 3600000);
  return days ? `剩餘 ${days} 天 ${hours} 小時` : `剩餘 ${Math.max(1, hours)} 小時`;
}

function shareExpiryDate(expiresAt) {
  return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(Number(expiresAt)));
}

function shareSettingsCard() {
  const records = loadShareRecords(); const hasAdminKey = Boolean(localStorage.getItem(SHARE_KEY_STORAGE));
  const list = records.length ? records.map(record => {
    const expired = Number(record.expiresAt) <= Date.now(); const canEdit = Boolean(record.editToken);
    return `<article class="share-record ${expired ? 'is-expired' : ''}"><div><strong>${escapeHtml(record.title || '未命名旅程')}</strong><p>${escapeHtml(shareExpiryText(record.expiresAt))} · ${escapeHtml(shareExpiryDate(record.expiresAt))}${canEdit ? ` · 已同步 v${record.version}` : ' · 舊版唯讀分享'}</p></div><div class="share-record-actions"><button class="button button-soft" type="button" data-copy-share="${escapeHtml(record.id)}">複製唯讀</button><button class="button button-soft" type="button" data-copy-collab="${escapeHtml(record.id)}" ${canEdit && !expired ? '' : 'disabled'}>複製協作</button><a class="button button-ghost" href="${escapeHtml(onlineShareUrl(record.id))}" target="_blank" rel="noopener">開啟</a><button class="button button-danger" type="button" data-revoke-share="${escapeHtml(record.id)}">${expired ? '移除紀錄' : '撤銷'}</button></div></article>`;
  }).join('') : '<div class="empty compact-empty"><h3>目前沒有分享紀錄</h3><p>從旅程內頁建立分享後，可以在這裡複製唯讀／協作連結或撤銷權限。</p></div>';
  return `<article class="settings-card settings-wide"><div class="settings-card-head"><div><h2>線上同步分享</h2><p>唯讀與協作連結會指向同一趟雲端旅程；儲存修改後，其他裝置會在數秒內取得最新版。每組連結保留 30 天。</p></div><span class="connection-state is-ready">同步分享模式</span></div><div class="share-record-list">${list}</div><details class="admin-share-settings"><summary>網站管理者工具</summary><p class="helper">一般使用者不需要輸入。網站管理者密碼只用於連線檢查與進階管理。</p><form id="share-settings"><div class="share-settings-row"><label>管理者密碼<input name="shareKey" type="password" autocomplete="new-password" placeholder="${hasAdminKey ? '輸入新密碼可更新' : '輸入 Cloudflare SHARE_WRITE_KEY'}"></label><button class="button button-primary" type="submit">儲存並測試</button><button class="button button-ghost" type="button" data-clear-share-key ${hasAdminKey ? '' : 'disabled'}>清除此裝置密碼</button></div></form></details></article>`;
}

function renderSettings(selectedCountry = Object.keys(data.settings.countries)[0], selectedAirport = airportCode(data.settings.originAirports[0])) {
  const country = countryOf(selectedCountry); const airlineCodes = [...new Set([...data.settings.originAirports.map(airportCode), ...Object.keys(data.settings.airlinesByAirport)])].filter(Boolean).sort();
  app.innerHTML = `${pageBack()}<section class="page-intro settings-intro"><p class="eyebrow">Website settings</p><h1>網站設定</h1><p class="section-copy">管理建立旅程時使用的國家、城市、機場、航空公司與準備清單。所有變更只儲存在這個瀏覽器。</p></section>
  <section class="settings-grid">
    ${shareSettingsCard()}
    <article class="settings-card settings-wide"><div class="settings-card-head"><div><h2>網站配色</h2><p>調整全站主色、點綴色與頁面背景，儲存後會套用到所有頁面。</p></div></div><form id="theme-settings"><div class="theme-fields"><label>主色<input name="accent" type="color" value="${escapeHtml(data.settings.theme.accent)}"></label><label>點綴色<input name="warm" type="color" value="${escapeHtml(data.settings.theme.warm)}"></label><label>頁面背景<input name="background" type="color" value="${escapeHtml(data.settings.theme.background)}"></label></div><div class="form-actions theme-actions"><button class="button button-ghost" type="button" data-reset-theme>恢復預設</button><button class="button button-primary">儲存配色</button></div></form></article>
    <article class="settings-card settings-wide"><div class="settings-card-head"><div><h2>國家與目的地</h2><p>選擇現有國家編輯，或建立新的國家選項。</p></div><button class="button button-soft" data-action="add-country">＋ 新增國家</button></div><label>編輯國家<select id="settings-country">${Object.keys(data.settings.countries).map(name => `<option ${name === selectedCountry ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label><form id="country-settings" class="form-grid" style="margin-top:18px"><input type="hidden" name="original" value="${escapeHtml(selectedCountry)}">${formField('name', '國家名稱', selectedCountry, 'text', 'required')}${formField('emoji', '代表圖示', country.emoji)}${formField('image', '封面圖片網址', country.image, 'url')}${formField('color', '備援色彩', country.color, 'color')}<label class="full">城市（每行一個）<textarea name="cities">${escapeHtml(country.cities.join('\n'))}</textarea></label><label class="full">目的地機場（每行一個，格式：代碼｜名稱）<textarea name="airports">${escapeHtml(country.airports.join('\n'))}</textarea></label><div class="full form-actions"><button class="button button-primary">儲存國家設定</button></div></form></article>
    <article class="settings-card"><h2>出發機場</h2><p>用於旅程的出發地搜尋選單。</p><form id="origin-settings"><label>機場（每行一個）<textarea name="origins" class="tall-textarea">${escapeHtml(data.settings.originAirports.join('\n'))}</textarea></label><div class="form-actions"><button class="button button-primary">儲存出發機場</button></div></form></article>
    <article class="settings-card"><h2>航空公司</h2><p>依出發機場代碼管理可搜尋選項。</p><label>機場代碼<select id="airline-airport">${airlineCodes.map(code => `<option ${code === selectedAirport ? 'selected' : ''}>${code}</option>`).join('')}</select></label><form id="airline-settings"><label>航空公司（每行一個）<textarea name="airlines" class="tall-textarea">${escapeHtml((data.settings.airlinesByAirport[selectedAirport] || []).join('\n'))}</textarea></label><div class="form-actions"><button class="button button-primary">儲存航空公司</button></div></form></article>
    <article class="settings-card settings-wide"><div class="settings-card-head"><div><h2>準備清單範本</h2><p>新旅程會自動帶入以下分類與物品。</p></div><button class="button button-soft" data-action="add-template">＋ 新增分類</button></div><form id="template-settings"><div id="template-list">${data.settings.checklistTemplates.map(templateEditor).join('')}</div><div class="form-actions"><button class="button button-primary">儲存清單範本</button></div></form></article>
    <article class="settings-card settings-wide"><div class="settings-card-head"><div><h2>首頁旅行筆記</h2><p>集中管理首頁顯示的標題、摘要與詳細內容。</p></div></div><form id="home-notes-settings"><div class="note-settings-list">${data.notes.map((note, index) => `<fieldset class="note-settings-row"><legend>筆記 ${index + 1}</legend><label>標題<input class="note-setting-title" value="${escapeHtml(note[0])}" required></label><label>摘要<textarea class="note-setting-summary" required>${escapeHtml(note[1])}</textarea></label><label>詳細內容<textarea class="note-setting-detail">${escapeHtml(note[2])}</textarea></label></fieldset>`).join('')}</div><div class="form-actions"><button class="button button-primary">儲存旅行筆記</button></div></form></article>
  </section>`;
}

function templateEditor(group = { category: '', items: [] }) { return `<div class="template-row"><label>分類<input class="template-category" value="${escapeHtml(group.category)}"></label><label>物品（每行一個）<textarea class="template-items">${escapeHtml(group.items.join('\n'))}</textarea></label><button class="icon-button" type="button" data-remove-template aria-label="刪除分類">×</button></div>`; }
function renderNotFound() { app.innerHTML = `${pageBack()}<section class="page-intro">${emptyState('找不到這個頁面', '連結可能已經變更，回首頁看看吧。', false)}<p style="text-align:center;margin-top:18px"><a class="button button-primary" href="#home">回到首頁</a></p></section>`; }

function route() {
  const hash = decodeURIComponent(location.hash.slice(1) || 'home'); const [page, ...rest] = hash.split('/');
  clearInterval(homeCountdownTimer); clearInterval(shareRefreshTimer); shareRefreshTimer = null; activeSharedImport = null; activeCollaboration = null; document.body.classList.remove('readonly-share', 'collaborative-share'); document.title = DEFAULT_DOCUMENT_TITLE; applyTheme();
  if (page === 'home' || page === 'knowledge') renderHome(); else if (page === 'country' && rest[0]) renderCountry(rest[0]); else if (page === 'trip' && rest[0]) renderTrip(rest.join('/')); else if (page === 'share' && rest[0]) renderSharedTrip(rest.join('/')); else if (page === 'collab' && rest[0] && rest[1]) renderCollaborativeTrip(rest[0], rest[1]); else if (page === 'settings') renderSettings(); else renderNotFound();
  if (page === 'knowledge') requestAnimationFrame(() => document.querySelector('#notes')?.scrollIntoView()); else window.scrollTo({ top: 0, behavior: 'instant' });
}

function modalFrame(title, body, footer = '', wide = false) { modal.classList.toggle('modal-wide', wide); modalContent.innerHTML = `<div class="modal-shell"><div class="modal-head"><h2 id="modal-title">${escapeHtml(title)}</h2><button class="icon-button" data-close aria-label="關閉">×</button></div><div class="modal-body">${body}</div>${footer}</div>`; modal.showModal(); modalContent.querySelector('[data-close]').addEventListener('click', () => modal.close()); }
function formField(name, label, value = '', type = 'text', extra = '') { return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}></label>`; }
function datalist(id, options) { return `<datalist id="${id}">${options.map(option => `<option value="${escapeHtml(option)}"></option>`).join('')}</datalist>`; }

function tripDateRange() {
  const startValue = modalContent.querySelector('[name="start"]')?.value?.slice(0, 10); const endValue = modalContent.querySelector('[name="end"]')?.value?.slice(0, 10);
  if (!startValue || !endValue || endValue < startValue) return [];
  const dates = []; const cursor = new Date(`${startValue}T12:00:00`); const end = new Date(`${endValue}T12:00:00`);
  while (cursor <= end && dates.length < 90) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setDate(cursor.getDate() + 1); }
  return dates;
}
function planDateLabel(value) { return value ? `${formatDate(value, { month: 'short', day: 'numeric', weekday: 'short' })}` : '請先設定旅行日期'; }
function refreshDayDateOptions() {
  const dates = tripDateRange(); const selects = [...modalContent.querySelectorAll('.day-input')];
  selects.forEach(select => { const current = select.value; const used = new Set(selects.filter(item => item !== select).map(item => item.value)); const choices = dates.filter(date => date === current || !used.has(date)); if (current && !choices.includes(current)) choices.unshift(current); select.innerHTML = choices.length ? choices.map(date => `<option value="${date}" ${date === current ? 'selected' : ''}>${escapeHtml(planDateLabel(date))}</option>`).join('') : '<option value="">請先設定旅行日期</option>'; select.disabled = !choices.length; });
}
function nextUnusedTripDate() { const used = new Set([...modalContent.querySelectorAll('.day-input')].map(input => input.value)); return tripDateRange().find(date => !used.has(date)) || ''; }
function updateDaySummary(day) { const count = day.querySelectorAll('.time-editor').length; const target = day.querySelector('[data-day-count]'); if (target) target.textContent = `${count} 個時間點`; }
function syncTripDayEditors(seedDays) {
  const container = modalContent.querySelector('#day-entries'); if (!container) return;
  const liveDays = gatherPlanDays(); if (seedDays) activePlanDraft = clone(seedDays); else if (liveDays.length) activePlanDraft = clone(liveDays);
  const current = seedDays || (liveDays.length ? liveDays : activePlanDraft); const byDate = new Map(current.map(day => [day.date, day])); const dates = tripDateRange(); container.innerHTML = '';
  if (!dates.length) { container.innerHTML = '<p class="helper itinerary-date-hint">請先到「基本資料」設定開始與結束日期。</p>'; return; }
  dates.forEach(date => dayEditor(byDate.get(date) || { date, items: [] }, true));
}
function ensureInitialDay() { if (!modalContent.querySelector('#day-entries .day-editor')) syncTripDayEditors(); }

function dayEditor(day = { date: '', items: [] }, collapsed = true) {
  const selectedDate = day.date; if (!selectedDate) return;
  const wrapper = document.createElement('section'); wrapper.className = `day-editor ${collapsed ? 'collapsed' : ''}`; wrapper.innerHTML = `<input class="day-input" type="hidden" value="${escapeHtml(selectedDate)}"><div class="day-editor-head"><button class="day-summary" type="button" data-toggle-day aria-expanded="${collapsed ? 'false' : 'true'}"><strong>${escapeHtml(planDateLabel(selectedDate))}</strong><span data-day-count>0 個時間點</span><i aria-hidden="true">⌃</i></button></div><div class="day-editor-body" ${collapsed ? 'hidden' : ''}><div class="time-list"></div><button class="button button-soft append-button" type="button" data-add-time>＋ 新增時間點</button></div>`;
  const list = wrapper.querySelector('.time-list');
  day.items.forEach(item => timeEditor(list, item, true));
  wrapper.querySelector('[data-toggle-day]').addEventListener('click', () => { const body = wrapper.querySelector('.day-editor-body'); body.hidden = !body.hidden; wrapper.classList.toggle('collapsed', body.hidden); wrapper.querySelector('[data-toggle-day]').setAttribute('aria-expanded', String(!body.hidden)); if (!body.hidden) requestAnimationFrame(() => refreshAutoGrow(wrapper)); });
  wrapper.querySelector('[data-add-time]').addEventListener('click', () => { const row = timeEditor(list, {}, false); updateDaySummary(wrapper); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  document.querySelector('#day-entries').append(wrapper); updateDaySummary(wrapper);
}

function autoGrowTextarea(field) { field.style.height = 'auto'; field.style.height = `${Math.max(44, field.scrollHeight)}px`; }
function refreshAutoGrow(root) { root.querySelectorAll('textarea[data-field]').forEach(autoGrowTextarea); }
function reorderTimeEditors(container) { [...container.querySelectorAll('.time-editor')].sort((a, b) => String(a.querySelector('[data-field="time"]')?.value || '99:99').localeCompare(String(b.querySelector('[data-field="time"]')?.value || '99:99'), 'zh-TW', { numeric: true })).forEach(row => container.append(row)); }

function timeEditor(container, item = {}, collapsed = false) {
  const hasNote = Boolean(item.note); const row = document.createElement('div'); row.className = `time-editor ${collapsed ? 'collapsed' : ''}`;
  row.innerHTML = `<div class="time-editor-head"><button class="time-summary" type="button" data-toggle-time aria-expanded="${collapsed ? 'false' : 'true'}"><span>${escapeHtml(item.time || '時間未定')}</span><b>${escapeHtml(item.activity || '未命名行程')}</b><i aria-hidden="true">⌃</i></button><div class="time-tools"><button class="button button-ghost" type="button" data-toggle-note>${hasNote ? '隱藏備註' : '備註 ＋'}</button><button class="icon-button" type="button" data-remove-time aria-label="刪除此時間點">×</button></div></div><div class="time-editor-body" ${collapsed ? 'hidden' : ''}><div class="time-main"><label>時間<input data-field="time" type="time" value="${escapeHtml(item.time || '')}"></label><label>行程<textarea rows="1" data-field="activity" placeholder="景點、餐廳或活動內容">${escapeHtml(item.activity || '')}</textarea></label><label>交通<textarea rows="1" data-field="transport" placeholder="步行、路線、班次或轉乘方式">${escapeHtml(item.transport || '')}</textarea></label><label>地圖連結<input data-field="map" type="url" placeholder="https://maps.google.com/..." value="${escapeHtml(item.map || '')}"></label></div><label class="time-note" ${hasNote ? '' : 'hidden'}>備註<textarea rows="1" data-field="note" placeholder="訂位資訊、提醒或備案">${escapeHtml(item.note || '')}</textarea></label></div>`;
  const updateSummary = () => { row.querySelector('.time-summary span').textContent = row.querySelector('[data-field="time"]').value || '時間未定'; row.querySelector('.time-summary b').textContent = row.querySelector('[data-field="activity"]').value.trim() || '未命名行程'; };
  row.querySelectorAll('[data-field="time"], [data-field="activity"]').forEach(input => input.addEventListener('input', updateSummary));
  row.querySelector('[data-field="time"]').addEventListener('change', () => reorderTimeEditors(container));
  row.querySelectorAll('textarea[data-field]').forEach(field => field.addEventListener('input', () => autoGrowTextarea(field)));
  row.querySelector('[data-toggle-time]').addEventListener('click', () => { const body = row.querySelector('.time-editor-body'); body.hidden = !body.hidden; row.classList.toggle('collapsed', body.hidden); row.querySelector('[data-toggle-time]').setAttribute('aria-expanded', String(!body.hidden)); if (!body.hidden) requestAnimationFrame(() => refreshAutoGrow(row)); });
  row.querySelector('[data-toggle-note]').addEventListener('click', event => { const note = row.querySelector('.time-note'); note.hidden = !note.hidden; event.currentTarget.textContent = note.hidden ? '備註 ＋' : '隱藏備註'; if (!note.hidden) { const body = row.querySelector('.time-editor-body'); body.hidden = false; row.classList.remove('collapsed'); row.querySelector('[data-toggle-time]').setAttribute('aria-expanded', 'true'); requestAnimationFrame(() => { autoGrowTextarea(note.querySelector('textarea')); note.querySelector('textarea').focus(); }); } });
  row.querySelector('[data-remove-time]').addEventListener('click', async () => { const name = row.querySelector('[data-field="activity"]').value.trim() || row.querySelector('[data-field="time"]').value || '這個時間點'; if (!await confirmDeletion(`確定要刪除「${name}」嗎？`, '刪除行程時間點')) return; const day = row.closest('.day-editor'); row.remove(); if (day) updateDaySummary(day); }); container.append(row); if (!collapsed) requestAnimationFrame(() => refreshAutoGrow(row)); return row;
}

function updateExpenseDaySummary(day) {
  const count = day.querySelectorAll('.expense-entry').length; const target = day.querySelector('[data-expense-day-count]');
  if (target) target.textContent = `${count} 筆支出`;
}

function expenseDayEditor(date, expenses = [], collapsed = true) {
  const container = modalContent.querySelector('#expense-day-entries'); if (!container) return null;
  const wrapper = document.createElement('section'); wrapper.className = `day-editor expense-day-editor ${collapsed ? 'collapsed' : ''}`; wrapper.dataset.expenseDate = date;
  wrapper.innerHTML = `<div class="day-editor-head"><button class="day-summary" type="button" data-toggle-expense-day aria-expanded="${collapsed ? 'false' : 'true'}"><strong>${escapeHtml(date ? planDateLabel(date) : '日期未設定')}</strong><span data-expense-day-count>0 筆支出</span><i aria-hidden="true">⌃</i></button></div><div class="day-editor-body expense-day-body" ${collapsed ? 'hidden' : ''}><div class="expense-editor-head" aria-hidden="true"><span></span><span>分類</span><span>項目</span><span>單價</span><span>數量</span></div><div class="expense-day-list"></div><button class="button button-soft append-button" type="button" data-add-expense>＋ 新增支出項目</button></div>`;
  const list = wrapper.querySelector('.expense-day-list');
  expenses.forEach(expense => expenseEditor(list, expense)); enablePointerSort(list, '.expense-entry', '.expense-drag');
  wrapper.querySelector('[data-toggle-expense-day]').addEventListener('click', () => { const body = wrapper.querySelector('.expense-day-body'); body.hidden = !body.hidden; wrapper.classList.toggle('collapsed', body.hidden); wrapper.querySelector('[data-toggle-expense-day]').setAttribute('aria-expanded', String(!body.hidden)); });
  wrapper.querySelector('[data-add-expense]').addEventListener('click', () => { const row = expenseEditor(list); updateExpenseDaySummary(wrapper); row.querySelector('[data-field="item"]').focus(); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  container.append(wrapper); updateExpenseDaySummary(wrapper); return wrapper;
}

function syncExpenseDayEditors(seedExpenses) {
  const container = modalContent.querySelector('#expense-day-entries'); if (!container) return;
  const hasLiveEditor = Boolean(container.querySelector('.expense-day-editor')); const liveExpenses = gatherExpenses();
  if (seedExpenses) activeExpenseDraft = clone(seedExpenses); else if (hasLiveEditor) activeExpenseDraft = clone(liveExpenses);
  const current = seedExpenses || (hasLiveEditor ? liveExpenses : activeExpenseDraft); const grouped = new Map();
  current.forEach(expense => { const date = expense.date || ''; if (!grouped.has(date)) grouped.set(date, []); grouped.get(date).push(expense); });
  const plannedDates = tripDateRange(); const extraDates = [...grouped.keys()].filter(Boolean).filter(date => !plannedDates.includes(date)); const dates = [...new Set([...plannedDates, ...extraDates])].sort(); container.innerHTML = '';
  if (!dates.length && !grouped.has('')) { container.innerHTML = '<p class="helper itinerary-date-hint">請先到「基本資料」設定開始與結束日期。</p>'; return; }
  dates.forEach(date => expenseDayEditor(date, grouped.get(date) || [], true)); if (grouped.has('')) expenseDayEditor('', grouped.get(''), true);
}

function expenseEditor(container, row = {}) {
  const wrapper = document.createElement('div'); wrapper.className = 'entry expense-entry'; const expanded = Boolean(row.split || row.note);
  const field = (name, label, type = 'text', value = '') => `<label class="expense-${name}"><span>${label}</span><input data-field="${name}" aria-label="${label}" type="${type}" ${type === 'number' ? 'min="0"' : ''} value="${escapeHtml(value)}"></label>`;
  wrapper.innerHTML = `<button class="drag-handle expense-drag" type="button" aria-label="拖曳調整支出順序" title="拖曳調整順序">⠿</button><label class="expense-category"><span>分類</span><input data-field="category" aria-label="分類" list="expense-category-list" value="${escapeHtml(row.category || '')}" placeholder="選擇或輸入分類"></label>${field('item', '項目', 'text', row.item || '')}${field('price', '單價', 'number', row.price || '')}${field('quantity', '數量', 'number', row.quantity || '1')}<div class="expense-more" ${expanded ? '' : 'hidden'}>${field('split', '平分', 'number', row.split || '')}${field('note', '備註', 'text', row.note || '')}</div><button class="button button-ghost expense-more-toggle" type="button" data-toggle-expense aria-label="${expanded ? '收起平分與備註' : '展開平分與備註'}">${expanded ? '－' : '＋'}</button><button class="icon-button expense-remove" type="button" aria-label="刪除此列">×</button>`;
  wrapper.querySelector('[data-toggle-expense]').addEventListener('click', event => { const more = wrapper.querySelector('.expense-more'); more.hidden = !more.hidden; event.currentTarget.textContent = more.hidden ? '＋' : '－'; event.currentTarget.setAttribute('aria-label', more.hidden ? '展開平分與備註' : '收起平分與備註'); });
  wrapper.querySelector('.expense-remove').addEventListener('click', async () => { const name = wrapper.querySelector('[data-field="item"]').value.trim() || '這筆支出'; if (!await confirmDeletion(`確定要刪除「${name}」嗎？`, '刪除支出項目')) return; const day = wrapper.closest('.expense-day-editor'); wrapper.remove(); if (day) updateExpenseDaySummary(day); });
  container.append(wrapper); enhanceDatalistInput(wrapper.querySelector('[list="expense-category-list"]')); return wrapper;
}

function checklistEditor(checklist) {
  const container = document.querySelector('#checklist-entries'); container.innerHTML = '';
  checklist.forEach(group => { const section = document.createElement('section'); section.className = 'check-group-editor'; section.innerHTML = `<div class="check-group-head"><button class="drag-handle group-drag" type="button" aria-label="拖曳調整分類順序" title="拖曳調整分類順序">⠿</button><input class="check-category" value="${escapeHtml(group.category)}" aria-label="清單分類"></div><div class="check-items"></div><button class="button button-soft append-button" type="button" data-add-check>＋ 新增項目</button>`; const items = section.querySelector('.check-items'); group.items.forEach(item => addCheckItem(items, item)); enablePointerSort(items, '.check-edit', '.check-drag'); section.querySelector('[data-add-check]').addEventListener('click', () => { const row = addCheckItem(items); row.querySelector('[type="text"]').focus(); }); container.append(section); });
  enablePointerSort(container, '.check-group-editor', '.group-drag');
}
function addCheckItem(container, item = { name: '', checked: false }) { const row = document.createElement('div'); row.className = 'check-edit'; row.innerHTML = `<button class="drag-handle check-drag" type="button" aria-label="拖曳調整項目順序" title="拖曳調整順序">⠿</button><input type="checkbox" aria-label="完成狀態" ${item.checked ? 'checked' : ''}><input type="text" value="${escapeHtml(item.name)}" placeholder="準備項目" aria-label="準備項目"><button class="icon-button" type="button" data-remove-check aria-label="刪除項目">×</button>`; row.querySelector('[data-remove-check]').addEventListener('click', async () => { const name = row.querySelector('[type="text"]').value.trim() || '這個準備項目'; if (await confirmDeletion(`確定要刪除「${name}」嗎？`, '刪除準備項目')) row.remove(); }); container.append(row); return row; }

function enablePointerSort(container, itemSelector, handleSelector) {
  if (!container || container.dataset.sortableBound) return; container.dataset.sortableBound = 'true';
  container.addEventListener('pointerdown', event => {
    const handle = event.target.closest(handleSelector); if (!handle || !container.contains(handle)) return;
    const dragged = handle.closest(itemSelector); if (!dragged || dragged.parentElement !== container) return;
    event.preventDefault(); const startRect = dragged.getBoundingClientRect(); const offsetX = event.clientX - startRect.left; const offsetY = event.clientY - startRect.top; const ghost = dragged.cloneNode(true);
    [...dragged.querySelectorAll('input, textarea')].forEach((field, index) => { const copy = ghost.querySelectorAll('input, textarea')[index]; if (copy) { copy.value = field.value; copy.checked = field.checked; } });
    ghost.classList.add('sort-ghost'); ghost.setAttribute('aria-hidden', 'true'); ghost.style.width = `${startRect.width}px`; ghost.style.height = `${startRect.height}px`; ghost.style.left = `${startRect.left}px`; ghost.style.top = `${startRect.top}px`; document.body.append(ghost);
    handle.setPointerCapture?.(event.pointerId); dragged.classList.add('is-drag-placeholder'); document.body.classList.add('sorting-active');
    const placeGhost = pointerEvent => { const maxLeft = Math.max(8, window.innerWidth - startRect.width - 8); const left = Math.max(8, Math.min(maxLeft, pointerEvent.clientX - offsetX)); const top = Math.max(8, Math.min(window.innerHeight - 48, pointerEvent.clientY - offsetY)); ghost.style.setProperty('--drag-x', `${left - startRect.left}px`); ghost.style.setProperty('--drag-y', `${top - startRect.top}px`); };
    placeGhost(event); let animationFrame = 0; let latestPointer = event;
    const updatePosition = pointerEvent => {
      placeGhost(pointerEvent); const scrollArea = container.closest('.modal-body'); if (scrollArea) { const bounds = scrollArea.getBoundingClientRect(); if (pointerEvent.clientY < bounds.top + 72) scrollArea.scrollBy({ top: -12 }); else if (pointerEvent.clientY > bounds.bottom - 72) scrollArea.scrollBy({ top: 12 }); }
      const candidate = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)?.closest(itemSelector);
      if (!candidate || candidate === dragged || candidate.parentElement !== container) return;
      const siblings = [...container.querySelectorAll(`:scope > ${itemSelector}`)]; const positions = new Map(siblings.map(item => [item, item.getBoundingClientRect()])); const rect = candidate.getBoundingClientRect(); const hasGridRows = siblings.some((item, index) => index && Math.abs(item.getBoundingClientRect().top - siblings[index - 1].getBoundingClientRect().top) < 8); const before = hasGridRows && pointerEvent.clientY >= rect.top && pointerEvent.clientY <= rect.bottom ? pointerEvent.clientX < rect.left + rect.width / 2 : pointerEvent.clientY < rect.top + rect.height / 2;
      container.insertBefore(dragged, before ? candidate : candidate.nextSibling);
      siblings.forEach(item => { if (item === dragged) return; const previous = positions.get(item); const current = item.getBoundingClientRect(); const x = previous.left - current.left; const y = previous.top - current.top; if (x || y) item.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
    };
    const move = pointerEvent => { pointerEvent.preventDefault(); latestPointer = pointerEvent; if (!animationFrame) animationFrame = requestAnimationFrame(() => { animationFrame = 0; updatePosition(latestPointer); }); };
    const end = () => { if (animationFrame) cancelAnimationFrame(animationFrame); const endRect = dragged.getBoundingClientRect(); const ghostRect = ghost.getBoundingClientRect(); dragged.classList.remove('is-drag-placeholder'); dragged.animate([{ transform: `translate(${ghostRect.left - endRect.left}px, ${ghostRect.top - endRect.top}px)`, opacity: .72 }, { transform: 'translate(0, 0)', opacity: 1 }], { duration: 190, easing: 'cubic-bezier(.2,.8,.2,1)' }); ghost.remove(); document.body.classList.remove('sorting-active'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  });
}

function switchEditorTab(tab) { modalContent.querySelectorAll('[data-editor-tab]').forEach(button => button.classList.toggle('active', button.dataset.editorTab === tab)); modalContent.querySelectorAll('.editor-panel').forEach(panel => panel.hidden = panel.dataset.panel !== tab); if (tab === 'itinerary') ensureInitialDay(); }
function syncTravelScopeFields() {
  const scope = modalContent.querySelector('[name="travelScope"]')?.value || 'international'; const domestic = scope === 'domestic'; const countryName = modalContent.querySelector('[name="country"]')?.value || ''; const country = countryOf(countryName);
  const international = modalContent.querySelector('.international-flight-fields'); const domesticFields = modalContent.querySelector('.domestic-transport-fields'); if (international) international.hidden = domestic; if (domesticFields) domesticFields.hidden = !domestic;
  const originLabel = modalContent.querySelector('.origin-label'); const destinationLabel = modalContent.querySelector('.destination-label'); if (originLabel) originLabel.textContent = domestic ? '出發地' : '出發機場'; if (destinationLabel) destinationLabel.textContent = domestic ? '旅遊目的地' : '目的地機場';
  const origin = modalContent.querySelector('[name="origin"]'); const destination = modalContent.querySelector('[name="destination"]'); if (origin) origin.placeholder = domestic ? '輸入城市、車站或地點' : '機場代碼或名稱'; if (destination) destination.placeholder = domestic ? '輸入城市、車站或地點' : '依國家搜尋機場';
  replaceDatalist('origin-list', domestic ? country.cities : data.settings.originAirports); replaceDatalist('destination-list', domestic ? country.cities : country.airports);
}
function enhanceDatalistInput(input) {
  if (!input || input.dataset.smartList) return; const listId = input.getAttribute('list'); if (!listId) return;
  input.dataset.smartList = listId; input.removeAttribute('list'); input.setAttribute('autocomplete', 'off'); input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  const label = input.closest('label'); if (!label) return; label.classList.add('smart-select');
  const menu = document.createElement('div'); menu.className = 'smart-options'; menu.hidden = true; menu.setAttribute('role', 'listbox'); label.append(menu);
  const options = () => [...modalContent.querySelectorAll(`#${CSS.escape(listId)} option`)].map(option => option.value).filter(Boolean);
  const hide = () => { menu.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const show = (filter = '') => {
    const keyword = filter.trim().toLocaleLowerCase('zh-TW'); const matches = options().filter(option => !keyword || option.toLocaleLowerCase('zh-TW').includes(keyword));
    menu.innerHTML = matches.length ? matches.map(option => `<button type="button" role="option" data-smart-option="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join('') : '<span>沒有符合的選項，可直接輸入自訂內容</span>';
    menu.hidden = false; input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('focus', () => show()); input.addEventListener('click', () => { input.select(); show(); }); input.addEventListener('input', () => show(input.value));
  input.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); show(); menu.querySelector('button')?.focus(); } else if (event.key === 'Escape') hide(); });
  input.addEventListener('blur', () => setTimeout(() => { if (!label.contains(document.activeElement)) hide(); }, 80));
  menu.addEventListener('pointerdown', event => event.preventDefault()); menu.addEventListener('click', event => { const option = event.target.closest('[data-smart-option]'); if (!option) return; input.value = option.dataset.smartOption; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); hide(); input.focus(); input.select(); });
  menu.addEventListener('keydown', event => { const buttons = [...menu.querySelectorAll('button')]; const current = buttons.indexOf(document.activeElement); if (event.key === 'ArrowDown') { event.preventDefault(); buttons[Math.min(buttons.length - 1, current + 1)]?.focus(); } else if (event.key === 'ArrowUp') { event.preventDefault(); if (current <= 0) input.focus(); else buttons[current - 1].focus(); } else if (event.key === 'Escape') { hide(); input.focus(); } });
}
function enhanceDatalistInputs(root = modalContent) { root.querySelectorAll('input[list]').forEach(enhanceDatalistInput); }
function updateEditorCompletion(form) {
  const values = Object.fromEntries(new FormData(form));
  const complete = Boolean(values.title && values.country && values.origin && values.destination && values.start && values.end);
  const notice = modalContent.querySelector('#record-completion-notice');
  if (notice) { notice.hidden = complete; notice.textContent = '待完成記錄：可先儲存，之後再補齊出發地、目的地與旅行日期。'; }
}
function compressCoverImage(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type.startsWith('image/')) return reject(new Error('請選擇圖片檔案'));
    if (file.size > 10 * 1024 * 1024) return reject(new Error('圖片請勿超過 10MB'));
    const image = new Image(); const url = URL.createObjectURL(file);
    image.onload = () => { const scale = Math.min(1, 1280 / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', .8)); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取這張圖片')); }; image.src = url;
  });
}
function addCustomCity() {
  const input = modalContent.querySelector('#custom-city-input'); const city = input.value.trim(); const countryName = modalContent.querySelector('[name="country"]').value.trim(); if (!city || !countryName) return;
  if (!data.settings.countries[countryName]) data.settings.countries[countryName] = { emoji: '🌍', color: '#4f665b', image: '', cities: [], airports: [] };
  const selected = [...modalContent.querySelectorAll('#city-chips input:checked')].map(item => item.value); if (!data.settings.countries[countryName].cities.includes(city)) data.settings.countries[countryName].cities.push(city); if (!selected.includes(city)) selected.push(city); saveData(); renderCityChips(countryName, selected); input.value = ''; showToast(`${city} 已加入城市選項`);
}

function openTripEditor(id = '', forcedCountry = '', initialTab = 'overview') {
  const existing = data.trips.find(trip => trip.id === id); const trip = existing ? clone(existing) : normalizeTrip({ title: '', country: forcedCountry || '日本', people: '1' }, data.settings);
  if (!existing) trip.title = '';
  const countries = Object.keys(data.settings.countries); const country = countryOf(trip.country); const airlines = data.settings.airlinesByAirport[airportCode(trip.origin)] || [];
  const domestic = trip.travelScope === 'domestic'; const routeOptions = domestic ? country.cities : data.settings.originAirports; const destinationOptions = domestic ? country.cities : country.airports;
  const body = `<form id="trip-form"><div class="editor-tabs" role="tablist"><button type="button" data-editor-tab="overview">基本資料</button><button type="button" data-editor-tab="expenses">旅行支出</button><button type="button" data-editor-tab="itinerary">每日行程</button><button type="button" data-editor-tab="checklist">準備清單</button></div><p id="record-completion-notice" class="completion-notice">待完成記錄：可先儲存，之後再補齊出發地、目的地與旅行日期。</p>
  <section class="editor-panel" data-panel="overview"><div class="form-grid">${formField('title', '旅程名稱', trip.title, 'text', 'required placeholder="例如：台南美食小旅行"')}<label>國家／地區<input name="country" list="country-list" value="${escapeHtml(trip.country)}" required placeholder="輸入或選擇國家">${datalist('country-list', countries)}</label><label class="full">旅遊類型<select name="travelScope"><option value="international" ${domestic ? '' : 'selected'}>國外旅遊</option><option value="domestic" ${domestic ? 'selected' : ''}>國內旅遊</option></select></label><div class="form-pair full route-fields"><label><span class="origin-label">${domestic ? '出發地' : '出發機場'}</span><input name="origin" list="origin-list" value="${escapeHtml(trip.origin)}" placeholder="${domestic ? '輸入城市、車站或地點' : '機場代碼或名稱'}">${datalist('origin-list', routeOptions)}</label><label><span class="destination-label">${domestic ? '旅遊目的地' : '目的地機場'}</span><input name="destination" list="destination-list" value="${escapeHtml(trip.destination)}" placeholder="${domestic ? '輸入城市、車站或地點' : '依國家搜尋機場'}">${datalist('destination-list', destinationOptions)}</label></div>${formField('start', '開始日期與時間', trip.start, 'datetime-local')}${formField('end', '結束日期與時間', trip.end, 'datetime-local')}<div class="international-flight-fields full" ${domestic ? 'hidden' : ''}><div class="form-pair"><label>出國航空公司<input name="airline" list="airline-list" value="${escapeHtml(trip.airline)}" placeholder="搜尋航空公司">${datalist('airline-list', airlines)}</label>${formField('flight', '出國航班編號', trip.flight)}</div><label class="inline-check"><input name="sameReturnAirline" type="checkbox" ${trip.sameReturnAirline ? 'checked' : ''}><span>回國航班同出國航空公司</span></label><div class="form-pair return-flight-pair"><label class="return-airline-field" ${trip.sameReturnAirline ? 'hidden' : ''}>回國航空公司<input name="returnAirline" list="airline-list" value="${escapeHtml(trip.returnAirline)}" placeholder="輸入或搜尋航空公司"></label>${formField('returnFlight', '回國航班編號', trip.returnFlight)}</div></div><div class="form-pair full domestic-transport-fields" ${domestic ? '' : 'hidden'}><label>主要交通方式<select name="domesticTransport"><option value="">請選擇</option>${DOMESTIC_TRANSPORTS.map(item => `<option ${item === trip.domesticTransport ? 'selected' : ''}>${item}</option>`).join('')}</select></label>${formField('transportDetail', '班次／車次（選填）', trip.transportDetail, 'text', 'placeholder="例如：高鐵 813、台鐵 112 次"')}</div><div class="form-pair people-pair full">${formField('people', '人數', trip.people, 'number', 'min="1"')}${formField('companions', '同行旅伴', trip.companions, 'text', 'placeholder="以頓號分隔"')}</div><div class="form-pair budget-pair full"><label>預算幣別<input name="budgetCurrency" list="currency-list" value="${escapeHtml(trip.budgetCurrency)}" placeholder="例如 TWD、JPY">${datalist('currency-list', ['TWD', 'JPY', 'KRW', 'USD', 'MYR', 'THB', 'HKD', 'CNY', 'SGD', 'EUR', 'GBP', 'AUD'])}</label>${formField('budget', '預算金額', trip.budget, 'number', 'min="0"')}</div>${formField('status', '狀態', trip.status, 'text', 'placeholder="例如：規劃中、已確認"')}<div class="full cover-uploader"><span class="field-label">旅程封面圖片</span><input name="coverImage" type="hidden" value="${escapeHtml(trip.coverImage)}"><div class="cover-upload-row"><div class="cover-preview" style="--preview:url('${tripImage(trip)}');--fallback:${country.color}" role="img" aria-label="旅程封面預覽"></div><div><label class="button button-soft upload-button">上載圖片<input id="cover-upload" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><button class="button button-ghost" type="button" data-remove-cover>使用國家圖片</button><p class="helper">圖片會壓縮後保存在這個瀏覽器，建議小於 10MB。</p></div></div></div><div class="full"><span class="field-label">城市（可複選）</span><div class="city-add"><input id="custom-city-input" type="text" placeholder="輸入城市後按 Enter"><button class="button button-soft" type="button" data-add-city>＋ 新增城市</button></div><div class="city-chips" id="city-chips"></div></div></div></section>
  <section class="editor-panel" data-panel="expenses" hidden><div class="panel-intro"><div><h3>旅行支出</h3><p>旅行日期會自動建立，每個日期只需選擇一次，再於區塊內連續新增消費。</p></div></div>${datalist('expense-category-list', EXPENSE_CATEGORIES)}<div id="expense-day-entries"></div></section>
  <section class="editor-panel" data-panel="itinerary" hidden><div class="panel-intro"><div><h3>每日行程</h3><p>旅行日期會依開始與結束日期自動建立，點擊日期即可展開填寫。</p></div></div><div id="day-entries"></div></section>
  <section class="editor-panel" data-panel="checklist" hidden><div class="panel-intro"><div><h3>旅程準備清單</h3><p>勾選已完成項目，也可以為這趟旅程新增專屬物品。</p></div></div><div id="checklist-entries"></div></section></form>`;
  const footer = `<div class="modal-foot">${existing ? '<button class="button button-danger" type="button" data-delete>刪除旅程</button>' : ''}<div class="modal-foot-right"><button class="button button-ghost" type="button" data-cancel>取消</button><button class="button button-primary" type="submit" form="trip-form">儲存旅程</button></div></div>`;
  modalFrame(existing ? '編輯旅程' : '新增旅程', body, footer, true);
  renderCityChips(trip.country, trip.cities); activeExpenseDraft = clone(trip.expenses); syncExpenseDayEditors(activeExpenseDraft); activePlanDraft = clone(trip.planDays); syncTripDayEditors(activePlanDraft); checklistEditor(trip.checklist); enhanceDatalistInputs();
  modalContent.querySelectorAll('[data-editor-tab]').forEach(button => button.addEventListener('click', () => switchEditorTab(button.dataset.editorTab)));
  modalContent.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
  modalContent.querySelector('[name="country"]').addEventListener('input', event => {
    if (!data.settings.countries[event.target.value]) return;
    renderCityChips(event.target.value, []); modalContent.querySelector('[name="destination"]').value = ''; syncTravelScopeFields();
  });
  modalContent.querySelector('[name="travelScope"]').addEventListener('change', syncTravelScopeFields);
  modalContent.querySelector('[name="origin"]').addEventListener('input', event => replaceDatalist('airline-list', data.settings.airlinesByAirport[airportCode(event.target.value)] || []));
  modalContent.querySelectorAll('[name="start"], [name="end"]').forEach(input => input.addEventListener('change', () => { syncTripDayEditors(); syncExpenseDayEditors(); }));
  modalContent.querySelector('[name="sameReturnAirline"]').addEventListener('change', event => { modalContent.querySelector('.return-airline-field').hidden = event.target.checked; });
  modalContent.querySelector('#custom-city-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addCustomCity(); } }); modalContent.querySelector('[data-add-city]').addEventListener('click', addCustomCity);
  modalContent.querySelector('#cover-upload').addEventListener('change', async event => { try { const result = await compressCoverImage(event.target.files[0]); modalContent.querySelector('[name="coverImage"]').value = result; modalContent.querySelector('.cover-preview').style.setProperty('--preview', `url('${result}')`); showToast('封面圖片已上載'); } catch (error) { alert(error.message); } finally { event.target.value = ''; } });
  modalContent.querySelector('[data-remove-cover]').addEventListener('click', () => { modalContent.querySelector('[name="coverImage"]').value = ''; const fallback = countryOf(modalContent.querySelector('[name="country"]').value); modalContent.querySelector('.cover-preview').style.setProperty('--preview', `url('${fallback.image}')`); });
  modalContent.querySelector('#trip-form').addEventListener('input', () => updateEditorCompletion(modalContent.querySelector('#trip-form')));
  if (existing) modalContent.querySelector('[data-delete]').addEventListener('click', () => deleteTrip(existing));
  modalContent.querySelector('#trip-form').addEventListener('submit', event => saveTrip(event, trip.id, Boolean(existing)));
  syncTravelScopeFields(); switchEditorTab(initialTab); updateEditorCompletion(modalContent.querySelector('#trip-form')); requestAnimationFrame(() => modalContent.querySelector('[name="title"]').focus());
}

function replaceDatalist(id, options) { const list = modalContent.querySelector(`#${id}`); if (list) list.innerHTML = options.map(option => `<option value="${escapeHtml(option)}"></option>`).join(''); }
function renderCityChips(country, selected) { const container = modalContent.querySelector('#city-chips'); if (!container) return; container.innerHTML = countryOf(country).cities.map(city => `<label class="city-chip"><input type="checkbox" value="${escapeHtml(city)}" ${selected.includes(city) ? 'checked' : ''}><span>${escapeHtml(city)}</span></label>`).join('') || '<p class="helper">這個國家尚未設定城市，可先儲存旅程，再到網站設定新增。</p>'; }

function gatherPlanDays() { return [...modalContent.querySelectorAll('#day-entries .day-editor')].map(day => ({ date: day.querySelector('.day-input').value, items: sortPlanItems([...day.querySelectorAll('.time-editor')].map(row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value.trim()]))).filter(item => Object.values(item).some(Boolean))) })).filter(day => day.items.length); }
function gatherExpenses() {
  return [...modalContent.querySelectorAll('.expense-entry')].map(row => ({ date: row.closest('.expense-day-editor')?.dataset.expenseDate || '', ...Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value.trim()])) })).filter(row => row.item || row.price || row.note);
}
function gatherChecklist() { return [...modalContent.querySelectorAll('.check-group-editor')].map(group => ({ category: group.querySelector('.check-category').value.trim() || '其他', items: [...group.querySelectorAll('.check-edit')].map(row => ({ checked: row.querySelector('[type="checkbox"]').checked, name: row.querySelector('[type="text"]').value.trim() })).filter(item => item.name) })).filter(group => group.items.length); }

async function saveTrip(event, id, replacing) {
  event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
  if (values.start && values.end && new Date(values.end) < new Date(values.start)) { const end = form.querySelector('[name="end"]'); end.setCustomValidity('結束時間需晚於開始時間'); end.reportValidity(); switchEditorTab('overview'); return; }
  if (!data.settings.countries[values.country]) { data.settings.countries[values.country] = { emoji: '🌍', color: '#4f665b', image: '', cities: [], airports: [] }; }
  const trip = normalizeTrip({ ...values, id, sameReturnAirline: form.elements.sameReturnAirline.checked, returnAirline: form.elements.sameReturnAirline.checked ? values.airline : values.returnAirline, cities: [...form.querySelectorAll('#city-chips input:checked')].map(input => input.value), planDays: gatherPlanDays(), expenses: gatherExpenses(), checklist: gatherChecklist() }, data.settings);
  const submit = modalContent.querySelector('[type="submit"][form="trip-form"]'); if (submit) { submit.disabled = true; submit.textContent = activeCollaboration ? '同步中…' : '儲存中…'; }
  if (activeCollaboration?.tripId === trip.id) {
    try { await syncActiveCollaboration(trip); }
    catch (error) { alert(error.status === 409 ? `${error.message}\n\n為避免覆蓋別人的修改，請關閉編輯視窗後按「重新載入」，再重新編輯。` : `無法同步協作旅程：${error.message}`); if (submit) { submit.disabled = false; submit.textContent = '儲存旅程'; } return; }
  }
  if (replacing) data.trips = data.trips.map(item => item.id === id ? trip : item); else data.trips.push(trip);
  if (!saveData()) { if (submit) { submit.disabled = false; submit.textContent = '儲存旅程'; } return; }
  modal.close();
  if (activeCollaboration?.tripId === trip.id) { showToast('修改已同步至所有分享連結'); await renderCollaborativeTrip(activeCollaboration.id, activeCollaboration.editToken); return; }
  const linked = loadShareRecords().some(record => record.tripId === trip.id && record.editToken && Number(record.expiresAt) > Date.now());
  if (linked) { showToast('旅程已儲存，正在同步分享…'); const result = await syncTripShares(trip); showToast(result.conflicts ? '本機已儲存，但雲端有較新的版本' : result.failed ? '本機已儲存，部分分享同步失敗' : '旅程與分享連結已同步'); }
  else showToast('旅程已儲存');
  location.hash = `trip/${encodeURIComponent(trip.id)}`; route();
}

async function deleteTrip(trip) { if (!await confirmDeletion(`確定要刪除「${trip.title}」嗎？這趟旅程的行程、支出與清單也會一併移除。`, '刪除整趟旅程')) return; data.trips = data.trips.filter(item => item.id !== trip.id); saveData(); modal.close(); showToast('旅程已刪除'); location.hash = 'home'; route(); }

function openNote(country, index, editing = false) {
  const notes = country ? countryNotes(country) : data.notes; const note = notes[index]; if (!note) return;
  if (!editing) { modalFrame(note[0], `<p class="preserve-lines">${linkifyText(note[1])}</p><p class="preserve-lines">${linkifyText(note[2])}</p>`, '<div class="modal-foot"><div class="modal-foot-right"><button class="button button-primary" data-done>知道了</button></div></div>'); modalContent.querySelector('[data-done]').addEventListener('click', () => modal.close()); return; }
  modalFrame('編輯筆記', `<form id="note-form" class="form-grid">${formField('title', '標題', note[0], 'text', 'required')}<label class="full">摘要<textarea name="summary" required>${escapeHtml(note[1])}</textarea></label><label class="full">詳細內容<textarea name="detail">${escapeHtml(note[2])}</textarea></label></form>`, '<div class="modal-foot"><div class="modal-foot-right"><button class="button button-ghost" data-cancel>取消</button><button class="button button-primary" type="submit" form="note-form">儲存筆記</button></div></div>');
  modalContent.querySelector('[data-cancel]').addEventListener('click', () => modal.close()); modalContent.querySelector('#note-form').addEventListener('submit', event => { event.preventDefault(); const values = new FormData(event.currentTarget); const updated = [values.get('title'), values.get('summary'), values.get('detail')]; if (country) { const list = countryNotes(country).map(item => [...item]); list[index] = updated; data.countryNotes[country] = list; } else data.notes[index] = updated; saveData(); modal.close(); showToast('筆記已儲存'); route(); });
}

function addCountry() { const name = prompt('新國家的名稱'); if (!name?.trim()) return; const clean = name.trim(); if (!data.settings.countries[clean]) data.settings.countries[clean] = { emoji: '🌍', color: '#4f665b', image: '', cities: [], airports: [] }; saveData(); renderSettings(clean); showToast(`${clean} 已加入國家選單`); }

function bindSettingsSubmit(form) {
  if (form.id === 'share-settings') {
    const input = form.elements.shareKey; const key = input.value.trim();
    if (!key) { alert('請輸入線上分享密碼。'); input.focus(); return; }
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = '連線測試中…';
    verifyShareKey(key).then(() => { localStorage.setItem(SHARE_KEY_STORAGE, key); renderSettings(); showToast('分享密碼已儲存，連線正常'); }).catch(error => { alert(`無法儲存分享密碼：${error.message}`); submit.disabled = false; submit.textContent = '儲存並測試'; });
    return;
  }
  if (form.id === 'country-settings') { const values = Object.fromEntries(new FormData(form)); const original = values.original; const name = values.name.trim(); if (!name) return; const current = countryOf(original); const updated = { ...current, emoji: values.emoji || '🌍', image: values.image, color: values.color || '#4f665b', cities: lines(values.cities), airports: lines(values.airports) }; if (name !== original) delete data.settings.countries[original]; data.settings.countries[name] = updated; data.trips.forEach(trip => { if (trip.country === original) trip.country = name; }); saveData(); renderSettings(name); showToast('國家設定已儲存'); }
  if (form.id === 'origin-settings') { data.settings.originAirports = lines(new FormData(form).get('origins')); saveData(); renderSettings(); showToast('出發機場已儲存'); }
  if (form.id === 'airline-settings') { const code = document.querySelector('#airline-airport').value; data.settings.airlinesByAirport[code] = lines(new FormData(form).get('airlines')); saveData(); renderSettings(undefined, code); showToast('航空公司已儲存'); }
  if (form.id === 'template-settings') { data.settings.checklistTemplates = [...form.querySelectorAll('.template-row')].map(row => ({ category: row.querySelector('.template-category').value.trim() || '其他', items: lines(row.querySelector('.template-items').value) })).filter(group => group.items.length); saveData(); renderSettings(); showToast('準備清單範本已儲存'); }
  if (form.id === 'home-notes-settings') { data.notes = [...form.querySelectorAll('.note-settings-row')].map(row => [row.querySelector('.note-setting-title').value.trim(), row.querySelector('.note-setting-summary').value.trim(), row.querySelector('.note-setting-detail').value.trim()]); saveData(); renderSettings(); showToast('首頁旅行筆記已儲存'); }
  if (form.id === 'theme-settings') { const values = Object.fromEntries(new FormData(form)); data.settings.theme = { accent: values.accent, warm: values.warm, background: values.background }; saveData(); applyTheme(); renderSettings(); showToast('網站配色已套用'); }
}

function safeFilename(value) { return String(value || '旅程').replace(/[\\/:*?"<>|]/g, '-').trim() || '旅程'; }
function exportTripPdf(id) {
  const trip = data.trips.find(item => item.id === id); if (!trip) return;
  const previousTitle = document.title; const collapsedDays = [...app.querySelectorAll('.day-card')].filter(card => card.querySelector('.day-items')?.hidden);
  collapsedDays.forEach(card => { card.classList.remove('is-collapsed'); card.querySelector('.day-items').hidden = false; card.querySelector('[data-toggle-trip-day]')?.setAttribute('aria-expanded', 'true'); });
  document.title = `${safeFilename(trip.title)}－旅程記錄`; document.body.classList.add('printing-trip');
  const restore = () => { collapsedDays.forEach(card => { card.classList.add('is-collapsed'); card.querySelector('.day-items').hidden = true; card.querySelector('[data-toggle-trip-day]')?.setAttribute('aria-expanded', 'false'); }); document.body.classList.remove('printing-trip'); document.title = previousTitle; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore); requestAnimationFrame(() => requestAnimationFrame(() => window.print())); setTimeout(restore, 1500);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(token) {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/'); const padded = base64 + '='.repeat((4 - base64.length % 4) % 4); const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function encodeSharePayload(value) {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  if (typeof CompressionStream !== 'function') return `raw.${bytesToBase64Url(raw)}`;
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')); const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return `gz.${bytesToBase64Url(compressed)}`;
}

async function decodeSharePayload(token) {
  const separator = token.indexOf('.'); const format = separator > 0 ? token.slice(0, separator) : 'legacy'; const encoded = separator > 0 ? token.slice(separator + 1) : token; let bytes = base64UrlToBytes(encoded);
  if (format === 'gz') { if (typeof DecompressionStream !== 'function') throw new Error('此瀏覽器不支援壓縮分享連結'); const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')); bytes = new Uint8Array(await new Response(stream).arrayBuffer()); }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function shareableImage(value) {
  if (!value || String(value).startsWith('data:')) return '';
  try { const url = new URL(String(value), location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}

let turnstileLoader;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoader) return turnstileLoader;
  turnstileLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('無法載入人機驗證'));
    script.onerror = () => reject(new Error('無法載入人機驗證，請檢查網路或內容阻擋設定'));
    document.head.append(script);
  });
  return turnstileLoader;
}

async function requestTurnstileToken() {
  if (TURNSTILE_SITE_KEY.startsWith('__')) throw new Error('公開分享尚未完成 Turnstile 設定');
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    let settled = false; let widgetId;
    const finish = (error, token) => {
      if (settled) return; settled = true;
      if (widgetId !== undefined) turnstile.remove(widgetId);
      modal.close(); error ? reject(error) : resolve(token);
    };
    modalFrame('建立同步分享', '<div class="turnstile-prompt"><p>完成快速驗證後，系統會建立有效 30 天的唯讀與協作連結。</p><div id="share-turnstile"></div><p class="helper">建立後可在「網站設定」複製連結或提前撤銷。</p></div>', '<div class="modal-foot"><div class="modal-foot-right"><button class="button button-ghost" type="button" data-cancel-share>取消</button></div></div>');
    modalContent.querySelectorAll('[data-close], [data-cancel-share]').forEach(button => button.addEventListener('click', () => finish(new DOMException('已取消分享', 'AbortError'))));
    try {
      widgetId = turnstile.render('#share-turnstile', { sitekey: TURNSTILE_SITE_KEY, action: 'create_share', theme: 'auto', appearance: 'interaction-only', callback: token => finish(null, token), 'error-callback': () => finish(new Error('人機驗證載入失敗，請重新嘗試')) });
    } catch (error) { finish(error); }
  });
}

async function shareApiRequest(path, options = {}) {
  let response;
  try { response = await fetch(`${SHARE_API_URL}${path}`, options); }
  catch { throw new Error('無法連線至線上分享服務，請檢查網路後再試'); }
  let result = {};
  try { result = await response.json(); } catch { /* 使用下方的通用錯誤 */ }
  if (!response.ok) { const error = new Error(result.error || `分享服務發生錯誤（${response.status}）`); error.status = response.status; error.details = result; throw error; }
  return result;
}

async function verifyShareKey(key) {
  return shareApiRequest('/auth/check', { method: 'POST', headers: { 'X-Share-Key': key } });
}

async function createOnlineShare(trip, turnstileToken) {
  return shareApiRequest('/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: createSharePayload(trip), turnstileToken, expiresInDays: 30 })
  });
}

async function loadOnlineShare(id) {
  return shareApiRequest(`/shares/${encodeURIComponent(id)}`);
}

async function updateOnlineShare(record, trip) {
  return shareApiRequest(`/shares/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Edit-Token': record.editToken },
    body: JSON.stringify({ payload: createSharePayload(trip), version: Number(record.version) || 1 })
  });
}

function rememberShare(trip, result) {
  const records = loadShareRecords().filter(record => record.id !== result.id);
  records.unshift({ id: result.id, tripId: trip.id, title: trip.title, expiresAt: result.expiresAt, deleteToken: result.deleteToken, editToken: result.editToken, version: result.version || 1, updatedAt: result.updatedAt || Date.now(), createdAt: Date.now() });
  saveShareRecords(records);
}

function updateRememberedShare(id, updates) {
  const records = loadShareRecords(); const index = records.findIndex(record => record.id === id);
  if (index < 0) return;
  records[index] = { ...records[index], ...updates }; saveShareRecords(records);
}

async function syncTripShares(trip, { quiet = false } = {}) {
  const records = loadShareRecords(); const linked = records.filter(record => record.tripId === trip.id && record.editToken && Number(record.expiresAt) > Date.now());
  if (!linked.length) return { synced: 0, conflicts: 0, failed: 0 };
  let synced = 0; let conflicts = 0; let failed = 0;
  for (const record of linked) {
    try {
      const result = await updateOnlineShare(record, trip);
      Object.assign(record, { title: trip.title, version: result.version, updatedAt: result.updatedAt, expiresAt: result.expiresAt || record.expiresAt }); synced += 1;
    } catch (error) {
      if (error.status === 409) { conflicts += 1; Object.assign(record, { version: error.details?.version || record.version, updatedAt: error.details?.updatedAt || record.updatedAt }); }
      else { failed += 1; if (!quiet) alert(`旅程已儲存在這台裝置，但雲端同步失敗：${error.message}`); }
    }
  }
  saveShareRecords(records);
  if (conflicts && !quiet) alert('雲端版本已被其他裝置更新，因此沒有覆蓋對方的內容。請開啟協作連結確認最新版後再編輯。');
  return { synced, conflicts, failed };
}

async function syncActiveCollaboration(trip) {
  if (!activeCollaboration || activeCollaboration.tripId !== trip.id) return null;
  const result = await updateOnlineShare(activeCollaboration, trip);
  Object.assign(activeCollaboration, { version: result.version, updatedAt: result.updatedAt, expiresAt: result.expiresAt || activeCollaboration.expiresAt });
  updateRememberedShare(activeCollaboration.id, { tripId: trip.id, title: trip.title, version: result.version, updatedAt: result.updatedAt, expiresAt: activeCollaboration.expiresAt });
  return result;
}

async function revokeShare(id) {
  const records = loadShareRecords(); const record = records.find(item => item.id === id); if (!record) return;
  if (Number(record.expiresAt) <= Date.now()) { saveShareRecords(records.filter(item => item.id !== id)); renderSettings(); showToast('已移除本機的過期紀錄'); return; }
  if (!await confirmDeletion(`確定要撤銷「${record.title || '這份旅程'}」的唯讀與協作連結嗎？撤銷後，收到連結的人都將無法再開啟。`, '撤銷分享連結')) return;
  try {
    await shareApiRequest(`/shares/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-Delete-Token': record.deleteToken } });
    saveShareRecords(records.filter(item => item.id !== id)); renderSettings(); showToast('分享與協作權限已撤銷');
  } catch (error) { alert(`無法撤銷分享：${error.message}`); }
}

function createSharePayload(trip) {
  const destination = countryOf(trip.country); const theme = data.settings.theme || DEFAULT_THEME;
  const packedTrip = [trip.id, trip.title, trip.country, trip.cities, trip.origin, trip.destination, shareableImage(trip.coverImage), trip.start, trip.end, trip.airline, trip.flight, trip.sameReturnAirline ? 1 : 0, trip.returnAirline, trip.returnFlight, trip.status, trip.people, trip.companions, trip.budget, trip.budgetCurrency,
    trip.planDays.map(day => [day.date, day.items.map(item => [item.time, item.activity, item.transport, item.map, item.note])]),
    trip.expenses.map(row => [row.item, row.price, row.quantity, row.split, row.note, row.date, row.category]),
    trip.checklist.map(group => [group.category, group.items.map(item => [item.name, item.checked ? 1 : 0])]),
    trip.travelScope, trip.domesticTransport, trip.transportDetail];
  return { v: 3, t: packedTrip, c: [destination.emoji, normalizeHex(destination.color, '#4f665b'), shareableImage(destination.image)], h: [theme.accent, theme.warm, theme.background] };
}

function expandSharePayload(payload) {
  if (![2, 3].includes(payload?.v)) return payload;
  const t = payload.t; if (!Array.isArray(t) || !Array.isArray(payload.c) || !Array.isArray(payload.h)) throw new Error('分享資料格式不正確');
  return { version: 1, trip: { id: t[0], title: t[1], country: t[2], cities: t[3], origin: t[4], destination: t[5], coverImage: t[6], start: t[7], end: t[8], airline: t[9], flight: t[10], sameReturnAirline: Boolean(t[11]), returnAirline: t[12], returnFlight: t[13], status: t[14], people: t[15], companions: t[16], budget: t[17], budgetCurrency: t[18], travelScope: payload.v >= 3 ? t[22] : 'international', domesticTransport: payload.v >= 3 ? t[23] : '', transportDetail: payload.v >= 3 ? t[24] : '',
    planDays: (t[19] || []).map(day => ({ date: day[0], items: (day[1] || []).map(item => ({ time: item[0], activity: item[1], transport: item[2], map: item[3], note: item[4] })) })),
    expenses: (t[20] || []).map(row => ({ item: row[0], price: row[1], quantity: row[2], split: row[3], note: row[4], date: row[5] || '', category: row[6] || '其他' })),
    checklist: (t[21] || []).map(group => ({ category: group[0], items: (group[1] || []).map(item => ({ name: item[0], checked: Boolean(item[1]) })) })) },
    country: { emoji: payload.c[0], color: payload.c[1], image: payload.c[2], cities: [], airports: [] }, theme: { accent: payload.h[0], warm: payload.h[1], background: payload.h[2] } };
}

function sharedTripBundle(storedPayload) {
  const payload = expandSharePayload(storedPayload);
  if (payload?.version !== 1 || !payload.trip || typeof payload.trip !== 'object' || !payload.trip.country) throw new Error('分享資料格式不正確');
  const countryName = String(payload.trip.country); const sharedSettings = normalizeSettings({ countries: { [countryName]: payload.country || {} }, theme: payload.theme || DEFAULT_THEME });
  sharedSettings.countries[countryName].image = shareableImage(sharedSettings.countries[countryName].image); sharedSettings.countries[countryName].color = normalizeHex(sharedSettings.countries[countryName].color, '#4f665b');
  const sharedTrip = normalizeTrip(payload.trip, sharedSettings); sharedTrip.coverImage = shareableImage(sharedTrip.coverImage);
  return { sharedTrip, sharedSettings, countryName };
}

function startShareRefresh(mode, id, token, version) {
  clearInterval(shareRefreshTimer); let knownVersion = Number(version) || 1; let checking = false;
  shareRefreshTimer = setInterval(async () => {
    if (checking || modal.open || confirmDialog.open) return;
    checking = true;
    try {
      const latest = await loadOnlineShare(id);
      if ((Number(latest.version) || 1) > knownVersion) {
        knownVersion = Number(latest.version) || knownVersion;
        if (mode === 'readonly') await renderSharedTrip(id); else await renderCollaborativeTrip(id, token);
      }
    } catch (error) { if ([404, 410].includes(error.status)) { clearInterval(shareRefreshTimer); showToast(error.message); } }
    finally { checking = false; }
  }, SHARE_REFRESH_INTERVAL);
}

async function renderSharedTrip(token) {
  clearInterval(shareRefreshTimer); app.innerHTML = '<section class="page-intro"><div class="empty"><h3>正在開啟唯讀旅程…</h3></div></section>';
  try {
    const onlineShare = token.startsWith('s_') ? await loadOnlineShare(token) : null;
    const storedPayload = onlineShare ? onlineShare.payload : await decodeSharePayload(token);
    const { sharedTrip, sharedSettings, countryName } = sharedTripBundle(storedPayload);
    if (decodeURIComponent(location.hash.slice(1)) !== `share/${token}`) return;
    activeSharedImport = { trip: clone(sharedTrip), country: clone(sharedSettings.countries[countryName]) };
    const originalData = data;
    try { data = { version: 3, settings: sharedSettings, trips: [sharedTrip], countryNotes: {}, notes: [] }; renderTrip(sharedTrip.id); } finally { data = originalData; }
    document.body.classList.add('readonly-share'); document.title = `${sharedTrip.title}－唯讀旅程`; applyTheme(sharedSettings.theme);
    app.querySelectorAll('button:not([data-toggle-trip-day]):not([data-trip-tab]), .page-back').forEach(element => element.remove());
    app.querySelectorAll('input').forEach(input => { input.disabled = true; input.removeAttribute('data-quick-check'); });
    app.querySelectorAll('.section').forEach(section => { if (section.querySelector('h2')?.textContent === '旅程準備清單') { const copy = section.querySelector('.section-copy'); if (copy) copy.textContent = `已完成 ${sharedTrip.checklist.flatMap(group => group.items).filter(item => item.checked).length}／${sharedTrip.checklist.flatMap(group => group.items).length} 項`; } });
    const expiry = onlineShare?.expiresAt ? `有效至 ${shareExpiryDate(onlineShare.expiresAt)}，內容每 5 秒同步。` : '此頁僅供查看，內容無法編輯。';
    app.insertAdjacentHTML('afterbegin', `<div class="readonly-share-banner"><div class="readonly-share-message"><strong>同步唯讀旅程</strong><span>${escapeHtml(expiry)}</span></div><button class="button button-primary" type="button" data-action="import-shared-trip">加入我的旅程</button></div>`);
    if (onlineShare) startShareRefresh('readonly', token, '', onlineShare.version);
  } catch (error) {
    document.body.classList.add('readonly-share'); app.innerHTML = `<section class="page-intro">${emptyState('無法開啟這份旅程', error.message || '連結可能不完整、已過期或已損壞。', false)}</section>`;
  }
}

async function renderCollaborativeTrip(id, editToken) {
  clearInterval(shareRefreshTimer); app.innerHTML = '<section class="page-intro"><div class="empty"><h3>正在開啟協作旅程…</h3></div></section>';
  try {
    const onlineShare = await loadOnlineShare(id); const { sharedTrip, sharedSettings, countryName } = sharedTripBundle(onlineShare.payload);
    if (decodeURIComponent(location.hash.slice(1)) !== `collab/${id}/${editToken}`) return;
    const incomingCountry = sharedSettings.countries[countryName]; const localCountry = data.settings.countries[countryName];
    data.settings.countries[countryName] = localCountry ? { ...localCountry, cities: [...new Set([...localCountry.cities, ...sharedTrip.cities])] } : { ...incomingCountry, cities: [...new Set([...incomingCountry.cities, ...sharedTrip.cities])] };
    data.trips = [...data.trips.filter(item => item.id !== sharedTrip.id), sharedTrip]; saveData();
    activeCollaboration = { id, editToken, tripId: sharedTrip.id, version: Number(onlineShare.version) || 1, updatedAt: Number(onlineShare.updatedAt) || 0, expiresAt: Number(onlineShare.expiresAt) || 0 };
    updateRememberedShare(id, { tripId: sharedTrip.id, title: sharedTrip.title, version: activeCollaboration.version, updatedAt: activeCollaboration.updatedAt });
    renderTrip(sharedTrip.id); document.body.classList.add('collaborative-share'); document.title = `${sharedTrip.title}－協作旅程`;
    app.querySelector('.page-back')?.remove();
    app.insertAdjacentHTML('afterbegin', `<div class="readonly-share-banner collaboration-banner"><div class="readonly-share-message"><strong>協作編輯中</strong><span>修改會同步到同一趟旅程；其他裝置每 5 秒取得最新版。版本 ${activeCollaboration.version}${activeCollaboration.updatedAt ? ` · ${escapeHtml(shareExpiryDate(activeCollaboration.updatedAt))} 更新` : ''}</span></div><button class="button button-soft" type="button" data-action="reload-collab">重新載入</button></div>`);
    startShareRefresh('collab', id, editToken, activeCollaboration.version);
  } catch (error) {
    document.body.classList.add('collaborative-share'); app.innerHTML = `<section class="page-intro">${emptyState('無法開啟協作旅程', error.message || '協作連結可能不完整、已過期或已撤銷。', false)}</section>`;
  }
}

function openSharedImportConfirmation() {
  if (!activeSharedImport?.trip) return;
  const trip = activeSharedImport.trip;
  modalFrame('加入我的旅程', `<div class="import-share-copy"><p>要將「${escapeHtml(trip.title)}」加入目前裝置的旅程嗎？</p><p class="helper">系統會建立一份獨立且可編輯的副本，之後的修改不會影響原分享者。</p></div>`, '<div class="modal-foot"><div class="modal-foot-right"><button class="button button-ghost" type="button" data-cancel-import>取消</button><button class="button button-primary" type="button" data-confirm-import>確認加入</button></div></div>');
  modalContent.querySelector('[data-cancel-import]').addEventListener('click', () => modal.close());
  modalContent.querySelector('[data-confirm-import]').addEventListener('click', importSharedTrip);
}

function importSharedTrip() {
  if (!activeSharedImport?.trip) return;
  const source = clone(activeSharedImport.trip); const countryName = source.country;
  if (!data.settings.countries[countryName]) {
    data.settings.countries[countryName] = { ...clone(activeSharedImport.country), cities: [...new Set(source.cities)], airports: activeSharedImport.country?.airports || [] };
  } else {
    data.settings.countries[countryName].cities = [...new Set([...data.settings.countries[countryName].cities, ...source.cities])];
  }
  source.id = crypto.randomUUID();
  const imported = normalizeTrip(source, data.settings); data.trips.unshift(imported);
  if (!saveData()) { data.trips.shift(); return; }
  modal.close(); location.hash = `trip/${encodeURIComponent(imported.id)}`; route(); showToast('已加入我的旅程，可開始編輯');
}

async function copyShareUrl(url) {
  try { await navigator.clipboard.writeText(url); return true; } catch { window.prompt('請複製以下連結', url); return false; }
}

function openShareLinks(trip, record) {
  const readUrl = onlineShareUrl(record.id); const editUrl = collaborationUrl(record.id, record.editToken);
  modalFrame('分享與同步旅程', `<div class="share-link-options"><section><div><strong>唯讀連結</strong><p>對方只能查看；你日後儲存修改，這條連結會自動顯示最新版。</p></div><div class="share-link-row"><input value="${escapeHtml(readUrl)}" readonly aria-label="唯讀連結"><button class="button button-primary" type="button" data-copy-link="readonly">複製</button></div></section><section><div><strong>協作編輯連結</strong><p>持有連結的人可以直接修改同一趟旅程，請只傳給信任的人。</p></div><div class="share-link-row"><input value="${escapeHtml(editUrl)}" readonly aria-label="協作編輯連結"><button class="button button-primary" type="button" data-copy-link="collab">複製</button></div></section><p class="share-security-note">兩條連結有效至 ${escapeHtml(shareExpiryDate(record.expiresAt))}。你可以到「網站設定」隨時撤銷；撤銷後兩條連結都會失效。</p></div>`, '<div class="modal-foot"><div class="modal-foot-right"><button class="button button-ghost" type="button" data-close-share>完成</button></div></div>');
  modalContent.querySelector('[data-close-share]').addEventListener('click', () => modal.close());
  modalContent.querySelectorAll('[data-copy-link]').forEach(button => button.addEventListener('click', async () => { await copyShareUrl(button.dataset.copyLink === 'collab' ? editUrl : readUrl); showToast(button.dataset.copyLink === 'collab' ? '協作編輯連結已複製' : '唯讀連結已複製'); }));
}

async function shareTrip(id) {
  const trip = data.trips.find(item => item.id === id); if (!trip) return;
  try {
    const existing = loadShareRecords().find(record => record.tripId === trip.id && record.editToken && Number(record.expiresAt) > Date.now());
    if (existing) {
      const result = await updateOnlineShare(existing, trip);
      const record = { ...existing, title: trip.title, version: result.version, updatedAt: result.updatedAt, expiresAt: result.expiresAt || existing.expiresAt };
      updateRememberedShare(existing.id, record); openShareLinks(trip, record); return;
    }
    const turnstileToken = await requestTurnstileToken();
    const result = await createOnlineShare(trip, turnstileToken); rememberShare(trip, result);
    openShareLinks(trip, { ...result, tripId: trip.id, title: trip.title });
  } catch (error) { if (error.name !== 'AbortError') alert(`無法分享旅程：${error.message}`); }
}

function backupData() { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `旅跡備份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); showToast('備份檔已下載'); }
async function importData() { const file = fileInput.files[0]; if (!file) return; try { const imported = normalizeData(JSON.parse(await file.text())); if (!confirm(`將匯入 ${imported.trips.length} 趟旅程並取代目前資料，確定繼續嗎？`)) return; data = imported; saveData(); route(); showToast('資料匯入完成'); } catch (error) { alert(`無法匯入檔案：${error.message}`); } finally { fileInput.value = ''; } }

app.addEventListener('submit', event => { if (event.target.closest('.settings-grid')) { event.preventDefault(); bindSettingsSubmit(event.target); } });
app.addEventListener('change', async event => {
  if (event.target.id === 'settings-country') renderSettings(event.target.value);
  if (event.target.id === 'airline-airport') renderSettings(undefined, event.target.value);
  if (event.target.matches('[data-quick-check]')) {
    const trip = data.trips.find(item => item.id === event.target.dataset.tripId);
    if (!trip || !isUpcoming(trip)) { renderTrip(event.target.dataset.tripId); return; }
    const item = trip.checklist[Number(event.target.dataset.groupIndex)]?.items[Number(event.target.dataset.itemIndex)];
    if (!item) return;
    const previous = item.checked; item.checked = event.target.checked;
    if (activeCollaboration?.tripId === trip.id) {
      try { await syncActiveCollaboration(trip); }
      catch (error) { item.checked = previous; event.target.checked = previous; alert(error.status === 409 ? '其他裝置已更新這趟旅程，請重新載入後再勾選。' : `無法同步：${error.message}`); return; }
    }
    saveData();
    const syncResult = activeCollaboration ? null : await syncTripShares(trip, { quiet: true });
    if (activeCollaboration) await renderCollaborativeTrip(activeCollaboration.id, activeCollaboration.editToken); else { renderTrip(trip.id); switchTripContentTab('checklist'); }
    if (syncResult?.conflicts) showToast('本機已更新，但雲端已有較新版本');
    else if (syncResult?.failed) showToast('本機已更新，雲端同步暫時失敗');
    else showToast(event.target.checked ? '已標記為完成並同步' : '已取消完成並同步');
  }
});
app.addEventListener('click', event => {
  const target = event.target.closest('button, a'); if (!target) return; const { action, id, country, index, city, tab } = target.dataset;
  if (target.dataset.tripTab) { switchTripContentTab(target.dataset.tripTab); return; }
  if (target.matches('[data-toggle-trip-day]')) { const card = target.closest('.day-card'); const items = card?.querySelector('.day-items'); if (!items) return; items.hidden = !items.hidden; card.classList.toggle('is-collapsed', items.hidden); target.setAttribute('aria-expanded', String(!items.hidden)); return; }
  if (target.dataset.scrollTarget) { document.querySelector(`#${target.dataset.scrollTarget}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (action === 'back') { if (history.length > 1) history.back(); else location.hash = 'home'; return; }
  if (action === 'import-shared-trip') { openSharedImportConfirmation(); return; }
  if (action === 'reload-collab' && activeCollaboration) { renderCollaborativeTrip(activeCollaboration.id, activeCollaboration.editToken); return; }
  if (action === 'new') openTripEditor('', country || ''); if (action === 'edit') openTripEditor(id, '', tab || 'overview');
  if (action === 'print-trip') exportTripPdf(id); if (action === 'share-trip') shareTrip(id);
  if (target.matches('[data-country]:not([data-action]):not([data-city])')) location.hash = `country/${encodeURIComponent(country)}`; if (target.matches('[data-city]')) renderCountry(country, city);
  if (action === 'read-home-note') openNote('', Number(index)); if (action === 'edit-home-note') openNote('', Number(index), true); if (action === 'read-country-note') openNote(country, Number(index)); if (action === 'edit-country-note') openNote(country, Number(index), true);
  if (target.dataset.carousel) { const carousel = document.querySelector('#country-carousel'); carousel?.scrollBy({ left: (target.dataset.carousel === 'next' ? 1 : -1) * carousel.clientWidth * .82, behavior: 'smooth' }); }
  if (target.dataset.statsScope) { homeStatsScope = target.dataset.statsScope; renderHome(); }
  if (action === 'add-country') addCountry();
  if (action === 'add-template') { document.querySelector('#template-list').insertAdjacentHTML('beforeend', templateEditor()); }
  if (target.matches('[data-reset-theme]')) { data.settings.theme = clone(DEFAULT_THEME); saveData(); applyTheme(); renderSettings(); showToast('已恢復預設配色'); }
  if (target.matches('[data-clear-share-key]')) { localStorage.removeItem(SHARE_KEY_STORAGE); renderSettings(); showToast('已清除此裝置的分享密碼'); }
  if (target.dataset.copyShare) { copyShareUrl(onlineShareUrl(target.dataset.copyShare)).then(() => showToast('唯讀連結已複製')); }
  if (target.dataset.copyCollab) { const record = loadShareRecords().find(item => item.id === target.dataset.copyCollab); if (record?.editToken) copyShareUrl(collaborationUrl(record.id, record.editToken)).then(() => showToast('協作編輯連結已複製')); }
  if (target.dataset.revokeShare) revokeShare(target.dataset.revokeShare);
  if (target.matches('[data-remove-template]')) { const row = target.closest('.template-row'); const name = row.querySelector('.template-category')?.value.trim() || '這個清單分類'; confirmDeletion(`確定要刪除「${name}」嗎？`, '刪除清單範本').then(confirmed => { if (confirmed) row.remove(); }); }
});

document.querySelector('#new-trip').addEventListener('click', () => openTripEditor()); document.querySelector('#backup').addEventListener('click', backupData); document.querySelector('#import').addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', importData);
modal.addEventListener('cancel', event => event.preventDefault());
document.querySelector('#confirm-close').addEventListener('click', () => closeDeleteConfirmation(false)); document.querySelector('#confirm-cancel').addEventListener('click', () => closeDeleteConfirmation(false)); document.querySelector('#confirm-delete').addEventListener('click', () => closeDeleteConfirmation(true)); confirmDialog.addEventListener('cancel', event => { event.preventDefault(); closeDeleteConfirmation(false); });
window.addEventListener('hashchange', route); route();
