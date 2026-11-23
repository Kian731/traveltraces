const ACCOUNT_SESSION_KEY = 'travelAccountSession';
const accountButton = document.querySelector('#account-sync');
const accountDialog = document.querySelector('#account-dialog');
let accountSession = readAccountSession();
let accountState, accountDb, accountConflict, accountTimer, googleLoader;
let accountWrites = Promise.resolve();
let accountBusy = false;
let accountReady = false;
let accountExpired = false;
let accountStatus = '';
let accountEditEpoch = 0;

function readAccountSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ACCOUNT_SESSION_KEY));
    if (/^[a-f0-9]{64}$/.test(saved?.accountId) && /^[a-f0-9]{64}$/.test(saved?.token)) return saved;
  } catch { /* Guest mode is available when session storage is disabled. */ }
  return null;
}

function openAccountDb() {
  accountDb ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('travelPrivateArchives', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('archives');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return accountDb;
}

async function accountCache(next, previous) {
  const db = await openAccountDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('archives', next ? 'readwrite' : 'readonly');
    const store = transaction.objectStore('archives');
    const request = store.get(accountSession.accountId);
    let conflict = false;
    request.onsuccess = () => {
      if (!next) return;
      if ((request.result?.generation || 0) !== previous.generation) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.put(next, accountSession.accountId);
    };
    transaction.oncomplete = () => resolve(next || request.result);
    transaction.onabort = () => reject(conflict
      ? new Error('此帳號在其他分頁已更新。請先備份目前的修改，再重新載入。')
      : transaction.error || new Error('無法儲存此裝置的同步資料'));
  });
}

function changeAccountState(update) {
  const operation = accountWrites.then(async () => {
    const changes = update(accountState);
    if (!changes) return false;
    const next = { ...accountState, ...changes, generation: accountState.generation + 1 };
    accountState = await accountCache(next, accountState);
    return true;
  });
  accountWrites = operation.catch(() => {});
  return operation;
}

async function accountFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  if (accountSession) headers.set('Authorization', 'Bearer ' + accountSession.token);
  let response;
  try {
    response = await fetch(SHARE_API_URL + '/account/' + path, {
      ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('無法連線，請確認網路後再同步');
  }
  if (response.ok) return response;
  const problem = await response.json().catch(() => ({}));
  const error = new Error(problem.error || (response.status === 404 ? '帳號同步尚未啟用' : '同步服務暫時無法使用'));
  error.status = response.status;
  throw error;
}

function setAccountStatus(message) {
  accountStatus = message;
  accountButton.textContent = accountConflict ? '有同步衝突' : accountSession ? '雲端同步' : '登入同步';
  accountButton.title = message;
  const label = accountDialog.querySelector('[data-account-status]');
  if (label) label.textContent = message;
}

async function saveAccountData() {
  if (!accountState) return false;
  accountEditEpoch++;
  const snapshot = JSON.stringify(data);
  try {
    const changed = await changeAccountState(current => current.snapshot === snapshot ? null : { snapshot, dirty: true });
    if (changed && !accountConflict && !accountExpired) {
      setAccountStatus('已儲存到這台裝置，等待同步');
      queueAccountSync();
    }
    return true;
  } catch (error) {
    setAccountStatus(error.message);
    alert(error.message);
    return false;
  }
}

function queueAccountSync() {
  clearTimeout(accountTimer);
  accountTimer = setTimeout(() => syncAccount(), 850);
}

async function readAccountArchive(version) {
  const response = await accountFetch('archive?version=' + version);
  const latestVersion = Number(response.headers.get('X-Travel-Version'));
  const snapshot = response.status === 204 ? null : await response.text();
  if (snapshot) normalizeData(JSON.parse(snapshot));
  return { version: latestVersion, snapshot };
}

function showAccountData(snapshot) {
  data = snapshot ? normalizeData(JSON.parse(snapshot)) : { ...defaultData(), trips: [] };
  accountReady = true;
  if (location.hash.startsWith('#trip/')) {
    const id = decodeURIComponent(location.hash.slice(6));
    if (!data.trips.some(trip => trip.id === id)) history.replaceState(null, '', '#home');
  }
  if (!document.body.classList.contains('readonly-share') && !document.body.classList.contains('collaborative-share')) {
    const top = window.scrollY;
    route();
    window.scrollTo({ top, behavior: 'instant' });
  }
}

function disableAccountEdits(disabled) {
  for (const id of ['new-trip', 'import', 'backup']) document.getElementById(id).disabled = disabled;
}

async function syncAccount() {
  if (!accountSession || accountBusy || accountConflict || accountExpired || modal.open || confirmDialog.open) return;
  accountBusy = true;
  try {
    await accountWrites;
    if (!accountState) {
      const cached = await accountCache();
      accountState = cached || { generation: 0, version: 0, snapshot: null, dirty: false };
      if (cached) {
        showAccountData(cached.snapshot);
        disableAccountEdits(false);
      }
    }
    setAccountStatus('正在同步…');
    const sent = accountState;
    if (sent.dirty) {
      try {
        const response = await accountFetch('archive', {
          method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Travel-Version': String(sent.version) },
          body: sent.snapshot,
        });
        const { version } = await response.json();
        await changeAccountState(current => ({ version, dirty: current.snapshot !== sent.snapshot }));
      } catch (error) {
        if (error.status !== 409) throw error;
        const cloud = await readAccountArchive(0);
        if (cloud.snapshot === sent.snapshot) {
          // A previous upload may have completed before its response arrived.
          await changeAccountState(current => ({ version: cloud.version, dirty: current.snapshot !== sent.snapshot }));
        } else {
          accountConflict = cloud;
          setAccountStatus('兩台裝置都有修改，請選擇要保留為目前版本的記錄');
          if (accountDialog.open) renderAccountDialog();
          return;
        }
      }
    } else {
      const cloud = await readAccountArchive(sent.version);
      const editing = modal.open || confirmDialog.open || (location.hash === '#settings' && !accountDialog.open);
      if (cloud.snapshot && !editing) {
        const editEpoch = accountEditEpoch;
        app.inert = true;
        disableAccountEdits(true);
        try {
          const applied = await changeAccountState(current => !current.dirty
            ? { version: cloud.version, snapshot: cloud.snapshot } : null);
          if (applied && editEpoch === accountEditEpoch) showAccountData(accountState.snapshot);
          else if (applied) await changeAccountState(() => ({ version: sent.version, dirty: true, snapshot: JSON.stringify(data) }));
        } finally {
          app.inert = false;
          if (accountReady) disableAccountEdits(false);
        }
      }
      if (!accountReady && !cloud.version) {
        showAccountData(null);
        disableAccountEdits(false);
      }
      if (cloud.snapshot && editing) {
        setAccountStatus('有較新的雲端記錄，請關閉編輯視窗後同步');
        return;
      }
    }
    setAccountStatus(accountState.dirty ? '已儲存到這台裝置，等待同步' : '雲端資料已同步');
    if (accountState.dirty) queueAccountSync();
    if (accountDialog.open) renderAccountDialog();
  } catch (error) {
    if (error.status === 401) accountExpired = true;
    setAccountStatus(error.message);
    const loading = app.querySelector('[data-account-loading]');
    if (loading) loading.textContent = '目前無法載入雲端記錄。請開啟「雲端同步」重試，或登出回到本機記錄。';
    if (accountDialog.open) renderAccountDialog();
  } finally {
    accountBusy = false;
  }
}

function appendNotes(first, second) {
  const known = new Set(first.map(item => JSON.stringify(item)));
  return [...first, ...second.filter(item => !known.has(JSON.stringify(item)))];
}

function localTripsForMigration(local) {
  const sample = JSON.stringify(defaultData().trips[0]);
  return local.trips.filter(trip => JSON.stringify(trip) !== sample);
}

async function migrateGuestData() {
  if (!accountState || accountBusy || accountState.migrated || accountConflict || accountExpired) return;
  const guest = loadData();
  const guestTrips = localTripsForMigration(guest);
  const firstArchive = !accountState.snapshot;
  if (!confirm('將這台裝置的 ' + guestTrips.length + ' 趟旅程與筆記加入雲端帳號。相同旅程若有不同版本，會保留為兩份。確定繼續嗎？')) return;
  const merged = firstArchive ? { ...guest, trips: guestTrips } : clone(data);
  const idMap = new Map();
  if (!firstArchive) {
    merged.settings.countries = { ...guest.settings.countries, ...merged.settings.countries };
    merged.notes = appendNotes(merged.notes, guest.notes);
    for (const [country, notes] of Object.entries(guest.countryNotes)) {
      if (Array.isArray(notes)) merged.countryNotes[country] = appendNotes(merged.countryNotes[country] || [], notes);
    }
  }
  for (const trip of guestTrips) {
    const existing = firstArchive ? null : merged.trips.find(item => item.id === trip.id);
    const copy = existing && JSON.stringify(existing) !== JSON.stringify(trip)
      ? { ...trip, id: crypto.randomUUID(), title: trip.title + '（此裝置副本）' } : trip;
    idMap.set(trip.id, copy.id);
    if (!firstArchive && (!existing || copy !== trip)) merged.trips.push(copy);
  }
  accountBusy = true;
  try {
    await changeAccountState(() => ({ snapshot: JSON.stringify(merged), dirty: true, migrated: true }));
  } catch (error) { setAccountStatus(error.message); return; }
  finally { accountBusy = false; }
  const guestShares = loadShareRecords(SHARE_RECORDS_STORAGE);
  const accountShares = loadShareRecords();
  const existingShares = new Set(accountShares.map(record => record.id));
  try {
    saveShareRecords([...accountShares, ...guestShares.filter(record => idMap.has(record.tripId) && !existingShares.has(record.id))
      .map(record => ({ ...record, tripId: idMap.get(record.tripId) }))]);
  } catch { showToast('旅程已加入。這台裝置儲存空間不足，無法複製原有分享設定。'); }
  showAccountData(accountState.snapshot);
  setAccountStatus('已加入此裝置的旅程，等待同步');
  renderAccountDialog();
  queueAccountSync();
}

function downloadAccountCopy(snapshot) {
  const href = URL.createObjectURL(new Blob([snapshot], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = '旅跡-同步衝突備份.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

async function resolveAccountConflict(keepLocal) {
  if (accountBusy || !accountConflict) return;
  const cloud = accountConflict;
  accountBusy = true;
  try {
    await changeAccountState(current => ({
      version: cloud.version, dirty: keepLocal,
      snapshot: keepLocal ? current.snapshot : cloud.snapshot,
      recovery: keepLocal ? cloud.snapshot : current.snapshot,
    }));
    accountConflict = null;
    showAccountData(accountState.snapshot);
    setAccountStatus(keepLocal ? '已保留另一份版本的備份，等待同步' : '已載入雲端版本，並保留此裝置的備份');
    renderAccountDialog();
    queueAccountSync();
  } catch (error) { setAccountStatus(error.message); }
  finally { accountBusy = false; }
}

function renderAccountDialog() {
  const body = accountDialog.querySelector('.modal-body');
  if (!accountSession || accountExpired) {
    body.innerHTML = '<p class="helper">登入後可在手機和電腦使用同一份旅遊記錄。你也可以繼續在這台裝置記錄。</p><p role="status" data-account-status></p><div data-google-button></div>';
    if (accountExpired) body.insertAdjacentHTML('beforeend', '<p><button class="button button-ghost" type="button" data-account-action="logout">回到本機記錄</button></p>');
    setAccountStatus(accountStatus);
    prepareGoogleButton(body.querySelector('[data-google-button]'));
    return;
  }
  body.innerHTML = '<p data-account-email></p><p role="status" data-account-status></p><div class="account-actions"></div>';
  body.querySelector('[data-account-email]').textContent = accountSession.email || 'Google 帳號';
  const actions = body.querySelector('.account-actions');
  if (accountConflict) {
    actions.innerHTML = '<button class="button button-soft" type="button" data-account-action="local">保留此裝置的版本</button><button class="button button-soft" type="button" data-account-action="cloud">使用雲端版本</button><p class="helper">另一份版本會留在這台裝置，可下載為備份。</p>';
  } else {
    actions.innerHTML = '<button class="button button-soft" type="button" data-account-action="sync">立即同步</button>';
    if (accountState && !accountState.migrated && !document.getElementById('new-trip').disabled) {
      actions.insertAdjacentHTML('beforeend', '<button class="button button-soft" type="button" data-account-action="migrate">帶入此裝置的記錄</button>');
    }
  }
  if (accountState?.recovery) actions.insertAdjacentHTML('beforeend', '<button class="button button-ghost" type="button" data-account-action="backup">下載衝突備份</button>');
  actions.insertAdjacentHTML('beforeend', '<button class="button button-ghost" type="button" data-account-action="logout">登出</button>');
  setAccountStatus(accountStatus);
}

function loadGoogleSignIn() {
  googleLoader ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      googleLoader = null;
      script.remove();
      reject(new Error('暫時無法載入 Google 登入'));
    };
    document.head.append(script);
  });
  return googleLoader;
}

async function prepareGoogleButton(container) {
  try {
    if (location.protocol === 'file:') throw new Error('請在旅跡的正式網站開啟登入同步');
    const response = await accountFetch('config');
    const { clientId } = await response.json();
    await loadGoogleSignIn();
    if (!accountDialog.open || !container.isConnected) return;
    const nonce = crypto.randomUUID();
    google.accounts.id.initialize({
      client_id: clientId, nonce, auto_select: false, use_fedcm_for_button: true,
      callback: async ({ credential }) => {
        if (!accountDialog.open || !container.isConnected || !credential) return;
        try {
          setAccountStatus('正在驗證 Google 帳號…');
          const result = await accountFetch('login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential, nonce }),
          });
          sessionStorage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify(await result.json()));
          history.replaceState(null, '', '#home');
          location.reload();
        } catch (error) {
          setAccountStatus(error.message);
          if (accountDialog.open) prepareGoogleButton(container);
        }
      },
    });
    container.replaceChildren();
    google.accounts.id.renderButton(container, { type: 'standard', theme: 'outline', size: 'large', locale: 'zh_TW' });
  } catch (error) { if (accountDialog.open && container.isConnected) setAccountStatus(error.message); }
}

async function signOutAccount() {
  if (accountBusy) { setAccountStatus('請等這次同步完成後再登出'); return; }
  await accountWrites;
  if ((accountState?.dirty || accountConflict) && !confirm('仍有尚未同步的修改。登出後可在這台裝置重新登入同一帳號繼續同步。確定登出嗎？')) return;
  accountBusy = true;
  try { await accountFetch('session', { method: 'DELETE', keepalive: true }); }
  catch { /* A local sign-out remains available while offline. */ }
  sessionStorage.removeItem(ACCOUNT_SESSION_KEY);
  history.replaceState(null, '', '#home');
  location.reload();
}

function startAccountSync() {
  accountButton.addEventListener('click', () => {
    accountDialog.showModal();
    renderAccountDialog();
  });
  accountDialog.querySelector('[data-account-close]').addEventListener('click', () => accountDialog.close());
  accountDialog.addEventListener('click', event => {
    const action = event.target.closest('[data-account-action]')?.dataset.accountAction;
    if (action === 'sync') syncAccount();
    if (action === 'migrate') migrateGuestData();
    if (action === 'logout') signOutAccount();
    if (action === 'local' || action === 'cloud') resolveAccountConflict(action === 'local');
    if (action === 'backup') downloadAccountCopy(accountState.recovery);
  });
  if (!accountSession) return route();
  disableAccountEdits(true);
  app.innerHTML = '<section class="page-intro"><p role="status" data-account-loading>正在載入雲端記錄…</p></section>';
  if (location.hash.startsWith('#offline-maps')) route();
  setAccountStatus('正在載入雲端記錄…');
  syncAccount();
  let lastCheck = 0;
  function checkWhenVisible() {
    if (document.hidden || Date.now() - lastCheck < 10000) return;
    lastCheck = Date.now();
    syncAccount();
  }
  document.addEventListener('visibilitychange', checkWhenVisible);
  window.addEventListener('online', checkWhenVisible);
  window.addEventListener('hashchange', checkWhenVisible);
  modal.addEventListener('close', () => { if (accountState?.dirty) queueAccountSync(); });
  setInterval(checkWhenVisible, 60000);
}
