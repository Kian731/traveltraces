const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modal-content');
const fileInput = document.querySelector('#file');
const toastElement = document.querySelector('#toast');

const STORAGE_KEY = 'travelBookV3';
const PREVIOUS_KEYS = ['travelBookV2', 'travelBook'];
const clone = value => JSON.parse(JSON.stringify(value));

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
  expenses: [{ item: '機票', price: '16800', quantity: '2', split: '2', note: '含托運行李' }, { item: '住宿', price: '12400', quantity: '1', split: '2', note: '5 晚' }]
};

function defaultChecklist(settings) {
  return settings.checklistTemplates.map(group => ({ category: group.category, items: group.items.map(name => ({ name, checked: false })) }));
}

function defaultData() {
  const settings = clone(TRAVEL_CATALOG);
  return { version: 3, settings, trips: [normalizeTrip(sampleTrip, settings)], countryNotes: {}, notes: clone(defaultNotes) };
}

function normalizeSettings(raw = {}) {
  const base = clone(TRAVEL_CATALOG);
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

function normalizePlan(trip) {
  if (Array.isArray(trip.planDays)) return trip.planDays.map(day => ({
    date: String(day.date || ''), items: Array.isArray(day.items) ? day.items.map(item => ({ time: String(item.time || ''), activity: String(item.activity || ''), transport: String(item.transport || ''), map: String(item.map || ''), note: String(item.note || '') })) : []
  }));
  const grouped = new Map();
  (Array.isArray(trip.plan) ? trip.plan : []).forEach(row => {
    if (!Array.isArray(row)) return;
    const date = String(row[0] || '');
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push({ time: String(row[1] || ''), activity: String(row[2] || ''), transport: String(row[3] || ''), map: '', note: String(row[4] || '') });
  });
  return [...grouped].map(([date, items]) => ({ date, items }));
}

function normalizeExpenses(trip) {
  if (Array.isArray(trip.expenses)) return trip.expenses.map(row => ({ item: String(row.item || ''), price: String(row.price || ''), quantity: String(row.quantity || '1'), split: String(row.split || ''), note: String(row.note || '') }));
  return (Array.isArray(trip.cost) ? trip.cost : []).filter(Array.isArray).map(row => ({ item: String(row[0] || ''), price: String(row[1] || ''), quantity: String(row[2] || '1'), split: '', note: String(row[3] || '') }));
}

function normalizeChecklist(raw, settings) {
  if (!Array.isArray(raw)) return defaultChecklist(settings);
  return raw.map(group => ({ category: String(group.category || '其他'), items: Array.isArray(group.items) ? group.items.map(item => typeof item === 'string' ? { name: item, checked: false } : { name: String(item.name || ''), checked: Boolean(item.checked) }) : [] }));
}

function normalizeTrip(trip = {}, settings = data?.settings || normalizeSettings()) {
  return {
    id: String(trip.id || crypto.randomUUID()), title: String(trip.title || '未命名旅程'), country: String(trip.country || '日本'),
    cities: Array.isArray(trip.cities) ? trip.cities.map(String) : [], origin: String(trip.origin || ''), destination: String(trip.destination || ''),
    coverImage: String(trip.coverImage || ''),
    start: String(trip.start || ''), end: String(trip.end || ''), airline: String(trip.airline || ''), flight: String(trip.flight || ''),
    sameReturnAirline: trip.sameReturnAirline === undefined ? true : Boolean(trip.sameReturnAirline), returnAirline: String(trip.returnAirline || ''), returnFlight: String(trip.returnFlight || ''), status: String(trip.status || ''),
    people: String(trip.people || '1'), companions: String(trip.companions || ''), budget: String(trip.budget || ''),
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
saveData();

function saveData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch (error) { console.error('無法儲存旅行資料', error); alert('瀏覽器儲存空間不足，請改用較小的封面圖片或先備份並移除不需要的圖片。'); return false; } }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
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
  const totalHours = Math.max(1, Math.ceil((new Date(future.start) - now) / 3600000));
  return { trip: future, text: `倒數 ${Math.floor(totalHours / 24)}天 ${totalHours % 24}小時`, active: false };
}

let toastTimer;
function showToast(message) { toastElement.textContent = message; toastElement.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastElement.classList.remove('show'), 2600); }
function emptyState(title, copy, action = true) { return `<div class="empty"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p>${action ? '<button class="button button-primary" data-action="new">新增第一趟旅程</button>' : ''}</div>`; }
function pageBack() { return '<div class="page-back"><button class="button button-ghost" data-action="back" type="button">← 返回上一頁</button></div>'; }

function tripCard(trip) {
  const destination = countryOf(trip.country);
  const upcoming = isUpcoming(trip); const remaining = countdown(trip); const complete = isRecordComplete(trip);
  return `<a class="trip-card ${upcoming ? 'upcoming-card' : 'past-card'}" href="#trip/${encodeURIComponent(trip.id)}" aria-label="查看${escapeHtml(trip.title)}旅程">${upcoming ? `<div class="trip-countdown"><b>${remaining.value}</b><span>${remaining.label}</span></div>` : ''}<div class="trip-thumb" role="img" aria-label="${escapeHtml(trip.country)}旅行風景" style="--image:url('${tripImage(trip)}');--fallback:${destination.color}"></div><div class="trip-body"><div class="memory-mobile-head"><strong>${escapeHtml(trip.country)}</strong><span>${escapeHtml(routeCodeText(trip))}</span></div><p class="memory-trip-title">${escapeHtml(trip.title)}</p><div class="trip-title-row"><h3>${escapeHtml(trip.title)}</h3><p class="trip-route">${escapeHtml(routeText(trip))}</p></div><div class="record-row"><span class="status ${upcoming ? '' : 'past'}">${upcoming ? '即將出發' : '旅程回憶'}</span>${complete ? '' : '<span class="record-state">待完成記錄</span>'}</div><p class="trip-meta"><span>${formatDate(trip.start)}－${formatDate(trip.end)}</span><span>${tripDays(trip)}</span></p><div class="trip-cities">${(trip.cities.length ? trip.cities : ['尚未選擇']).map(city => `<span class="city-tag">${escapeHtml(city)}</span>`).join('')}</div></div></a>`;
}

function notesMarkup(notes, context = 'home') {
  return notes.map((note, index) => `<article class="note-card"><div class="topline"><h3>${escapeHtml(note[0])}</h3>${context === 'home' ? '' : `<button class="icon-button" data-action="edit-${context}-note" data-index="${index}" aria-label="編輯${escapeHtml(note[0])}">✎</button>`}</div><p>${escapeHtml(note[1])}</p><button class="text-button" data-action="read-${context}-note" data-index="${index}">閱讀更多 →</button></article>`).join('');
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
  app.innerHTML = `<section class="hero" style="--hero-image:url('${hero.image}');--fallback:${hero.color}"><div class="hero-content"><p class="eyebrow">Personal travel archive</p><h1>把走過的地方，<br>好好收藏起來。</h1><p>從出發前的規劃，到旅途後的回憶，都放在同一個簡單、安靜的地方。</p><button class="button button-primary" data-action="new">規劃一趟新旅程</button></div></section>
  <div class="stats" aria-label="旅行統計"><div class="stats-scope"><span class="scope-mark" aria-hidden="true">🏅</span><div><button class="${homeStatsScope === 'all' ? 'active' : ''}" data-stats-scope="all">總和</button><button class="${homeStatsScope === 'year' ? 'active' : ''}" data-stats-scope="year">今年</button></div></div><div class="stat"><b>${countries}</b><span>個國家</span></div><div class="stat"><b>${cities}</b><span>個城市</span></div><div class="stat"><b>${totalDays}</b><span>個旅行日</span></div></div>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Destinations</p><h2>目的地收藏</h2></div><div class="carousel-controls"><button class="icon-button" data-carousel="prev" aria-label="上一個目的地">←</button><button class="icon-button" data-carousel="next" aria-label="下一個目的地">→</button></div></div>
    <div class="country-carousel" id="country-carousel">${visitedCountries.map(([name, item]) => { const count = data.trips.filter(trip => trip.country === name).length; return `<button class="country-card" data-country="${escapeHtml(name)}" style="--image:url('${item.image}');--fallback:${item.color}"><span class="country-emoji">${item.emoji}</span><span><strong>${escapeHtml(name)}</strong><br>${count} 趟旅程</span></button>`; }).join('') || emptyState('還沒有目的地收藏', '建立第一趟旅程後，目的地會出現在這裡。')}</div>
  </section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Up next</p><h2>即將出發</h2></div>${nextCountdown ? `<div class="next-countdown ${nextCountdown.active ? 'active' : ''}"><span>${escapeHtml(nextCountdown.trip.title)}</span><b>${escapeHtml(nextCountdown.text)}</b></div>` : ''}</div><div class="trip-list">${upcoming.length ? upcoming.map(tripCard).join('') : emptyState('還沒有即將出發的旅程', '新增日期與目的地，開始慢慢期待。')}</div></section>
  <section class="section" id="memories"><div class="section-head"><div><p class="eyebrow">Memories</p><h2>旅行回憶</h2></div></div><div class="trip-list">${past.length ? past.map(tripCard).join('') : emptyState('回憶正在累積', '完成的旅程會收藏在這裡。', false)}</div></section>
  <section class="section" id="notes"><div class="section-head"><div><p class="eyebrow">Travel notes</p><h2>旅行筆記</h2></div><p class="section-copy notes-copy">把每次出發都會用到的提醒，整理成自己的旅行清單。</p></div><div class="note-grid">${notesMarkup(data.notes)}</div></section>`;
}

function countryNotes(country) { const notes = data.countryNotes[country]; return Array.isArray(notes) && notes.length ? notes : defaultNotes; }
function renderCountry(country, city = '') {
  const destination = countryOf(country); const countryTrips = data.trips.filter(trip => trip.country === country); const visitedCities = [...new Set(countryTrips.flatMap(trip => trip.cities))]; const trips = countryTrips.filter(trip => !city || trip.cities.includes(city));
  app.innerHTML = `${pageBack()}<section class="page-intro"><p class="eyebrow">Destination archive</p><h1>${destination.emoji} ${escapeHtml(country)}</h1><p class="section-copy">${countryTrips.length} 趟旅程，造訪過 ${visitedCities.length} 個城市。</p><div class="cover-strip" role="img" aria-label="${escapeHtml(country)}旅行風景" style="--cover:url('${destination.image}');--fallback:${destination.color}"></div></section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">My history</p><h2>我的 ${escapeHtml(country)} 旅程</h2></div><button class="button button-primary" data-action="new" data-country="${escapeHtml(country)}">新增旅程</button></div><div class="filters"><button class="filter ${city ? '' : 'active'}" data-city="" data-country="${escapeHtml(country)}">全部</button>${visitedCities.map(name => `<button class="filter ${city === name ? 'active' : ''}" data-city="${escapeHtml(name)}" data-country="${escapeHtml(country)}">${escapeHtml(name)}</button>`).join('')}</div><div class="trip-list">${trips.length ? trips.map(tripCard).join('') : emptyState(city ? `還沒有 ${city} 的紀錄` : `還沒有 ${country} 的旅程`, '新增一趟旅程，建立你的目的地收藏。')}</div></section>
  <section class="section country-notes"><div class="section-head"><div><p class="eyebrow">Quick notes</p><h2>出發小筆記</h2></div></div><div class="note-grid">${countryNotes(country).map((note, index) => `<article class="note-card"><div class="topline"><h3>${escapeHtml(note[0])}</h3><button class="icon-button" data-action="edit-country-note" data-country="${escapeHtml(country)}" data-index="${index}" aria-label="編輯${escapeHtml(note[0])}">✎</button></div><p>${escapeHtml(note[1])}</p><button class="text-button" data-action="read-country-note" data-country="${escapeHtml(country)}" data-index="${index}">閱讀更多 →</button></article>`).join('')}</div></section>`;
}

function renderTrip(id) {
  const trip = data.trips.find(item => item.id === id); if (!trip) return renderNotFound();
  const destination = countryOf(trip.country); const gross = trip.expenses.reduce((sum, row) => sum + (Number(row.price) || 0) * (Number(row.quantity) || 1), 0); const personal = trip.expenses.reduce((sum, row) => sum + personalExpense(row), 0);
  const checklistItems = trip.checklist.flatMap(group => group.items); const checked = checklistItems.filter(item => item.checked).length;
  const canQuickCheck = isUpcoming(trip);
  app.innerHTML = `${pageBack()}<section class="trip-hero"><div class="trip-hero-copy"><p class="eyebrow">Trip record</p><div class="record-row"><h1>${escapeHtml(trip.title)}</h1>${isRecordComplete(trip) ? '' : '<span class="record-state">待完成記錄</span>'}</div><p class="route-large">${escapeHtml(routeText(trip))}</p><div class="detail-grid"><div class="detail-date-row"><div><span>旅行日期</span><b>${formatDate(trip.start)}－${formatDate(trip.end)}</b></div><div><span>旅行天數</span><b>${tripDays(trip)}</b></div></div><div><span>出國航班</span><b>${escapeHtml([trip.airline, trip.flight].filter(Boolean).join(' ') || '尚未填寫')}</b></div><div><span>回國航班</span><b>${escapeHtml([trip.sameReturnAirline ? trip.airline : trip.returnAirline, trip.returnFlight].filter(Boolean).join(' ') || '尚未填寫')}</b></div><div><span>同行</span><b>${escapeHtml(trip.companions || `${trip.people || 1} 人`)}</b></div><div><span>預算</span><b>${trip.budget ? `NT$ ${money(trip.budget)}` : '尚未設定'}</b></div><div class="detail-status"><span>狀態</span><b>${escapeHtml(trip.status || '規劃中')}</b></div></div><button class="button button-soft" data-action="edit" data-id="${escapeHtml(trip.id)}" style="margin-top:28px">編輯旅程</button></div><div class="trip-hero-image" role="img" aria-label="${escapeHtml(trip.country)}旅行風景" style="--trip-image:url('${tripImage(trip)}');--fallback:${destination.color}"></div></section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Itinerary</p><h2>每日行程</h2></div><button class="button button-ghost" data-action="edit" data-id="${escapeHtml(trip.id)}" data-tab="itinerary">編輯</button></div>${trip.planDays.length ? `<div class="day-list">${trip.planDays.map(day => `<article class="day-card"><div class="day-date"><span>${escapeHtml(formatDate(day.date, { month: 'short', day: 'numeric', weekday: 'short' }))}</span><b>${day.items.length} 個行程</b></div><div class="day-items">${day.items.map(item => `<div class="timeline-item"><time>${escapeHtml(item.time || '未定')}</time><div><h3>${escapeHtml(item.activity || '未命名行程')}</h3><p class="transport">${escapeHtml(item.transport || '交通未定')}</p>${item.map ? `<a href="${escapeHtml(item.map)}" target="_blank" rel="noopener">開啟地圖 ↗</a>` : ''}</div><p>${escapeHtml(item.note)}</p></div>`).join('')}</div></article>`).join('')}</div>` : emptyState('還沒有安排行程', '可以先記下最期待的一個地方。', false)}</section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Expenses</p><h2>旅行支出</h2></div><button class="button button-ghost" data-action="edit" data-id="${escapeHtml(trip.id)}" data-tab="overview">編輯</button></div>${trip.expenses.length ? `<div class="table-card"><div class="expense-display-head"><span>項目</span><div class="expense-numbers-head"><span>單價／個人實付</span><span>數量</span><span>平分</span></div><span>備註</span></div>${trip.expenses.map(row => `<div class="expense-display-row"><strong>${escapeHtml(row.item)}</strong><div class="expense-numbers"><span>NT$ ${money(row.price)}${Number(row.split) > 1 ? `<small>個人 NT$ ${money(personalExpense(row))}</small>` : ''}</span><span>${escapeHtml(row.quantity)}</span><span>${Number(row.split) > 1 ? `${escapeHtml(row.split)} 人` : '—'}</span></div><span class="expense-note">${escapeHtml(row.note || '—')}</span></div>`).join('')}<div class="total"><span>總支出 <strong>NT$ ${money(gross)}</strong></span>${personal !== gross ? `<span>個人實付 <strong>NT$ ${money(personal)}</strong></span>` : ''}</div></div>` : emptyState('還沒有支出紀錄', '記下機票、住宿與交通，預算會更清楚。', false)}</section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Checklist</p><h2>旅程準備清單</h2></div><button class="button button-ghost" data-action="edit" data-id="${escapeHtml(trip.id)}" data-tab="checklist">編輯</button></div><div class="check-progress"><span style="--progress:${checklistItems.length ? checked / checklistItems.length * 100 : 0}%"></span></div><p class="section-copy">已完成 ${checked}／${checklistItems.length} 項 · ${canQuickCheck ? '可直接勾選更新' : '旅程已結束，請由編輯旅程更新'}</p><div class="checklist-view ${canQuickCheck ? '' : 'locked'}">${trip.checklist.map((group, groupIndex) => `<article><h3>${escapeHtml(group.category)}</h3>${group.items.map((item, itemIndex) => `<label class="read-check"><input type="checkbox" data-quick-check data-trip-id="${escapeHtml(trip.id)}" data-group-index="${groupIndex}" data-item-index="${itemIndex}" ${item.checked ? 'checked' : ''} ${canQuickCheck ? '' : 'disabled'}><span>${escapeHtml(item.name)}</span></label>`).join('')}</article>`).join('')}</div></section>`;
}

function renderSettings(selectedCountry = Object.keys(data.settings.countries)[0], selectedAirport = airportCode(data.settings.originAirports[0])) {
  const country = countryOf(selectedCountry); const airlineCodes = [...new Set([...data.settings.originAirports.map(airportCode), ...Object.keys(data.settings.airlinesByAirport)])].filter(Boolean).sort();
  app.innerHTML = `${pageBack()}<section class="page-intro settings-intro"><p class="eyebrow">Website settings</p><h1>網站設定</h1><p class="section-copy">管理建立旅程時使用的國家、城市、機場、航空公司與準備清單。所有變更只儲存在這個瀏覽器。</p></section>
  <section class="settings-grid">
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
  if (page === 'home' || page === 'knowledge') renderHome(); else if (page === 'country' && rest[0]) renderCountry(rest[0]); else if (page === 'trip' && rest[0]) renderTrip(rest.join('/')); else if (page === 'settings') renderSettings(); else renderNotFound();
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
function ensureInitialDay() { if (!modalContent.querySelector('.day-editor') && tripDateRange().length) dayEditor({ date: tripDateRange()[0], items: [] }); }

function dayEditor(day = { date: '', items: [] }) {
  const selectedDate = day.date || nextUnusedTripDate();
  if (!selectedDate && !tripDateRange().length) { showToast('請先在基本資料設定出發與結束日期'); return; }
  if (!selectedDate) { showToast('旅行日期都已加入行程'); return; }
  const wrapper = document.createElement('section'); wrapper.className = 'day-editor'; wrapper.innerHTML = `<div class="day-editor-head"><label>行程日期<select class="day-input"><option value="${escapeHtml(selectedDate)}">${escapeHtml(planDateLabel(selectedDate))}</option></select></label><div><button class="button button-soft" type="button" data-add-time>＋ 新增時間點</button><button class="icon-button" type="button" data-remove-day aria-label="刪除日期">×</button></div></div><div class="time-list"></div>`;
  wrapper.querySelector('[data-add-time]').addEventListener('click', () => timeEditor(wrapper.querySelector('.time-list'))); wrapper.querySelector('[data-remove-day]').addEventListener('click', () => { wrapper.remove(); refreshDayDateOptions(); }); wrapper.querySelector('.day-input').addEventListener('change', refreshDayDateOptions);
  (day.items.length ? day.items : [{}]).forEach((item, index) => timeEditor(wrapper.querySelector('.time-list'), item, Boolean(day.items.length) && index >= 0));
  document.querySelector('#day-entries').append(wrapper); refreshDayDateOptions();
}

function timeEditor(container, item = {}, collapsed = false) {
  const hasNote = Boolean(item.note); const row = document.createElement('div'); row.className = `time-editor ${collapsed ? 'collapsed' : ''}`;
  row.innerHTML = `<div class="time-editor-head"><button class="time-summary" type="button" data-toggle-time aria-expanded="${collapsed ? 'false' : 'true'}"><span>${escapeHtml(item.time || '時間未定')}</span><b>${escapeHtml(item.activity || '未命名行程')}</b><i aria-hidden="true">⌃</i></button><div class="time-tools"><button class="button button-ghost" type="button" data-toggle-note>${hasNote ? '隱藏備註' : '備註 ＋'}</button><button class="icon-button" type="button" data-remove-time aria-label="刪除此時間點">×</button></div></div><div class="time-editor-body" ${collapsed ? 'hidden' : ''}><div class="time-main"><label>時間<input data-field="time" type="time" value="${escapeHtml(item.time || '')}"></label><label>行程<textarea data-field="activity" placeholder="景點、餐廳或活動內容">${escapeHtml(item.activity || '')}</textarea></label><label>交通<textarea data-field="transport" placeholder="步行、路線、班次或轉乘方式">${escapeHtml(item.transport || '')}</textarea></label><label>地圖連結<input data-field="map" type="url" placeholder="https://maps.google.com/..." value="${escapeHtml(item.map || '')}"></label></div><label class="time-note" ${hasNote ? '' : 'hidden'}>備註<textarea data-field="note" placeholder="訂位資訊、提醒或備案">${escapeHtml(item.note || '')}</textarea></label></div>`;
  const updateSummary = () => { row.querySelector('.time-summary span').textContent = row.querySelector('[data-field="time"]').value || '時間未定'; row.querySelector('.time-summary b').textContent = row.querySelector('[data-field="activity"]').value.trim() || '未命名行程'; };
  row.querySelectorAll('[data-field="time"], [data-field="activity"]').forEach(input => input.addEventListener('input', updateSummary));
  row.querySelector('[data-toggle-time]').addEventListener('click', () => { const body = row.querySelector('.time-editor-body'); body.hidden = !body.hidden; row.classList.toggle('collapsed', body.hidden); row.querySelector('[data-toggle-time]').setAttribute('aria-expanded', String(!body.hidden)); });
  row.querySelector('[data-toggle-note]').addEventListener('click', event => { const note = row.querySelector('.time-note'); note.hidden = !note.hidden; event.currentTarget.textContent = note.hidden ? '備註 ＋' : '隱藏備註'; if (!note.hidden) { const body = row.querySelector('.time-editor-body'); body.hidden = false; row.classList.remove('collapsed'); row.querySelector('[data-toggle-time]').setAttribute('aria-expanded', 'true'); note.querySelector('textarea').focus(); } });
  row.querySelector('[data-remove-time]').addEventListener('click', () => row.remove()); container.append(row);
}

function expenseEditor(row = {}) {
  const wrapper = document.createElement('div'); wrapper.className = 'entry expense-entry'; const expanded = Boolean(row.split || row.note);
  const field = (name, label, type = 'text', value = '') => `<label class="expense-${name}"><span>${label}</span><input data-field="${name}" type="${type}" ${type === 'number' ? 'min="0"' : ''} placeholder="${label}" value="${escapeHtml(value)}"></label>`;
  wrapper.innerHTML = `${field('item', '項目', 'text', row.item || '')}${field('price', '單價', 'number', row.price || '')}${field('quantity', '數量', 'number', row.quantity || '1')}<div class="expense-more" ${expanded ? '' : 'hidden'}>${field('split', '幾人平分', 'number', row.split || '')}${field('note', '備註', 'text', row.note || '')}</div><button class="button button-ghost expense-more-toggle" type="button" data-toggle-expense>${expanded ? '收起平分與備註' : '平分與備註 ＋'}</button><button class="icon-button expense-remove" type="button" aria-label="刪除此列">×</button>`;
  wrapper.querySelector('[data-toggle-expense]').addEventListener('click', event => { const more = wrapper.querySelector('.expense-more'); more.hidden = !more.hidden; event.currentTarget.textContent = more.hidden ? '平分與備註 ＋' : '收起平分與備註'; }); wrapper.querySelector('.expense-remove').addEventListener('click', () => wrapper.remove()); document.querySelector('#expense-entries').append(wrapper);
}

function checklistEditor(checklist) {
  const container = document.querySelector('#checklist-entries'); container.innerHTML = '';
  checklist.forEach(group => { const section = document.createElement('section'); section.className = 'check-group-editor'; section.innerHTML = `<div class="check-group-head"><input class="check-category" value="${escapeHtml(group.category)}" aria-label="清單分類"><button class="button button-soft" type="button" data-add-check>＋ 新增項目</button></div><div class="check-items"></div>`; group.items.forEach(item => addCheckItem(section.querySelector('.check-items'), item)); section.querySelector('[data-add-check]').addEventListener('click', () => addCheckItem(section.querySelector('.check-items'))); container.append(section); });
}
function addCheckItem(container, item = { name: '', checked: false }) { const label = document.createElement('label'); label.className = 'check-edit'; label.innerHTML = `<input type="checkbox" ${item.checked ? 'checked' : ''}><input type="text" value="${escapeHtml(item.name)}" placeholder="準備項目" aria-label="準備項目"><button class="icon-button" type="button" aria-label="刪除項目">×</button>`; label.querySelector('button').addEventListener('click', () => label.remove()); container.append(label); }

function switchEditorTab(tab) { modalContent.querySelectorAll('[data-editor-tab]').forEach(button => button.classList.toggle('active', button.dataset.editorTab === tab)); modalContent.querySelectorAll('.editor-panel').forEach(panel => panel.hidden = panel.dataset.panel !== tab); if (tab === 'itinerary') ensureInitialDay(); }
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
  const body = `<form id="trip-form"><div class="editor-tabs" role="tablist"><button type="button" data-editor-tab="overview">基本資料與支出</button><button type="button" data-editor-tab="itinerary">每日行程</button><button type="button" data-editor-tab="checklist">準備清單</button></div><p id="record-completion-notice" class="completion-notice">待完成記錄：可先儲存，之後再補齊出發地、目的地與旅行日期。</p>
  <section class="editor-panel" data-panel="overview"><div class="form-grid">${formField('title', '旅程名稱', trip.title, 'text', 'required placeholder="例如：東京秋日散策"')}<label>國家／地區<input name="country" list="country-list" value="${escapeHtml(trip.country)}" required placeholder="輸入或選擇國家">${datalist('country-list', countries)}</label><label>出發地<input name="origin" list="origin-list" value="${escapeHtml(trip.origin)}" placeholder="輸入機場代碼或名稱">${datalist('origin-list', data.settings.originAirports)}</label><label>目的地<input name="destination" list="destination-list" value="${escapeHtml(trip.destination)}" placeholder="依國家搜尋機場">${datalist('destination-list', country.airports)}</label>${formField('start', '開始日期與時間', trip.start, 'datetime-local')}${formField('end', '結束日期與時間', trip.end, 'datetime-local')}<label>出國航空公司<input name="airline" list="airline-list" value="${escapeHtml(trip.airline)}" placeholder="依出發機場搜尋">${datalist('airline-list', airlines)}</label>${formField('flight', '出國航班編號', trip.flight)}<label class="inline-check full"><input name="sameReturnAirline" type="checkbox" ${trip.sameReturnAirline ? 'checked' : ''}><span>回國航班同出國航空公司</span></label><label class="return-airline-field" ${trip.sameReturnAirline ? 'hidden' : ''}>回國航空公司<input name="returnAirline" list="airline-list" value="${escapeHtml(trip.returnAirline)}" placeholder="輸入或搜尋航空公司"></label>${formField('returnFlight', '回國航班編號', trip.returnFlight)}${formField('people', '人數', trip.people, 'number', 'min="1"')}${formField('companions', '同行旅伴', trip.companions, 'text', 'placeholder="以頓號分隔"')}${formField('budget', '預算（NT$）', trip.budget, 'number', 'min="0"')}${formField('status', '狀態', trip.status, 'text', 'placeholder="例如：規劃中、已確認"')}<div class="full cover-uploader"><span class="field-label">旅程封面圖片</span><input name="coverImage" type="hidden" value="${escapeHtml(trip.coverImage)}"><div class="cover-upload-row"><div class="cover-preview" style="--preview:url('${tripImage(trip)}');--fallback:${country.color}" role="img" aria-label="旅程封面預覽"></div><div><label class="button button-soft upload-button">上載圖片<input id="cover-upload" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><button class="button button-ghost" type="button" data-remove-cover>使用國家圖片</button><p class="helper">圖片會壓縮後保存在這個瀏覽器，建議小於 10MB。</p></div></div></div><div class="full"><span class="field-label">城市（可複選）</span><div class="city-add"><input id="custom-city-input" type="text" placeholder="輸入城市後按 Enter"><button class="button button-soft" type="button" data-add-city>＋ 新增城市</button></div><div class="city-chips" id="city-chips"></div></div></div><section class="subform"><div class="subform-head"><h3>旅行支出</h3><button class="button button-soft" type="button" data-add-expense>＋ 新增一列</button></div><div class="expense-labels"><span>項目</span><span>單價</span><span>數量</span><span>進階欄位</span></div><div id="expense-entries"></div></section></section>
  <section class="editor-panel" data-panel="itinerary" hidden><div class="panel-intro"><div><h3>每日行程</h3><p>先建立日期，再為同一天加入多個時間點。</p></div><button class="button button-soft" type="button" data-add-day>＋ 新增日期</button></div><div id="day-entries"></div></section>
  <section class="editor-panel" data-panel="checklist" hidden><div class="panel-intro"><div><h3>旅程準備清單</h3><p>勾選已完成項目，也可以為這趟旅程新增專屬物品。</p></div></div><div id="checklist-entries"></div></section></form>`;
  const footer = `<div class="modal-foot">${existing ? '<button class="button button-danger" type="button" data-delete>刪除旅程</button>' : ''}<div class="modal-foot-right"><button class="button button-ghost" type="button" data-cancel>取消</button><button class="button button-primary" type="submit" form="trip-form">儲存旅程</button></div></div>`;
  modalFrame(existing ? '編輯旅程' : '新增旅程', body, footer, true);
  renderCityChips(trip.country, trip.cities); trip.expenses.forEach(expenseEditor); trip.planDays.forEach(dayEditor); checklistEditor(trip.checklist);
  modalContent.querySelectorAll('[data-editor-tab]').forEach(button => button.addEventListener('click', () => switchEditorTab(button.dataset.editorTab)));
  modalContent.querySelector('[data-add-expense]').addEventListener('click', () => expenseEditor()); modalContent.querySelector('[data-add-day]').addEventListener('click', () => dayEditor()); modalContent.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
  modalContent.querySelector('[name="country"]').addEventListener('input', event => {
    if (!data.settings.countries[event.target.value]) return;
    const selected = countryOf(event.target.value); replaceDatalist('destination-list', selected.airports); renderCityChips(event.target.value, []); modalContent.querySelector('[name="destination"]').value = '';
  });
  modalContent.querySelector('[name="origin"]').addEventListener('input', event => replaceDatalist('airline-list', data.settings.airlinesByAirport[airportCode(event.target.value)] || []));
  modalContent.querySelectorAll('[name="start"], [name="end"]').forEach(input => input.addEventListener('change', refreshDayDateOptions));
  modalContent.querySelector('[name="sameReturnAirline"]').addEventListener('change', event => { modalContent.querySelector('.return-airline-field').hidden = event.target.checked; });
  modalContent.querySelector('#custom-city-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addCustomCity(); } }); modalContent.querySelector('[data-add-city]').addEventListener('click', addCustomCity);
  modalContent.querySelector('#cover-upload').addEventListener('change', async event => { try { const result = await compressCoverImage(event.target.files[0]); modalContent.querySelector('[name="coverImage"]').value = result; modalContent.querySelector('.cover-preview').style.setProperty('--preview', `url('${result}')`); showToast('封面圖片已上載'); } catch (error) { alert(error.message); } finally { event.target.value = ''; } });
  modalContent.querySelector('[data-remove-cover]').addEventListener('click', () => { modalContent.querySelector('[name="coverImage"]').value = ''; const fallback = countryOf(modalContent.querySelector('[name="country"]').value); modalContent.querySelector('.cover-preview').style.setProperty('--preview', `url('${fallback.image}')`); });
  modalContent.querySelector('#trip-form').addEventListener('input', () => updateEditorCompletion(modalContent.querySelector('#trip-form')));
  if (existing) modalContent.querySelector('[data-delete]').addEventListener('click', () => deleteTrip(existing));
  modalContent.querySelector('#trip-form').addEventListener('submit', event => saveTrip(event, trip.id, Boolean(existing)));
  switchEditorTab(initialTab); updateEditorCompletion(modalContent.querySelector('#trip-form')); requestAnimationFrame(() => modalContent.querySelector('[name="title"]').focus());
}

function replaceDatalist(id, options) { const list = modalContent.querySelector(`#${id}`); if (list) list.innerHTML = options.map(option => `<option value="${escapeHtml(option)}"></option>`).join(''); }
function renderCityChips(country, selected) { const container = modalContent.querySelector('#city-chips'); if (!container) return; container.innerHTML = countryOf(country).cities.map(city => `<label class="city-chip"><input type="checkbox" value="${escapeHtml(city)}" ${selected.includes(city) ? 'checked' : ''}><span>${escapeHtml(city)}</span></label>`).join('') || '<p class="helper">這個國家尚未設定城市，可先儲存旅程，再到網站設定新增。</p>'; }

function gatherPlanDays() { return [...modalContent.querySelectorAll('.day-editor')].map(day => ({ date: day.querySelector('.day-input').value, items: [...day.querySelectorAll('.time-editor')].map(row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value.trim()]))).filter(item => Object.values(item).some(Boolean)) })).filter(day => day.date || day.items.length); }
function gatherExpenses() { return [...modalContent.querySelectorAll('.expense-entry')].map(row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value.trim()]))).filter(row => Object.values(row).some(Boolean)); }
function gatherChecklist() { return [...modalContent.querySelectorAll('.check-group-editor')].map(group => ({ category: group.querySelector('.check-category').value.trim() || '其他', items: [...group.querySelectorAll('.check-edit')].map(row => ({ checked: row.querySelector('[type="checkbox"]').checked, name: row.querySelector('[type="text"]').value.trim() })).filter(item => item.name) })).filter(group => group.items.length); }

function saveTrip(event, id, replacing) {
  event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
  if (values.start && values.end && new Date(values.end) < new Date(values.start)) { const end = form.querySelector('[name="end"]'); end.setCustomValidity('結束時間需晚於開始時間'); end.reportValidity(); switchEditorTab('overview'); return; }
  if (!data.settings.countries[values.country]) { data.settings.countries[values.country] = { emoji: '🌍', color: '#4f665b', image: '', cities: [], airports: [] }; }
  const trip = normalizeTrip({ ...values, id, sameReturnAirline: form.elements.sameReturnAirline.checked, returnAirline: form.elements.sameReturnAirline.checked ? values.airline : values.returnAirline, cities: [...form.querySelectorAll('#city-chips input:checked')].map(input => input.value), planDays: gatherPlanDays(), expenses: gatherExpenses(), checklist: gatherChecklist() }, data.settings);
  if (replacing) data.trips = data.trips.map(item => item.id === id ? trip : item); else data.trips.push(trip);
  if (!saveData()) return; modal.close(); showToast('旅程已儲存'); location.hash = `trip/${encodeURIComponent(trip.id)}`; route();
}

function deleteTrip(trip) { modalFrame('刪除旅程', `<p>確定要刪除「<strong>${escapeHtml(trip.title)}</strong>」嗎？</p><p class="section-copy">這趟旅程的行程、支出與清單也會一併移除，而且無法復原。</p>`, '<div class="modal-foot"><div class="modal-foot-right"><button class="button button-ghost" data-keep>保留旅程</button><button class="button button-danger" data-confirm-delete>確定刪除</button></div></div>'); modalContent.querySelector('[data-keep]').addEventListener('click', () => modal.close()); modalContent.querySelector('[data-confirm-delete]').addEventListener('click', () => { data.trips = data.trips.filter(item => item.id !== trip.id); saveData(); modal.close(); showToast('旅程已刪除'); location.hash = 'home'; route(); }); }

function openNote(country, index, editing = false) {
  const notes = country ? countryNotes(country) : data.notes; const note = notes[index]; if (!note) return;
  if (!editing) { modalFrame(note[0], `<p>${escapeHtml(note[1])}</p><p>${escapeHtml(note[2])}</p>`, '<div class="modal-foot"><div class="modal-foot-right"><button class="button button-primary" data-done>知道了</button></div></div>'); modalContent.querySelector('[data-done]').addEventListener('click', () => modal.close()); return; }
  modalFrame('編輯筆記', `<form id="note-form" class="form-grid">${formField('title', '標題', note[0], 'text', 'required')}<label class="full">摘要<textarea name="summary" required>${escapeHtml(note[1])}</textarea></label><label class="full">詳細內容<textarea name="detail">${escapeHtml(note[2])}</textarea></label></form>`, '<div class="modal-foot"><div class="modal-foot-right"><button class="button button-ghost" data-cancel>取消</button><button class="button button-primary" type="submit" form="note-form">儲存筆記</button></div></div>');
  modalContent.querySelector('[data-cancel]').addEventListener('click', () => modal.close()); modalContent.querySelector('#note-form').addEventListener('submit', event => { event.preventDefault(); const values = new FormData(event.currentTarget); const updated = [values.get('title'), values.get('summary'), values.get('detail')]; if (country) { const list = countryNotes(country).map(item => [...item]); list[index] = updated; data.countryNotes[country] = list; } else data.notes[index] = updated; saveData(); modal.close(); showToast('筆記已儲存'); route(); });
}

function addCountry() { const name = prompt('新國家的名稱'); if (!name?.trim()) return; const clean = name.trim(); if (!data.settings.countries[clean]) data.settings.countries[clean] = { emoji: '🌍', color: '#4f665b', image: '', cities: [], airports: [] }; saveData(); renderSettings(clean); showToast(`${clean} 已加入國家選單`); }

function bindSettingsSubmit(form) {
  if (form.id === 'country-settings') { const values = Object.fromEntries(new FormData(form)); const original = values.original; const name = values.name.trim(); if (!name) return; const current = countryOf(original); const updated = { ...current, emoji: values.emoji || '🌍', image: values.image, color: values.color || '#4f665b', cities: lines(values.cities), airports: lines(values.airports) }; if (name !== original) delete data.settings.countries[original]; data.settings.countries[name] = updated; data.trips.forEach(trip => { if (trip.country === original) trip.country = name; }); saveData(); renderSettings(name); showToast('國家設定已儲存'); }
  if (form.id === 'origin-settings') { data.settings.originAirports = lines(new FormData(form).get('origins')); saveData(); renderSettings(); showToast('出發機場已儲存'); }
  if (form.id === 'airline-settings') { const code = document.querySelector('#airline-airport').value; data.settings.airlinesByAirport[code] = lines(new FormData(form).get('airlines')); saveData(); renderSettings(undefined, code); showToast('航空公司已儲存'); }
  if (form.id === 'template-settings') { data.settings.checklistTemplates = [...form.querySelectorAll('.template-row')].map(row => ({ category: row.querySelector('.template-category').value.trim() || '其他', items: lines(row.querySelector('.template-items').value) })).filter(group => group.items.length); saveData(); renderSettings(); showToast('準備清單範本已儲存'); }
  if (form.id === 'home-notes-settings') { data.notes = [...form.querySelectorAll('.note-settings-row')].map(row => [row.querySelector('.note-setting-title').value.trim(), row.querySelector('.note-setting-summary').value.trim(), row.querySelector('.note-setting-detail').value.trim()]); saveData(); renderSettings(); showToast('首頁旅行筆記已儲存'); }
}

function backupData() { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `旅跡備份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); showToast('備份檔已下載'); }
async function importData() { const file = fileInput.files[0]; if (!file) return; try { const imported = normalizeData(JSON.parse(await file.text())); if (!confirm(`將匯入 ${imported.trips.length} 趟旅程並取代目前資料，確定繼續嗎？`)) return; data = imported; saveData(); route(); showToast('資料匯入完成'); } catch (error) { alert(`無法匯入檔案：${error.message}`); } finally { fileInput.value = ''; } }

app.addEventListener('submit', event => { if (event.target.closest('.settings-grid')) { event.preventDefault(); bindSettingsSubmit(event.target); } });
app.addEventListener('change', event => {
  if (event.target.id === 'settings-country') renderSettings(event.target.value);
  if (event.target.id === 'airline-airport') renderSettings(undefined, event.target.value);
  if (event.target.matches('[data-quick-check]')) {
    const trip = data.trips.find(item => item.id === event.target.dataset.tripId);
    if (!trip || !isUpcoming(trip)) { renderTrip(event.target.dataset.tripId); return; }
    const item = trip.checklist[Number(event.target.dataset.groupIndex)]?.items[Number(event.target.dataset.itemIndex)];
    if (!item) return;
    item.checked = event.target.checked; saveData(); renderTrip(trip.id); showToast(event.target.checked ? '已標記為完成' : '已取消完成');
  }
});
app.addEventListener('click', event => {
  const target = event.target.closest('button, a'); if (!target) return; const { action, id, country, index, city, tab } = target.dataset;
  if (action === 'back') { if (history.length > 1) history.back(); else location.hash = 'home'; return; }
  if (action === 'new') openTripEditor('', country || ''); if (action === 'edit') openTripEditor(id, '', tab || 'overview');
  if (target.matches('[data-country]:not([data-action]):not([data-city])')) location.hash = `country/${encodeURIComponent(country)}`; if (target.matches('[data-city]')) renderCountry(country, city);
  if (action === 'read-home-note') openNote('', Number(index)); if (action === 'edit-home-note') openNote('', Number(index), true); if (action === 'read-country-note') openNote(country, Number(index)); if (action === 'edit-country-note') openNote(country, Number(index), true);
  if (target.dataset.carousel) { const carousel = document.querySelector('#country-carousel'); carousel?.scrollBy({ left: (target.dataset.carousel === 'next' ? 1 : -1) * carousel.clientWidth * .82, behavior: 'smooth' }); }
  if (target.dataset.statsScope) { homeStatsScope = target.dataset.statsScope; renderHome(); }
  if (action === 'add-country') addCountry();
  if (action === 'add-template') { document.querySelector('#template-list').insertAdjacentHTML('beforeend', templateEditor()); }
  if (target.matches('[data-remove-template]')) target.closest('.template-row').remove();
});

document.querySelector('#new-trip').addEventListener('click', () => openTripEditor()); document.querySelector('#backup').addEventListener('click', backupData); document.querySelector('#import').addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', importData);
modal.addEventListener('cancel', event => event.preventDefault()); window.addEventListener('hashchange', route); route();
