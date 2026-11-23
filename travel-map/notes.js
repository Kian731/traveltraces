const NOTE_PHOTO_COUNT = 4;
const NOTE_PHOTO_SIZE = 160000;
const NOTE_PHOTO_SOURCE_LIMIT = 20 * 1024 * 1024;

function validNotePhotos(value) {
  return Array.isArray(value) ? value.filter(src => typeof src === 'string' && src.length <= NOTE_PHOTO_SIZE &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(src)).slice(0, NOTE_PHOTO_COUNT) : [];
}

async function compressNotePhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('請貼上或選取圖片');
  if (file.size > NOTE_PHOTO_SOURCE_LIMIT) throw new Error('原始照片超過 20 MB，請先縮小再貼上');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error('瀏覽器無法讀取這張照片，可改用 JPG、PNG 或 WebP'); });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    for (const side of [1200, 960, 720, 540, 400]) {
      const scale = Math.min(1, side / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const photo = canvas.toDataURL('image/jpeg', .72);
      if (photo.length <= NOTE_PHOTO_SIZE) return photo;
    }
    throw new Error('照片壓縮後仍然太大，請選較小的照片');
  } finally { URL.revokeObjectURL(url); }
}

function bindNotePhotos(row, initial = []) {
  row.notePhotos = validNotePhotos(initial);
  const area = row.querySelector('.time-note');
  const note = area.querySelector('textarea');
  const toolbar = document.createElement('div');
  toolbar.className = 'note-photo-toolbar';
  toolbar.innerHTML = '<button class="button button-soft" type="button" data-paste-photo hidden>貼上照片</button><label class="button button-soft note-photo-picker">選取照片<input type="file" accept="image/*" multiple></label><span>也可將圖片直接貼進備註</span><div class="note-photo-grid"></div><p class="helper" role="status"></p>';
  area.after(toolbar);
  const grid = toolbar.querySelector('.note-photo-grid');
  const status = toolbar.querySelector('[role="status"]');
  const input = toolbar.querySelector('input');
  const pasteButton = toolbar.querySelector('[data-paste-photo]');
  pasteButton.hidden = !navigator.clipboard?.read;
  function render(message = '') {
    toolbar.hidden = area.hidden;
    grid.replaceChildren();
    row.notePhotos.forEach((photo, index) => {
      const tile = document.createElement('div');
      const img = document.createElement('img');
      img.src = photo;
      img.alt = '備註照片 ' + (index + 1);
      const remove = document.createElement('button');
      remove.className = 'icon-button';
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', '刪除備註照片 ' + (index + 1));
      remove.addEventListener('click', () => { row.notePhotos.splice(index, 1); render(); });
      tile.append(img, remove);
      grid.append(tile);
    });
    const kb = Math.ceil(row.notePhotos.reduce((sum, photo) => sum + photo.length, 0) / 1024);
    status.textContent = message || row.notePhotos.length + '／' + NOTE_PHOTO_COUNT + ' 張・已占約 ' + kb + ' KB。照片會壓縮後儲存。';
  }
  let pending = Promise.resolve();
  function addFiles(files) {
    pending = pending.then(async () => {
      const available = NOTE_PHOTO_COUNT - row.notePhotos.length;
      if (!available) return render('這則備註已達 ' + NOTE_PHOTO_COUNT + ' 張上限，可先刪除一張');
      let message = files.length > available ? '已達照片張數上限，部分照片未加入。' : '';
      for (const file of files.slice(0, available)) {
        try {
          row.notePhotos.push(await compressNotePhoto(file));
          row.planItemId ||= crypto.randomUUID();
        } catch (error) { message = error.message; }
      }
      render(message);
    });
    row.photoWork = pending;
  }
  note.addEventListener('paste', event => {
    const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
    if (!files.length) {
      for (const item of event.clipboardData?.items || []) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    if (!files.length) return;
    event.preventDefault();
    addFiles(files);
  });
  input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
  pasteButton.addEventListener('click', async () => {
    try {
      const files = [];
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find(mime => mime.startsWith('image/'));
        if (type) files.push(await item.getType(type));
      }
      if (files.length) addFiles(files);
      else render('剪貼簿沒有圖片。請先複製照片，或使用「選取照片」。');
    } catch { render('瀏覽器無法讀取剪貼簿。可直接貼進備註，或使用「選取照片」。'); }
  });
  row.querySelector('[data-toggle-note]').addEventListener('click', () => render());
  render();
}

function notePhotosMarkup(photos) {
  const list = validNotePhotos(photos);
  return list.length ? '<div class="note-photo-grid note-photo-view">' + list.map((src, i) =>
    '<button type="button" data-note-photo aria-label="放大備註照片 ' + (i + 1) + '"><img loading="lazy" alt="備註照片 ' + (i + 1) + '" src="' + src + '"></button>').join('') + '</div>' : '';
}

function openNotePhoto(src) {
  if (!validNotePhotos([src]).length) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'note-photo-lightbox';
  dialog.setAttribute('aria-label', '備註照片');
  const image = document.createElement('img');
  image.alt = '備註照片';
  image.src = src;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'button button-soft';
  close.textContent = '關閉';
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.append(close, image);
  document.body.append(dialog);
  dialog.showModal();
}

function preservePrivatePlanPhotos(trip, previous) {
  const hadPhotos = (previous?.planDays || []).flatMap(day => day.items
    .filter(item => item.photos?.length).map(item => ({ item, date: day.date })));
  const local = new Map(hadPhotos.filter(({ item }) => item.planId).map(({ item }) => [item.planId, item.photos]));
  for (const day of trip.planDays) {
    for (const item of day.items) {
      if (local.has(item.planId)) item.photos = local.get(item.planId);
      else if (!item.planId) {
        const matches = hadPhotos.filter(entry => entry.date === day.date && entry.item.time === item.time && entry.item.activity === item.activity);
        if (matches.length === 1) item.photos = matches[0].item.photos;
      }
    }
  }
}
