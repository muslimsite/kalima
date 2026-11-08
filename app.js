// Калима: тренажёр слов Корана. Без сборки и без сервера.
// Прогресс хранится в Telegram CloudStorage (привязан к аккаунту), копия в localStorage.
'use strict';

const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined ? window.Telegram.WebApp : null;
const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const $where = document.getElementById('where');

const NEW_PER_LESSON = 10;
const MAX_REVIEW = 20;
const INTERVALS = [0, 1, 3, 7, 14, 30, 90]; // дни до повтора для «коробки» 0…6
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);

let D = null;          // words.json
let COV = null;
let SIDX = [];       // hifz/index.json: все 114 сур        // coverage.json
let order = [];        // id слов в порядке обучения
let setOf = {};        // id слова → id набора
let P = {};            // прогресс: id → [коробка, день повтора]
let S = { set: null, pin: [], hi: false, h: {}, hd: {}, rep: 3, qari: 'Husary_Muallim_128kbps', goal: 3, rem: { on: false, time: '07:00' }, theme: 'night', tf: 'saadi' }; // выбранный набор, слова «учить следующими»
let screen = 'home';
let back = null;

/* ---------- утилиты ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = (ru) => String(ru).split(/[,;]/)[0].trim();
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const W = (id) => D.words[id];
const setById = (id) => D.sets.find((s) => s.id === id);
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const haptic = (t) => { try { tg && tg.HapticFeedback && (t === 'ok' || t === 'bad' ? tg.HapticFeedback.notificationOccurred(t === 'ok' ? 'success' : 'error') : tg.HapticFeedback.selectionChanged()); } catch (e) {} };

function highlight(ar, form) {
  const i = form ? ar.indexOf(form) : -1;
  if (i < 0) return esc(ar);
  return esc(ar.slice(0, i)) + '<b>' + esc(form) + '</b>' + esc(ar.slice(i + form.length));
}
function suraName(n) { const x = SIDX.find((r) => r.n === +n); return x ? x.title : suraTitle(+n); }
function suraTitle(n) { const s = D.sets.find((x) => x.sura === n); return s ? s.title : 'Сура ' + n; }
function ref(ex) { return `«${suraTitle(ex.sura)}», ${ex.ayah}`; }

/* ---------- звук ---------- */
// Слова: записи пословного чтения Quran.com. Аяты: чтец на выбор (everyayah.com).
const pad3 = (n) => String(n).padStart(3, '0');
const wordUrl = (path) => 'https://audio.qurancdn.com/' + path;
const locUrl = (s, a, w) => wordUrl(`wbw/${pad3(s)}_${pad3(a)}_${pad3(w)}.mp3`);
const ayahUrl = (s, a, q = S.qari) => `https://everyayah.com/data/${q}/${pad3(s)}${pad3(a)}.mp3`;
// Чтецы (everyayah.com, весь Коран). Учебные чтения с паузами для повторения идут первыми.
const QARI = [
  ['Husary_Muallim_128kbps', 'Махмуд Халиль аль-Хусари', 'Учебное: медленно, с паузой для повторения'],
  ['Minshawy_Teacher_128kbps', 'Мухаммад Сиддик аль-Миншави', 'Учебное, вместе с детьми'],
  ['Husary_128kbps', 'Махмуд Халиль аль-Хусари', 'Обычное чтение'],
  ['Minshawy_Murattal_128kbps', 'Мухаммад Сиддик аль-Миншави', 'Обычное чтение'],
  ['Alafasy_128kbps', 'Мишари Рашид аль-Афаси', 'Обычное чтение'],
  ['Abdul_Basit_Murattal_192kbps', 'Абдуль-Басит Абдус-Самад', 'Обычное чтение'],
  ['Abdurrahmaan_As-Sudais_192kbps', 'Абдуррахман ас-Судейс', 'Имам Запретной мечети'],
  ['Saood_ash-Shuraym_128kbps', 'Сауд аш-Шурейм', 'Имам Запретной мечети'],
  ['MaherAlMuaiqly128kbps', 'Махир аль-Муайкли', 'Имам Запретной мечети'],
  ['Yasser_Ad-Dussary_128kbps', 'Ясир ад-Дусари', 'Имам Запретной мечети'],
  ['Ghamadi_40kbps', 'Саад аль-Гамиди', 'Обычное чтение'],
  ['Abu_Bakr_Ash-Shaatree_128kbps', 'Абу Бакр аш-Шатыри', 'Обычное чтение'],
  ['Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', 'Ахмад аль-Аджми', 'Обычное чтение'],
  ['Nasser_Alqatami_128kbps', 'Насер аль-Катами', 'Обычное чтение'],
];
const qariName = (q = S.qari) => { const x = QARI.find((r) => r[0] === q) || QARI[0]; return x[1] + (x[2].startsWith('Учебное') ? ', учебное' : ''); };

/* ---------- фон ---------- */
const THEMES = [
  ['night', 'Ночь', '#0F1415', '#D39A68', '#EDEBE7'],
  ['emerald', 'Изумруд', '#0D1A15', '#D7A06E', '#ECF1ED'],
  ['sea', 'Море', '#0C1620', '#D39A68', '#E8EDF1'],
  ['day', 'День', '#EEF1EE', '#9E5422', '#18201E'],
];
function applyTheme() {
  const th = THEMES.find((x) => x[0] === S.theme) || THEMES[0];
  if (th[0] === 'night') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th[0];
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = th[2];
  try { tg && tg.setHeaderColor(th[2]); tg && tg.setBackgroundColor(th[2]); } catch (e) {}
}

/* ---------- тафсир ---------- */
// alquran.cloud: ас-Саади (перевод Кулиева), «Аль-Мунтахаб», Абу Адель. Сура грузится целиком один раз:
// у ас-Саади пояснение стоит в конце группы аятов, в [[двойных скобках]].
const TAFSIR = [
  ['saadi', 'Ас-Саади', 'ru.kuliev-alsaadi', 'Тафсир Абдуррахмана ас-Саади, перевод Эльмира Кулиева'],
  ['muntahab', 'Аль-Мунтахаб', 'ru.muntahab', 'Тафсир «Аль-Мунтахаб», университет аль-Азхар'],
  ['abuadel', 'Абу Адель', 'ru.abuadel', 'Перевод смыслов Абу Аделя, пояснения в скобках'],
];
const tfCache = {};
async function tfSura(n) {
  if (!tfCache[n]) tfCache[n] = fetch(`https://api.alquran.cloud/v1/surah/${n}/editions/${TAFSIR.map((x) => x[2]).join(',')}`)
    .then((r) => r.json()).then((j) => { if (j.code !== 200) throw 0; return Object.fromEntries(j.data.map((e) => [e.edition.identifier, e.ayahs.map((a) => a.text)])); })
    .catch((e) => { delete tfCache[n]; throw e; });
  return tfCache[n];
}
const paras = (t) => esc(t).split(/\n+/).filter(Boolean).map((x) => `<p>${x}</p>`).join('');
function tfBody(ed, key, a) {
  const list = ed[TAFSIR.find((x) => x[0] === key)[2]] || [];
  if (key !== 'saadi') {
    const t = list[a - 1] || '';
    const i = t.indexOf('[[');
    return i < 0 ? paras(t) : paras(t.slice(0, i)) + `<p class="note">${esc(t.slice(i + 2).replace(/\]\]\s*$/, ''))}</p>`;
  }
  // ас-Саади: ищем пояснение в этом аяте или в следующих (оно дано к группе аятов)
  let j = a - 1; while (j < list.length && !list[j].includes('[[')) j++;
  if (j >= list.length) return '<p class="muted">К этому аяту отдельного пояснения нет.</p>';
  let k = a - 1; while (k > 0 && !list[k - 1].includes('[[')) k--;
  const t = list[j], c = t.slice(t.indexOf('[[') + 2).replace(/\]\]\s*$/, '');
  return (j > k ? `<p class="note">Пояснение к аятам ${k + 1}–${j + 1}</p>` : '') + paras(c);
}
async function openTafsir(n, a) {
  const key = TAFSIR.some((x) => x[0] === S.tf) ? S.tf : 'saadi';
  const tf = TAFSIR.find((x) => x[0] === key);
  $sheet.hidden = false;
  const frame = (body) => `<div class="sheet-wrap" data-act="close"><div class="sheet long" role="dialog" aria-label="Тафсир">
    <h3>Тафсир: «${esc(suraName(n))}», аят ${a}</h3>
    <div class="tabs" role="group" aria-label="Какой тафсир">${TAFSIR.map((x) => `<button data-act="tf" data-k="${x[0]}" data-n="${n}" data-a="${a}" class="${x[0] === key ? 'on' : ''}">${x[1]}</button>`).join('')}</div>
    <p class="note">${esc(tf[3])}</p>
    <div class="tafsir">${body}</div>
    <button class="btn" data-act="share" data-n="${n}" data-a="${a}">${PIC}Сделать картинку для статуса</button>
    <button class="btn ghost" data-act="close">Закрыть</button>
  </div></div>`;
  $sheet.innerHTML = frame('<p class="muted">Загружаем тафсир…</p>');
  try { const ed = await tfSura(n); if (!$sheet.hidden) $sheet.innerHTML = frame(tfBody(ed, key, a)); }
  catch (e) { if (!$sheet.hidden) $sheet.innerHTML = frame('<p class="muted">Не получилось загрузить тафсир. Проверьте интернет и попробуйте ещё раз.</p>'); }
}
/* ---------- картинка аята для статуса и истории ---------- */
// Рисуем на canvas 1080×1920 в цветах выбранного фона: аят, смысл, отрывок тафсира и подпись бота с QR-кодом.
const BOT = 'Koran_slovo_bot';
const BOT_URL = 'https://t.me/' + BOT;
const hzCache = {};
const hzSura = (n) => hzCache[n] || (hzCache[n] = fetch(`data/hifz/${n}.json?v=12`).then((r) => r.json()).catch((e) => { delete hzCache[n]; throw e; }));
let qrLib = null;
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return qrLib || (qrLib = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    sc.onload = () => res(window.qrcode); sc.onerror = () => { qrLib = null; rej(new Error('qr')); };
    document.head.appendChild(sc);
  }));
}
function tfPlain(ed, key, a) {
  // Текст тафсира без разметки, как в окне тафсира
  const div = document.createElement('div'); div.innerHTML = tfBody(ed, key, a);
  return [...div.querySelectorAll('p')].filter((p) => !/^Пояснение к аятам/.test(p.textContent)).map((p) => p.textContent).join(' ').replace(/\s+/g, ' ').trim();
}
function wrapLines(ctx, text, maxW) {
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
async function drawShare(n, a, withTafsir) {
  const css = getComputedStyle(document.documentElement);
  const v = (k) => css.getPropertyValue(k).trim();
  await Promise.all(['700 64px Amiri', '400 40px Commissioner', '600 40px Commissioner', '800 60px "Sofia Sans Condensed"'].map((f) => document.fonts.load(f).catch(() => {})));
  const [sd, ed, qr] = await Promise.all([hzSura(n), withTafsir ? tfSura(n) : null, loadQr().catch(() => null)]);
  const ay = sd.ayahs.find((x) => x.n === a);
  const W = 1080, H = 1920, PAD = 96, MW = W - PAD * 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = v('--bg'); ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 0, 40, W / 2, 0, H * 0.75);
  g.addColorStop(0, v('--lamp')); g.addColorStop(1, v('--bg'));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const FOOT = 300; // место под подпись бота
  ctx.textAlign = 'center'; ctx.direction = 'ltr';
  ctx.fillStyle = v('--muted'); ctx.font = '600 38px Commissioner';
  ctx.fillText(`«${suraName(n)}», аят ${a}`, W / 2, 190);
  // Аят, смысл и тафсир рисуем на отдельном слое, потом ставим его по центру свободного места
  const main = ctx, layer = document.createElement('canvas'); layer.width = W; layer.height = H;
  const TOP = 260;
  let y = TOP;
  {
  const ctx = layer.getContext('2d');
  ctx.textAlign = 'center';

  // Арабский текст: подбираем размер, чтобы аят занял не больше половины высоты
  const ar = ay.w.join(' ');
  let size = ar.length < 60 ? 112 : ar.length < 160 ? 96 : 84, lines;
  for (; size >= 40; size -= 4) {
    ctx.font = `700 ${size}px Amiri`; ctx.direction = 'rtl';
    lines = wrapLines(ctx, ar, MW);
    if (lines.length * size * 1.9 <= (H - FOOT - 260) * (withTafsir ? 0.5 : 0.62)) break;
  }
  const arH = lines.length * size * 1.9;
  if (y + arH > H - FOOT - 160) return null; // аят слишком длинный для одной картинки
  ctx.fillStyle = v('--ink');
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + size * 1.25 + i * size * 1.9));
  y += arH + 40;

  // Смысл (Кулиев)
  ctx.direction = 'ltr'; ctx.fillStyle = v('--ink');
  let rs = 44, rl;
  for (; rs >= 30; rs -= 2) { ctx.font = `400 ${rs}px Commissioner`; rl = wrapLines(ctx, ay.ru, MW); if (y + rl.length * rs * 1.45 <= H - FOOT - 120) break; }
  if (y + rl.length * rs * 1.45 > H - FOOT - 60) return null; // смысл не помещается
  rl.forEach((l, i) => ctx.fillText(l, W / 2, y + rs + i * rs * 1.45));
  y += rl.length * rs * 1.45 + 50;

  // Отрывок тафсира: сколько поместится, в конце «…»
  if (withTafsir && ed) {
    const key = S.tf === 'muntahab' ? 'muntahab' : 'saadi'; // Абу Адель — перевод, на картинку берём тафсир
    const txt = tfPlain(ed, key, a);
    const room = H - FOOT - 60 - y - 70;
    if (txt && room > 120) {
      ctx.strokeStyle = v('--line'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(PAD + 200, y); ctx.lineTo(W - PAD - 200, y); ctx.stroke();
      y += 64;
      ctx.fillStyle = v('--accent'); ctx.font = '600 32px Commissioner';
      ctx.fillText('Тафсир ' + TAFSIR.find((x) => x[0] === key)[1].replace('Ас-', 'ас-').replace('Аль-М', '«Аль-М') + (key === 'muntahab' ? '»' : ''), W / 2, y);
      y += 30;
      ctx.font = '400 34px Commissioner'; ctx.fillStyle = v('--muted');
      const lh = 34 * 1.5, max = Math.floor((H - FOOT - 70 - y) / lh);
      let tl = wrapLines(ctx, txt, MW);
      if (tl.length > max) { tl = tl.slice(0, Math.max(1, max)); tl[tl.length - 1] = tl[tl.length - 1].replace(/[\s,.;:]*\S*$/, '') + '…'; }
      tl.forEach((l, i) => ctx.fillText(l, W / 2, y + 34 + i * lh));
      y += 34 + tl.length * lh;
    } else if (txt && SH) SH.noTf = true;
  }

  }
  const free = H - FOOT - 40 - y;
  main.drawImage(layer, 0, Math.max(0, free / 2));
  // Подпись: QR-код и имя бота, чтобы по картинке можно было найти тренажёр
  const fy = H - FOOT + 40, box = 200;
  ctx.fillStyle = v('--raise');
  ctx.beginPath(); ctx.roundRect(PAD, fy, MW, box + 40, 32); ctx.fill();
  if (qr) {
    const q = qr(0, 'M'); q.addData(BOT_URL); q.make();
    const m = q.getModuleCount(), cell = Math.floor((box - 16) / m), qs = cell * m, qx = PAD + 20 + (box - qs) / 2, qy = fy + 20 + (box - qs) / 2;
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.roundRect(PAD + 20, fy + 20, box, box, 16); ctx.fill();
    ctx.fillStyle = '#111111';
    for (let r = 0; r < m; r++) for (let k = 0; k < m; k++) if (q.isDark(r, k)) ctx.fillRect(qx + k * cell, qy + r * cell, cell, cell);
  }
  const tx = PAD + (qr ? box + 56 : 40);
  ctx.textAlign = 'left';
  ctx.fillStyle = v('--accent'); ctx.font = '800 64px "Sofia Sans Condensed"'; ctx.fillText('Калима', tx, fy + 92);
  ctx.fillStyle = v('--ink'); ctx.font = '400 32px Commissioner'; ctx.fillText('Тренажёр слов Корана', tx, fy + 142);
  ctx.fillStyle = v('--muted'); ctx.font = '600 34px Commissioner'; ctx.fillText('@' + BOT + ' в Telegram', tx, fy + 192);
  return c;
}
let SH = null;
async function openShare(n, a, withTafsir = true) {
  SH = { n, a, withTafsir, data: null, url: null };
  const frame = (body) => `<div class="sheet-wrap" data-act="close"><div class="sheet long" role="dialog" aria-label="Картинка аята">
    <h3>Картинка: «${esc(suraName(n))}», аят ${a}</h3>
    <div class="tabs two" role="group" aria-label="Что на картинке"><button data-act="shmode" data-t="1" class="${withTafsir ? 'on' : ''}">С тафсиром</button><button data-act="shmode" data-t="0" class="${withTafsir ? '' : 'on'}">Только аят</button></div>
    ${body}
    <button class="btn ghost" data-act="close">Закрыть</button>
  </div></div>`;
  $sheet.hidden = false;
  $sheet.innerHTML = frame('<p class="muted">Рисуем картинку…</p>');
  let c = null;
  try { c = await drawShare(n, a, withTafsir); } catch (e) {}
  if ($sheet.hidden || !SH || SH.n !== n || SH.a !== a || SH.withTafsir !== withTafsir) return;
  if (!c) { $sheet.innerHTML = frame('<p class="muted">Этот аят слишком длинный для одной картинки или не загрузился. Попробуйте «Только аят» или другой аят.</p>'); return; }
  SH.data = c.toDataURL('image/jpeg', 0.9);
  const noTf = withTafsir && SH.noTf;
  c.toBlob((b) => { if (SH) SH.blob = b; }, 'image/jpeg', 0.9);
  const inTg = !!(tg && tg.initData);
  const story = inTg && tg.shareToStory && tg.isVersionAtLeast && tg.isVersionAtLeast('7.8');
  $sheet.innerHTML = frame(`${noTf ? '<p class="note">Аят длинный, поэтому тафсир на картинку не поместился. Его можно прочитать в боте по кнопке «Тафсир».</p>' : ''}<img class="shot" src="${SH.data}" alt="Картинка с аятом ${a} суры «${esc(suraName(n))}»${withTafsir ? ' и тафсиром' : ''}">
    ${inTg ? `<button class="btn" data-act="shsend">Прислать мне в чат</button>` : ''}
    ${story ? `<button class="btn ghost" data-act="shstory">Выложить в историю Telegram</button>` : ''}
    <button class="btn ghost" data-act="shsave">${navigator.canShare ? 'Поделиться или сохранить' : 'Сохранить картинку'}</button>
    <p class="note" id="shMsg">${inTg ? 'Бот пришлёт картинку в чат: оттуда её можно сохранить в галерею и выложить в статус WhatsApp или в историю.' : 'Картинку можно сохранить и выложить в статус.'}</p>`);
}
async function shareAct(a, t) {
  const msg = (x) => { const el = document.getElementById('shMsg'); if (el) el.textContent = x; };
  if (a === 'shmode') return openShare(SH.n, SH.a, t.dataset.t === '1');
  if (!SH || !SH.data) return;
  if (a === 'shsave') {
    const file = SH.blob && new File([SH.blob], `kalima-${SH.n}-${SH.a}.jpg`, { type: 'image/jpeg' });
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: 'Тренажёр слов Корана «Калима»: ' + BOT_URL }); } catch (e) {} return; }
    if (tg && tg.initData) { msg('Здесь сохранить напрямую не получится. Нажмите «Прислать мне в чат», и бот пришлёт картинку.'); return; }
    const l = document.createElement('a'); l.href = SH.data; l.download = `kalima-${SH.n}-${SH.a}.jpg`; l.click(); return;
  }
  t.disabled = true; msg('Отправляем…');
  try {
    if (!SH.url || a === 'shsend') {
      const r = await fetch(API.replace('/remind', '/share'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: tg.initData, img: SH.data, send: a === 'shsend', title: suraName(SH.n), a: SH.a }) });
      const j = await r.json(); if (!j.url) throw new Error('share'); SH.url = j.url;
      if (!j.ok) throw new Error('send');
    }
    if (a === 'shsend') { haptic('ok'); msg('Готово! Картинка в чате с ботом. Откройте её и сохраните в галерею.'); }
    if (a === 'shstory') tg.shareToStory(SH.url, { text: 'Тренажёр слов Корана «Калима»: @' + BOT });
  } catch (e) { msg('Не получилось отправить. Если вы ещё не писали боту, нажмите в нём «Старт» и попробуйте снова.'); }
  t.disabled = false;
}
const PIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
const picBtn = (n, a) => `<button class="snd" data-act="share" data-n="${n}" data-a="${a}">${PIC}Картинка</button>`;
const BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>';
const tfBtn = (n, a) => `<button class="snd" data-act="tafsir" data-n="${n}" data-a="${a}">${BOOK}Тафсир</button>`;
const player = new Audio();
player.preload = 'none';
let playingBtn = null;
let queue = [];
function play(src, btn) {
  const list = Array.isArray(src) ? src : [src];
  if (playingBtn) playingBtn.classList.remove('on');
  if (btn && playingBtn === btn && !player.paused) { player.pause(); queue = []; playingBtn = null; return; }
  queue = list.slice(1);
  player.src = list[0];
  playingBtn = btn || null;
  if (btn) btn.classList.add('on');
  player.play().catch(() => { if (btn) { btn.classList.remove('on'); btn.classList.add('err'); } });
}
player.addEventListener('ended', () => { if (queue.length) { player.src = queue.shift(); player.play().catch(() => {}); return; } if (playingBtn) playingBtn.classList.remove('on'); playingBtn = null; });
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/></svg>';
function sounds(w) {
  const ex = w.example;
  return `<div class="sound">${ex.audio ? `<button class="snd" data-act="play" data-url="${esc(wordUrl(ex.audio))}">${ICON}Слово</button>` : ''}<button class="snd" data-act="play" data-url="${esc(ayahUrl(ex.sura, ex.ayah))}">${ICON}Аят</button></div>`;
}

/* ---------- хранение ---------- */
const LS = 'kalima.v1';
function pack() {
  return Object.entries(P).map(([id, [b, d]]) => `${id},${b},${d}`).join('|');
}
function unpack(str) {
  const out = {};
  String(str || '').split('|').forEach((r) => { const [id, b, d] = r.split(','); if (id && D.words[id]) out[id] = [+b, +d]; });
  return out;
}
function cloud() { return tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9') ? tg.CloudStorage : null; }
function save() {
  const t = Date.now();
  const body = { t, p: pack(), s: S };
  try { localStorage.setItem(LS, JSON.stringify(body)); } catch (e) {}
  const cs = cloud();
  if (!cs) return;
  const chunks = body.p.match(/.{1,4000}/g) || [''];
  chunks.forEach((c, i) => cs.setItem('p' + i, c));
  const { h, hd, ...rest } = S;
  cs.setItem('meta', JSON.stringify({ t, n: chunks.length, s: rest }));
  cs.setItem('hz', JSON.stringify(h || {}));
  cs.setItem('hd', JSON.stringify(hd || {}));
}
function loadLocal() {
  try { const b = JSON.parse(localStorage.getItem(LS) || 'null'); if (b) return b; } catch (e) {}
  return null;
}
function loadCloud() {
  const cs = cloud();
  if (!cs) return Promise.resolve(null);
  return new Promise((res) => {
    const timer = setTimeout(() => res(null), 2500);
    cs.getItem('meta', (err, v) => {
      if (err || !v) { clearTimeout(timer); return res(null); }
      let m; try { m = JSON.parse(v); } catch (e) { clearTimeout(timer); return res(null); }
      const keys = Array.from({ length: m.n }, (_, i) => 'p' + i);
      cs.getItems([...keys, 'hz', 'hd'], (e2, vals) => {
        clearTimeout(timer);
        if (e2 || !vals) return res(null);
        let h = {}, hd = {};
        try { h = JSON.parse(vals.hz || '{}'); hd = JSON.parse(vals.hd || '{}'); } catch (e) {}
        res({ t: m.t, s: { ...m.s, h, hd }, p: keys.map((k) => vals[k] || '').join('') });
      });
    });
  });
}

/* ---------- состояние обучения ---------- */
function isNew(id) { return !P[id]; }
function due() { const d = today(); return order.filter((id) => P[id] && P[id][1] <= d).sort((a, b) => P[a][1] - P[b][1]); }
function nextNew(n) {
  const out = [];
  S.pin.forEach((id) => { if (isNew(id) && D.words[id] && out.length < n) out.push(id); });
  const cur = setById(S.set);
  const pools = cur ? [cur.words, order] : [order];
  for (const pool of pools) for (const id of pool) { if (out.length >= n) break; if (isNew(id) && !out.includes(id)) out.push(id); }
  return out;
}
function known() { return order.filter((id) => P[id] && P[id][0] >= 1); }
function coverageText() {
  // coverage.json считает долю текста для слов, выученных по порядку уроков.
  // Берём самый длинный выученный отрезок с начала порядка, поэтому оценка не завышена.
  const arr = COV && COV.cumulative_percent;
  if (!arr) return '';
  let p = 0;
  while (p < order.length && P[order[p]] && P[order[p]][0] >= 1) p++;
  if (!p) return '';
  return `Выученные слова составляют не меньше ${Math.floor(arr[Math.min(p, arr.length) - 1])}% текста Корана`;
}
function grade(id, okFirst) {
  const [b] = P[id] || [0];
  const nb = okFirst ? Math.min(b + 1, INTERVALS.length - 1) : 1;
  P[id] = [nb, today() + INTERVALS[nb]];
  S.pin = S.pin.filter((x) => x !== id);
}
function whenLabel(id) {
  const d = P[id][1] - today();
  if (d <= 0) return 'сегодня';
  if (d === 1) return 'завтра';
  return `через ${d} ${plural(d, 'день', 'дня', 'дней')}`;
}

/* ---------- навигация ---------- */
function go(name, arg) {
  screen = name;
  back = null;
  closeSheet();
  window.scrollTo(0, 0);
  ({ home, words, lesson, toc, sura, welcome, hifzToc, hifz, settings })[name](arg);
  if (tg && tg.BackButton) name === 'home' || name === 'welcome' ? tg.BackButton.hide() : tg.BackButton.show();
}
function goBack() { if (!$sheet.hidden) return closeSheet(); if (back) { const b = back; back = null; return b(); } go('home'); }

/* ---------- приветствие при первом запуске ---------- */
function welcome() {
  $where.textContent = '';
  $view.innerHTML = `<div class="narrow welcome">
    <p class="ayah" lang="ar">ٱلسَّلَامُ عَلَيْكُمْ</p>
    <h1>Ассаляму алейкум, сестра!</h1>
    <p class="lead">Рада видеть тебя в тренажёре. Занимайся, учи слова Корана и получай свою награду.</p>
    <button class="btn" data-act="hello">Начать</button>
  </div>`;
}

/* ---------- главная ---------- */
function home() {
  $where.textContent = '';
  const dl = due().length;
  const nw = nextNew(1)[0];
  const t = S.hd[today()] || 0, g = S.goal;
  const wordsSub = dl ? `${dl} ${plural(dl, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения` : nw ? `Следующее слово «${esc(W(nw).translit)}»` : 'Все слова выучены';
  const hifzSub = hifzDone() ? `Сегодня ${t} из ${g} ${plural(g, 'аята', 'аятов', 'аятов')}` : 'Начните с «Аль-Фатихи»';
  $view.innerHTML = `<div class="narrow stack">
    <h1>Что будем делать сегодня?</h1>
    <div class="choices">
      <button class="choice c-words" data-go="words">
        <span class="c-ar" lang="ar" aria-hidden="true">كَلِمَة</span>
        <span class="c-title">Учить слова Корана</span>
        <span class="c-desc">Урок из 10 слов: карточки, тест и повторение</span>
        <span class="c-stat">${wordsSub}</span>
      </button>
      <button class="choice c-hifz" data-go="hifzToc">
        <span class="c-ar" lang="ar" aria-hidden="true">حِفْظ</span>
        <span class="c-title">Хифз: учить наизусть</span>
        <span class="c-desc">Суры по аятам, чтец на выбор, тафсир к каждому аяту</span>
        <span class="c-stat">${hifzSub}</span>
      </button>
    </div>
    <nav class="list" aria-label="Ещё">
      <button data-go="toc"><span>Читать суры по словам<span class="sub">Аль-Фатиха и джуз «Амма» с переводом</span></span></button>
      <button data-go="settings"><span>Фон и чтец<span class="sub">${esc((THEMES.find((x) => x[0] === S.theme) || THEMES[0])[1])}, ${esc(qariName())}</span></span></button>
    </nav>
  </div>`;
}

/* ---------- фон и чтец ---------- */
function settings() {
  $where.textContent = 'Настройки';
  $view.innerHTML = `<div class="narrow stack">
    <h2>Фон и чтец</h2>
    <p class="muted">Фон</p>
    <div class="themes" role="group" aria-label="Фон">${THEMES.map(([k, t, bg, ac, ink]) => `<button class="theme ${S.theme === k ? 'on' : ''}" data-act="theme" data-k="${k}" aria-pressed="${S.theme === k}">
      <span class="sw" style="background:${bg};color:${ink}" lang="ar">كَلِمَة<i style="background:${ac}"></i></span>${t}</button>`).join('')}</div>
    <p class="muted" style="margin-top:12px">Чтец для аятов и хифза. Коснитесь, чтобы выбрать и послушать.</p>
    <div class="list" role="group" aria-label="Чтец">${QARI.map(([q, name, sub]) => `<button data-act="qari" data-q="${q}" class="${S.qari === q ? 'on' : ''}" aria-pressed="${S.qari === q}"><span>${esc(name)}<span class="sub">${esc(sub)}</span></span><b>${S.qari === q ? 'выбран' : ''}</b></button>`).join('')}</div>
    <p class="note">Чтения с сайта everyayah.com.</p>
  </div>`;
}

function words() {
  $where.textContent = 'Слова';
  const dl = due();
  const nw = nextNew(1)[0];
  const featured = nw || dl[0] || order[0];
  const w = W(featured);
  const cur = setById(S.set) || D.sets[0];
  const curDone = cur.words.filter((id) => P[id]).length;
  const cov = coverageText();
  const started = Object.keys(P).length > 0;
  $view.innerHTML = `
  <div class="wrap">
    <div class="page">
      <p class="ayah" lang="ar">${highlight(w.example.ar, w.example.form)}</p>
      <div class="gloss"><strong>${esc(w.translit)}: ${esc(first(w.ru))}</strong><span>${esc(w.example.ru)} ${esc(ref(w.example))}</span></div>
    </div>
    <section>
      <h1>${started ? 'Продолжим с того места, где остановились' : 'Откройте мусхаф и узнайте слово сами'}</h1>
      <p class="lead">${nw ? `Следующее слово «${esc(w.translit)}». ` : ''}Десять слов за урок, по порядку сур. Слова, которые ускользают, приложение вернёт само.</p>
      <div class="stack" style="margin-top:24px">
        ${nw || dl.length ? `<button class="btn" data-act="learn">${dl.length && nw ? 'Начать урок' : nw ? 'Начать урок' : 'Повторить слова'}</button>` : `<p class="note">Все слова выучены. Новые появятся в следующих версиях словаря.</p>`}
      </div>
      <nav class="list" style="margin-top:20px" aria-label="Разделы">
        ${(S.last || []).length ? `<button data-act="again"><span>Повторить прошлый урок<span class="sub">Те же ${S.last.length} ${plural(S.last.length, 'слово', 'слова', 'слов')}: карточки и тест ещё раз</span></span><b>${S.last.length}</b></button>` : ''}
        <button data-act="review" ${dl.length ? '' : 'disabled'}><span>Повторить забытые<span class="sub">${dl.length ? 'Слова, которые пора освежить' : 'Сегодня повторять нечего'}</span></span><b>${dl.length}</b></button>
        <button data-go="sura" data-n="${cur.sura ?? ''}" data-set="${esc(cur.id)}"><span>${esc(cur.title)}<span class="sub">${cur.sura ? 'Читать по аятам' : 'Набор слов'}</span></span><b>${curDone} из ${cur.words.length}</b></button>
        <button data-go="toc"><span>Все суры<span class="sub">Аль-Фатиха и джуз «Амма»</span></span><b>${D.sets.length}</b></button>
      </nav>
      ${cov ? `<p class="note" style="margin-top:16px">${esc(cov)}</p>` : ''}
    </section>
  </div>`;
}

/* ---------- урок ---------- */
let L = null;
function lesson(mode) {
  if (mode === 'again') {
    // Повтор прошлого урока: те же карточки и тест, расписание повторов не меняется
    const ids = (S.last || []).filter((id) => D.words[id]);
    L = { mode, cards: ids.slice(), ci: 0, flipped: false, queue: shuffle(ids.slice()), all: ids.slice(), failed: new Set(), qi: 0, answered: false, total: ids.length };
    if (!L.total) return go('words');
    $where.textContent = 'Прошлый урок';
    return drawCard();
  }
  const dl = due().slice(0, MAX_REVIEW);
  const nw = mode === 'review' ? [] : nextNew(NEW_PER_LESSON);
  L = { mode, cards: nw.slice(), ci: 0, flipped: false, queue: shuffle([...nw, ...dl]), all: [...nw, ...dl], failed: new Set(), qi: 0, answered: false, total: nw.length + dl.length };
  if (!L.total) return go('words');
  $where.textContent = mode === 'review' ? 'Повтор' : 'Урок';
  back = null;
  L.cards.length ? drawCard() : drawTest();
}
function bar(done, total) { return `<div class="progress" aria-label="Пройдено ${done} из ${total}"><i style="width:${Math.round((done / total) * 100)}%"></i></div>`; }
function drawCard() {
  const id = L.cards[L.ci], w = W(id);
  $view.innerHTML = `<div class="narrow stack">
    ${bar(L.ci, L.cards.length * 2)}
    <p class="muted">Новое слово ${L.ci + 1} из ${L.cards.length}</p>
    <button class="page card" data-act="flip" aria-label="Перевернуть карточку">
      <span class="word" lang="ar">${esc(w.ar)}</span>
      ${L.flipped ? `<span class="ru">${esc(w.translit)}: ${esc(w.ru)}</span>
        ${w.note ? `<span class="note">${esc(w.note)}</span>` : ''}
        <span class="ayah" lang="ar" style="font-size:1.6rem">${highlight(w.example.ar, w.example.form)}</span>
        <span class="note">${esc(w.example.ru)} ${esc(ref(w.example))}</span>` : `<span class="note">Коснитесь, чтобы увидеть перевод</span>`}
    </button>
    ${sounds(w)}
    ${L.flipped ? `<div class="row2"><button class="btn ghost" data-act="next-card">Ещё не помню</button><button class="btn" data-act="next-card">Помню</button></div>` : `<button class="btn ghost" data-act="flip">Показать перевод</button>`}
  </div>`;
}
function options(id) {
  const w = W(id), right = first(w.ru);
  const pool = shuffle(order.filter((x) => x !== id && first(W(x).ru) !== right));
  const same = pool.filter((x) => W(x).pos === w.pos);
  const picks = [];
  for (const x of [...same, ...pool]) { const r = first(W(x).ru); if (!picks.includes(r) && r !== right) picks.push(r); if (picks.length === 2) break; }
  return shuffle([right, ...picks]);
}
function drawTest() {
  if (L.qi >= L.queue.length) return drawResult();
  const id = L.queue[L.qi], w = W(id);
  L.answered = false;
  L.opts = options(id);
  const cardsPart = L.cards.length;
  const done = cardsPart + L.qi;
  $view.innerHTML = `<div class="narrow stack">
    ${bar(done, cardsPart + L.queue.length)}
    <p class="muted">Что значит выделенное слово?</p>
    <div class="page">
      <p class="ayah" lang="ar">${highlight(w.example.ar, w.example.form)}</p>
      <div class="gloss"><span>${esc(ref(w.example))}</span></div>
    </div>
    ${sounds(w)}
    <div class="ans" role="group" aria-label="Варианты ответа">
      ${L.opts.map((o, i) => `<button data-act="answer" data-i="${i}">${esc(o)}</button>`).join('')}
    </div>
    <div id="after"></div>
  </div>`;
}
function answer(i) {
  if (L.answered) return;
  L.answered = true;
  const id = L.queue[L.qi], w = W(id), right = first(w.ru);
  const btns = $view.querySelectorAll('[data-act="answer"]');
  const ok = L.opts[i] === right;
  btns.forEach((b, j) => { if (L.opts[j] === right) b.classList.add('ok'); else if (j === i) b.classList.add('bad'); });
  haptic(ok ? 'ok' : 'bad');
  if (ok) { L.qi++; setTimeout(drawTest, 650); return; }
  L.failed.add(id);
  L.queue.push(id);
  document.getElementById('after').innerHTML = `<div class="stack"><p class="note">«${esc(w.translit)}»: ${esc(w.ru)}. Слово вернётся в конце урока.</p><button class="btn" data-act="next-q">Дальше</button></div>`;
}
function drawResult() {
  if (L.mode !== 'again') { L.all.forEach((id) => grade(id, !L.failed.has(id))); S.last = L.all.slice(); }
  save();
  const okN = L.all.length - L.failed.size;
  $where.textContent = 'Итог';
  $view.innerHTML = `<div class="narrow stack">
    <h2>${okN} из ${L.all.length} с первого раза</h2>
    <p class="muted">Когда слово вернётся на повтор</p>
    <div class="list">${L.all.map((id) => `<div><span><span class="ar-s" lang="ar">${esc(W(id).ar)}</span> <span>${esc(first(W(id).ru))}</span></span><b>${whenLabel(id)}</b></div>`).join('')}</div>
    ${nextNew(1).length ? '<button class="btn" data-act="learn">Ещё 10 слов</button>' : ''}
    <button class="btn ghost" data-act="again">Пройти этот урок ещё раз</button>
    <button class="btn ghost" data-go="words">Готово</button>
  </div>`;
}

/* ---------- хифз ---------- */
const learnedAyahs = (n) => S.h[n] || [];
function hifzDone() { return Object.values(S.h).reduce((a, x) => a + x.length, 0); }
function hifzToc() {
  $where.textContent = 'Хифз';
  const list = [...SIDX].sort((a, b) => (a.n === 1 ? -1 : b.n === 1 ? 1 : b.n - a.n));
  $view.innerHTML = `<div class="narrow stack">
    <h2>Учите суры наизусть, аят за аятом</h2>
    ${tracker()}
    ${reminderBox()}
    <p class="muted">Слушайте аят несколько раз, повторяйте за чтецом, потом спрячьте текст и проверьте себя.</p>
    <div class="list">${list.map((x) => {
      const k = learnedAyahs(x.n).length;
      return `<button data-go="hifz" data-n="${x.n}"><span>${x.n}. ${esc(x.title)}<span class="sub">Джуз ${x.juz}, ${k ? `выучено ${k} из ${x.ayahs}` : `${x.ayahs} ${plural(x.ayahs, 'аят', 'аята', 'аятов')}`}</span></span><b>${Math.round((k / x.ayahs) * 100)}%</b></button>`;
    }).join('')}</div>
  </div>`;
}
const QURAN_AYAHS = 6236;
const CROWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>';
const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>';
const dateRu = (days) => new Date(Date.now() + days * 86400000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
function streak() {
  let d = today(), n = 0;
  if ((S.hd[d] || 0) < S.goal) d--; // сегодня ещё не закончено — считаем со вчера
  while ((S.hd[d] || 0) >= S.goal) { n++; d--; }
  return n;
}
function tracker() {
  const learned = hifzDone();
  const amma = SIDX.filter((x) => x.n === 1 || x.n >= 78).reduce((a, x) => a + x.ayahs, 0) || 571;
  const t = S.hd[today()] || 0, g = S.goal;
  const pct = (x) => Math.min(100, (x / QURAN_AYAHS) * 100);
  const stops = [[7, 'Аль-Фатиха'], [amma, 'Аль-Фатиха и джуз «Амма»'], [QURAN_AYAHS / 2, 'Половина Корана']];
  const left = (n) => Math.ceil(Math.max(0, n - learned) / g);
  const st = streak();
  return `<section class="track" aria-label="Мой путь хифза">
    <div class="track-top"><span>Мой путь хифза</span><span>${st ? `${st} ${plural(st, 'день', 'дня', 'дней')} подряд` : 'Начните сегодня'}</span></div>
    <p class="today"><b>${t}</b> из ${g} ${plural(g, 'аята', 'аятов', 'аятов')} сегодня</p>
    ${t >= g ? '<p class="note" style="color:var(--ok)">Цель на сегодня выполнена, машаАллах!</p>' : ''}
    ${bar(Math.min(t, g), g)}
    <div class="goal"><span class="muted">Цель в день</span><div class="seg">${[1, 3, 5, 10].map((r) => `<button data-act="hgoal" data-g="${r}" class="${g === r ? 'on' : ''}">${r}</button>`).join('')}</div></div>
    <div class="road" role="img" aria-label="Выучено ${learned} из ${QURAN_AYAHS} аятов Корана">
      <i style="width:${Math.max(pct(learned), learned ? 1 : 0)}%"></i>
      ${stops.map(([x, name]) => `<span class="stop ${learned >= x ? 'done' : ''}" style="left:${pct(x)}%" title="${esc(name)}"></span>`).join('')}
      <span class="crown ${learned >= QURAN_AYAHS ? 'done' : ''}">${CROWN}</span>
    </div>
    <div class="road-labels"><span>Выучено ${learned} ${plural(learned, 'аят', 'аята', 'аятов')}</span><span>Весь Коран</span></div>
    <div class="list plan">
      <div><span>Аль-Фатиха и джуз «Амма»<span class="sub">${amma} ${plural(amma, 'аят', 'аята', 'аятов')}</span></span><b>${learned >= amma ? 'выучено' : 'к ' + dateRu(left(amma))}</b></div>
      <div><span>Весь Коран<span class="sub">${QURAN_AYAHS} аятов, по ${g} в день</span></span><b>к ${dateRu(left(QURAN_AYAHS))}</b></div>
    </div>
  </section>`;
}
function reminderBox() {
  const r = S.rem;
  const inTg = !!(tg && tg.initData);
  return `<section class="track" aria-label="Напоминание">
    <div class="track-top"><span>Напоминание от бота</span><span>${r.on ? 'включено' : 'выключено'}</span></div>
    ${inTg ? `<div class="remind">
      <label class="time"><span class="muted">Каждый день в</span><input id="remTime" type="time" value="${esc(r.time)}"></label>
      <button class="btn ${r.on ? 'ghost' : ''}" data-act="hrem">${BELL}${r.on ? 'Сохранить время' : 'Напоминать мне'}</button>
      ${r.on ? `<div class="row2"><button class="btn ghost" data-act="hremtest">Прислать пробное</button><button class="btn ghost" data-act="hremoff">Выключить</button></div>` : ''}
      <p class="note" id="remMsg">${r.on ? `Бот напишет в ${esc(r.time)} и напомнит про ${S.goal} ${plural(S.goal, 'аят', 'аята', 'аятов')}.` : 'Бот будет присылать сообщение с кнопкой «Открыть хифз».'}</p>
    </div>` : '<p class="note">Напоминания работают, когда приложение открыто в Telegram.</p>'}
  </section>`;
}
const API = 'https://kalima-bot.medina-vibecode.workers.dev/api/remind';
function remPayload(extra) {
  const [hh, mm] = (S.rem.time || '07:00').split(':').map(Number);
  const tz = new Date().getTimezoneOffset();
  return { initData: tg ? tg.initData : '', enabled: S.rem.on, utcMin: hh * 60 + mm + tz, tz, goal: S.goal, learned: hifzDone(), ...extra };
}
async function sendRem(extra) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(remPayload(extra)) });
  if (!r.ok) throw new Error('remind ' + r.status);
}
function syncProgress() { if (S.rem.on && tg && tg.initData) sendRem({ progressOnly: true }).catch(() => {}); }
async function remAct(a) {
  const msg = (t) => { const el = document.getElementById('remMsg'); if (el) el.textContent = t; };
  if (a === 'hremoff') S.rem.on = false;
  else if (a === 'hrem') {
    const v = document.getElementById('remTime').value;
    if (v) S.rem.time = v;
    if (!S.rem.on && tg && tg.requestWriteAccess) await new Promise((res) => { try { tg.requestWriteAccess(() => res()); } catch (e) { res(); } });
    S.rem.on = true;
  }
  save();
  try { await sendRem(a === 'hremtest' ? { test: true } : {}); haptic('ok'); hifzToc(); if (a === 'hremtest') msg('Пробное напоминание отправлено, загляните в чат с ботом.'); }
  catch (e) { hifzToc(); msg('Не получилось связаться с ботом. Проверьте интернет и попробуйте ещё раз.'); }
}
let HZ = null;
async function hifz(arg) {
  const n = +((arg && arg.n) || (HZ && HZ.n));
  if (!HZ || HZ.n !== n) {
    const done = learnedAyahs(n);
    HZ = { n, i: 0, hide: false, open: new Set(), data: null };
    $view.innerHTML = '<p class="muted">Открываем суру…</p>';
    try { HZ.data = await (await fetch(`data/hifz/${n}.json?v=12`)).json(); }
    catch (e) { $view.innerHTML = '<p class="muted">Не получилось открыть суру. Проверьте интернет.</p>'; return; }
    const firstNew = HZ.data.ayahs.findIndex((a) => !done.includes(a.n));
    HZ.i = firstNew < 0 ? 0 : firstNew;
  }
  if (screen !== 'hifz') return;
  back = () => go('hifzToc');
  drawHifz();
}
function drawHifz() {
  const { data, i, hide, open } = HZ, a = data.ayahs[i], total = data.ayahs.length;
  const done = learnedAyahs(HZ.n), isDone = done.includes(a.n);
  $where.textContent = data.title;
  const words = a.w.map((x, j) => {
    const cls = hide && !open.has(j) ? 'hid' : '';
    return `<button class="${cls}" data-act="hword" data-j="${j}" data-url="${esc(locUrl(HZ.n, a.n, a.a ? a.a[j] : j + 1))}">${esc(x)}</button>`;
  }).join(' ');
  $view.innerHTML = `<div class="narrow stack">
    <h2>${esc(data.title)}</h2>
    <p class="muted">Аят ${a.n} из ${total}, выучено ${done.length}</p>
    ${bar(done.length, total)}
    ${i === 0 && HZ.n !== 1 && HZ.n !== 9 ? `<div class="sound"><button class="snd" data-act="play" data-url="${esc(ayahUrl(1, 1, S.qari))}">${ICON}Бисмилля перед сурой</button></div>` : ''}
    <div class="page hz"><div class="chips" lang="ar">${words}</div>
      <p class="note" style="margin-top:14px">${hide ? 'Вспомните аят. Коснитесь слова, чтобы открыть и послушать его.' : esc(a.ru)}</p>
      ${hide ? '' : `<div class="tools" style="margin-top:12px">${tfBtn(HZ.n, a.n)}${picBtn(HZ.n, a.n)}</div>`}</div>
    <button class="btn" data-act="hplay">${ICON}Слушать ${S.rep > 1 ? S.rep + ' ' + plural(S.rep, 'раз', 'раза', 'раз') : ''}</button>
    <div class="seg" role="group" aria-label="Сколько раз повторять">${[1, 3, 5, 10].map((r) => `<button data-act="hrep" data-r="${r}" class="${S.rep === r ? 'on' : ''}">×${r}</button>`).join('')}</div>
    <nav class="list"><button data-act="hqari"><span>Чтец<span class="sub">${esc(qariName())}</span></span><b>сменить</b></button></nav>
    <div class="row2">
      <button class="btn ghost" data-act="hhide">${hide ? 'Показать текст' : 'Спрятать текст'}</button>
      <button class="btn ghost" data-act="hlink" ${i ? '' : 'disabled'}>Связать с прошлыми</button>
    </div>
    <button class="btn ${isDone ? 'ghost' : 'okb'}" data-act="hdone">${isDone ? 'Аят выучен, снять отметку' : 'Выучила этот аят'}</button>
    <div class="row2">
      <button class="btn ghost" data-act="hstep" data-d="-1" ${i ? '' : 'disabled'}>Предыдущий</button>
      <button class="btn ghost" data-act="hstep" data-d="1" ${i < total - 1 ? '' : 'disabled'}>Следующий</button>
    </div>
  </div>`;
}
function hifzAct(a, t) {
  if (a === 'hgoal') { S.goal = +t.dataset.g; save(); syncProgress(); return hifzToc(); }
  if (a === 'hrem' || a === 'hremoff' || a === 'hremtest') return remAct(a);
  const ay = HZ.data.ayahs[HZ.i];
  if (a === 'hplay') return play(Array(S.rep).fill(ayahUrl(HZ.n, ay.n, S.qari)), t);
  if (a === 'hqari') { player.pause(); go('settings'); back = () => go('hifz'); return; }
  if (a === 'hrep') { S.rep = +t.dataset.r; save(); return drawHifz(); }
  if (a === 'hhide') { HZ.hide = !HZ.hide; HZ.open = new Set(); return drawHifz(); }
  if (a === 'hword') { if (HZ.hide) { HZ.open.add(+t.dataset.j); drawHifz(); } return play(t.dataset.url); }
  if (a === 'hlink') return play(HZ.data.ayahs.slice(0, HZ.i + 1).map((x) => ayahUrl(HZ.n, x.n, S.qari)), t);
  if (a === 'hstep') { HZ.i = Math.max(0, Math.min(HZ.data.ayahs.length - 1, HZ.i + +t.dataset.d)); HZ.hide = false; HZ.open = new Set(); player.pause(); window.scrollTo(0, 0); return drawHifz(); }
  if (a === 'hdone') {
    const list = learnedAyahs(HZ.n).filter((x) => x !== ay.n);
    const added = !learnedAyahs(HZ.n).includes(ay.n);
    if (added) { list.push(ay.n); haptic('ok'); }
    const d = today();
    S.hd[d] = Math.max(0, (S.hd[d] || 0) + (added ? 1 : -1));
    Object.keys(S.hd).forEach((k) => { if (+k < d - 120) delete S.hd[k]; });
    setTimeout(syncProgress, 0);
    S.h[HZ.n] = list.sort((x, y) => x - y); save();
    if (list.includes(ay.n) && HZ.i < HZ.data.ayahs.length - 1) { HZ.i++; HZ.hide = false; HZ.open = new Set(); window.scrollTo(0, 0); }
    return drawHifz();
  }
}

/* ---------- оглавление ---------- */
function toc() {
  $where.textContent = 'Суры';
  const m = D.meta || {};
  $view.innerHTML = `<div class="narrow stack">
    <h2>Учите по порядку: сначала «Аль-Фатиха», потом короткие суры</h2>
    <div class="list">${D.sets.map((s) => {
      const k = s.words.filter((id) => P[id]).length;
      return `<button data-go="sura" data-n="${s.sura ?? ''}" data-set="${esc(s.id)}"><span>${s.sura ? s.sura + '. ' : ''}${esc(s.title)}<span class="sub">${k} из ${s.words.length} ${plural(s.words.length, 'слова', 'слов', 'слов')}${s.id === S.set ? ', учите сейчас' : ''}</span></span><b>${s.words.length ? Math.round((k / s.words.length) * 100) : 0}%</b></button>`;
    }).join('')}</div>
    <p class="credits">${[].concat(m.attribution || [], 'Озвучка слов: Quran.com. Чтение аятов: everyayah.com, чтец выбирается в разделе «Фон и чтец».', 'Тафсиры: ас-Саади (перевод Э. Кулиева), «Аль-Мунтахаб», перевод Абу Аделя, через alquran.cloud.').map(esc).join('<br>')}</p>
  </div>`;
}

/* ---------- сура по аятам ---------- */
const suraCache = {};
async function sura(arg) {
  const { n, set } = arg || {};
  if (set) { S.set = set; save(); }
  const st = setById(S.set);
  if (!n) return drawSet(st);
  $where.textContent = suraTitle(+n);
  $view.innerHTML = '<p class="muted">Открываем суру…</p>';
  let data = suraCache[n];
  if (!data) {
    try { data = suraCache[n] = await (await fetch(`data/suras/${n}.json`)).json(); }
    catch (e) { return drawSet(st); }
  }
  if (screen !== 'sura') return;
  back = () => go('toc');
  const all = data.ayahs.flatMap((a) => a.words.filter((x) => x.id).map((x) => x.id));
  const uniq = [...new Set(all)];
  const k = uniq.filter((id) => P[id] && P[id][0] >= 1).length;
  $view.innerHTML = `<div class="narrow stack">
    <h2>${esc(data.title)}</h2>
    <p class="muted">Вы узнаёте ${k} из ${uniq.length} ${plural(uniq.length, 'слова', 'слов', 'слов')} этой суры</p>
    ${bar(k, Math.max(uniq.length, 1))}
    <p class="legend"><span><i style="background:var(--ok)"></i>знаете</span><span><i style="background:var(--accent)"></i>учите</span><span><i style="border:1px solid var(--line)"></i>новое, коснитесь</span></p>
    ${data.ayahs.map((a) => `<div class="verse"><div class="vhead"><span class="n">Аят ${a.n}</span><span class="tools">${tfBtn(data.sura, a.n)}<button class="snd" data-act="play" data-url="${esc(ayahUrl(data.sura, a.n))}" aria-label="Послушать аят ${a.n}">${ICON}Аят</button></span></div><div class="chips" lang="ar">${a.words.map((x, j) => {
      x = { t: x.t, id: x.id || (x.ids || []).find((i) => D.words[i]) };
      const loc = esc(locUrl(data.sura, a.n, a.a ? a.a[j] : j + 1));
      if (!x.id || !D.words[x.id]) return `<button data-act="play" data-url="${loc}" aria-label="Послушать слово">${esc(x.t)}</button>`;
      const cls = P[x.id] ? (P[x.id][0] >= 2 ? 'k' : 'lrn') : 'nw';
      return `<button class="${cls}" data-act="word" data-id="${esc(x.id)}" data-url="${loc}">${esc(x.t)}</button>`;
    }).join(' ')}</div><p class="note">${esc(a.ru)}</p></div>`).join('')}
    <button class="btn" data-act="learn">Учить слова этой суры</button>
  </div>`;
}
function drawSet(st) {
  back = () => go('toc');
  $where.textContent = st.title;
  $view.innerHTML = `<div class="narrow stack"><h2>${esc(st.title)}</h2>
    <div class="list">${st.words.map((id) => `<button data-act="word" data-id="${esc(id)}"><span><span class="ar-s" lang="ar">${esc(W(id).ar)}</span> ${esc(first(W(id).ru))}</span><b>${P[id] ? (P[id][0] >= 2 ? 'знаю' : 'учу') : 'новое'}</b></button>`).join('')}</div>
    <button class="btn" data-act="learn">Учить эти слова</button></div>`;
}
function openSheet(id, url) {
  const w = W(id);
  const st = P[id];
  $sheet.hidden = false;
  $sheet.innerHTML = `<div class="sheet-wrap" data-act="close"><div class="sheet" role="dialog" aria-label="Слово">
    <span class="word" lang="ar">${esc(w.ar)}</span>
    <span class="ru">${esc(w.translit)}: ${esc(w.ru)}</span>
    <div class="sound"><button class="snd" data-act="play" data-url="${esc(url || (w.example.audio ? wordUrl(w.example.audio) : ayahUrl(w.example.sura, w.example.ayah)))}">${ICON}Послушать</button></div>
    ${w.root ? `<span class="note">Корень <span lang="ar">${esc(w.root)}</span>${w.freq ? `, слово встречается в Коране ${w.freq} ${plural(w.freq, 'раз', 'раза', 'раз')}` : ''}</span>` : ''}
    ${w.note ? `<span class="note">${esc(w.note)}</span>` : ''}
    ${st ? `<p class="note">Повтор ${whenLabel(id)}</p>` : `<button class="btn" data-act="pin" data-id="${esc(id)}">Учить в следующем уроке</button>`}
    <button class="btn ghost" data-act="close">Закрыть</button>
  </div></div>`;
  haptic();
}
function closeSheet() { $sheet.hidden = true; $sheet.innerHTML = ''; }

/* ---------- события ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-go]');
  if (!t) return;
  if (t.dataset.go) return go(t.dataset.go, { n: t.dataset.n, set: t.dataset.set });
  const a = t.dataset.act;
  if (a === 'close') { if (e.target === t || t.tagName === 'BUTTON') closeSheet(); return; }
  if (a && a[0] === 'h' && a !== 'hello') return hifzAct(a, t);
  if (a === 'hello') { S.hi = true; save(); haptic('ok'); return go('home'); }
  if (a === 'learn') return go('lesson', 'learn');
  if (a === 'review') return go('lesson', 'review');
  if (a === 'again') return go('lesson', 'again');
  if (a === 'flip') { L.flipped = !L.flipped; haptic(); return drawCard(); }
  if (a === 'next-card') { L.ci++; L.flipped = false; return L.ci < L.cards.length ? drawCard() : drawTest(); }
  if (a === 'answer') return answer(+t.dataset.i);
  if (a === 'next-q') { L.qi++; return drawTest(); }
  if (a === 'word') { if (t.dataset.url) play(t.dataset.url); return openSheet(t.dataset.id, t.dataset.url); }
  if (a === 'play') { e.stopPropagation(); return play(t.dataset.url, t); }
  if (a === 'theme') { S.theme = t.dataset.k; save(); applyTheme(); haptic(); return settings(); }
  if (a === 'qari') { S.qari = t.dataset.q; save(); haptic(); const keep = back; settings(); back = keep; return play(ayahUrl(1, 2), $view.querySelector(`[data-q="${t.dataset.q}"]`)); }
  if (a === 'share') { e.stopPropagation(); haptic(); return openShare(+t.dataset.n, +t.dataset.a); }
  if (a === 'shmode' || a === 'shsave' || a === 'shsend' || a === 'shstory') return shareAct(a, t);
  if (a === 'tafsir') { e.stopPropagation(); haptic(); return openTafsir(+t.dataset.n, +t.dataset.a); }
  if (a === 'tf') { S.tf = t.dataset.k; save(); return openTafsir(+t.dataset.n, +t.dataset.a); }
  if (a === 'pin') { const id = t.dataset.id; if (!S.pin.includes(id)) S.pin.unshift(id); save(); closeSheet(); return; }
});

/* ---------- запуск ---------- */
(async function start() {
  if (tg) {
    tg.ready(); tg.expand();
    tg.BackButton && tg.BackButton.onClick(goBack);
  }
  try {
    [D, COV, SIDX] = await Promise.all([
      fetch('data/words.json?v=12').then((r) => r.json()),
      fetch('data/coverage.json?v=12').then((r) => r.json()).catch(() => null),
      fetch('data/hifz/index.json?v=12').then((r) => r.json()).catch(() => []),
    ]);
  } catch (e) {
    $view.innerHTML = '<p class="muted">Не получилось загрузить словарь. Проверьте интернет и откройте приложение ещё раз.</p>';
    return;
  }
  D.sets.forEach((s) => s.words.forEach((id) => { if (!setOf[id] && D.words[id]) { setOf[id] = s.id; order.push(id); } }));
  S.set = D.sets[0].id;
  const apply = (b) => { if (!b) return; P = unpack(b.p); if (b.s) S = { set: b.s.set || S.set, pin: b.s.pin || [], hi: !!b.s.hi, h: b.s.h || {}, rep: b.s.rep || 3, qari: b.s.qari || 'Husary_Muallim_128kbps', hd: b.s.hd || {}, goal: b.s.goal || 3, rem: b.s.rem || { on: false, time: '07:00' }, last: b.s.last || [], theme: b.s.theme || 'night', tf: b.s.tf || 'saadi' }; applyTheme(); };
  const local = loadLocal();
  apply(local);
  applyTheme();
  go(!S.hi ? 'welcome' : location.hash === '#hifz' ? 'hifzToc' : 'home');
  const remote = await loadCloud();
  if (remote && (!local || remote.t > local.t)) { apply(remote); if (screen === 'home' || (screen === 'welcome' && S.hi)) go('home'); }
  // Счётчик для автора: бот отмечает, что сестра открыла приложение (только номер аккаунта и сколько выучено).
  if (tg && tg.initData) fetch(API.replace('/remind', '/seen'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: tg.initData, words: Object.keys(P).length, hifz: hifzDone() }) }).catch(() => {});
})();
