// Бот «Калима» на Cloudflare Workers.
// /start → приветствие с кнопкой, которая открывает мини-приложение.
// /setup → один раз подключает вебхук, кнопку меню и описание бота.

import { pickQuiz, quizHtml, quizText, quizRows, QUESTION } from './quiz.js';

const CHANNEL = 'https://t.me/+K04B4CsLj8E1OTc6';
const HELLO =
  'В Коране больше 77 тысяч слов, но 76% текста складываются всего из 417 🤫 Одно только «сказал» во всех формах повторяется там 1618 раз, а «Господь» 975 раз. Поэтому, когда выучишь эти слова, на странице Корана уже будет много знакомого.\n\n' +
  'Учить их здесь можно по 10 за урок: сначала смотришь карточку с примером из аята, потом проходишь тест, а слова, которые забылись, бот покажет ещё раз.\n\n' +
  'Когда захочется большего, тут же можно учить наизусть любую суру вместе с одним из 14 чтецов и читать тафсир к каждому аяту. Всё это бесплатно, поэтому жми кнопку ниже и начнём с «Аль-Фатихи» 👇\n\n' +
  'Меня зовут Медина, и я собрала этот бот без знаний программирования с помощью нейросетей. Что ещё я делаю, рассказываю в своём канале: ' + CHANNEL + '\n\n' +
  'Нашли ошибку или хотите что-то предложить? Напишите прямо сюда, в этот чат, сообщение придёт мне.\n\n' +
  'Делитесь ссылкой на этот бот с теми, кому он пригодится: https://t.me/Koran_slovo_bot';
const DESCRIPTION =
  'Ассаляму алейкум! Добро пожаловать в тренажёр. Занимайся, учи слова Корана и получай свою награду. Нажми на кнопку ниже.\n\nБота создала Медина. Канал про вайб-кодинг: ' + CHANNEL;
const SHORT = 'Тренажёр слов Корана: 10 слов за урок, чтобы понимать текст при чтении.';
const BUTTON = 'Открыть тренажёр';

const ORIGINS = ['https://muslimsite.github.io', 'http://localhost:4321'];
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Проверка подписи Telegram: данные пришли из мини-приложения этого бота, а не от кого-то другого.
async function checkInitData(initData, token) {
  const p = new URLSearchParams(initData || '');
  const hash = p.get('hash');
  if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const enc = new TextEncoder();
  const hmac = async (key, data) => crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(data));
  const secret = await hmac(enc.encode('WebAppData'), token);
  if (hex(await hmac(secret, dcs)) !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 7 * 86400) return null;
  try { return JSON.parse(p.get('user')); } catch (e) { return null; }
}

// Учёт пользователей: только номер аккаунта Telegram, даты и сколько выучено. Имён и сообщений не храним.
async function touch(env, id, kind, words, hifz) {
  const s = kind === 'start' ? 1 : 0, o = kind === 'open' ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO users (user_id, first_seen, last_seen, starts, opens, words, hifz) VALUES (?1, datetime('now'), datetime('now'), ?4, ?5, ?2, ?3)
     ON CONFLICT(user_id) DO UPDATE SET last_seen = datetime('now'), starts = starts + ?4, opens = opens + ?5,
       words = MAX(words, ?2), hifz = MAX(hifz, ?3)`
  ).bind(id, words || 0, hifz || 0, s, o).run();
}

async function statsText(env) {
  const one = (sql) => env.DB.prepare(sql).first('n');
  const [all, today, week, actToday, actWeek, app, words, hifz, rem, daily, qToday, qOk, qWeek] = await Promise.all([
    one('SELECT COUNT(*) n FROM users'),
    one("SELECT COUNT(*) n FROM users WHERE first_seen >= date('now')"),
    one("SELECT COUNT(*) n FROM users WHERE first_seen >= date('now','-6 days')"),
    one("SELECT COUNT(*) n FROM users WHERE last_seen >= date('now')"),
    one("SELECT COUNT(*) n FROM users WHERE last_seen >= date('now','-6 days')"),
    one('SELECT COUNT(*) n FROM users WHERE opens > 0'),
    one('SELECT COUNT(*) n FROM users WHERE words > 0'),
    one('SELECT COUNT(*) n FROM users WHERE hifz > 0'),
    one('SELECT COUNT(*) n FROM reminders WHERE enabled = 1'),
    one('SELECT COUNT(*) n FROM daily WHERE enabled = 1'),
    one("SELECT COUNT(*) n FROM quiz_answers WHERE day >= date('now')"),
    one("SELECT COALESCE(SUM(correct), 0) n FROM quiz_answers WHERE day >= date('now')"),
    one("SELECT COUNT(DISTINCT user_id) n FROM quiz_answers WHERE day >= date('now','-6 days')"),
  ]);
  return '📊 Статистика «Калимы»\n\n' +
    `Всего пользователей: ${all}\n` +
    `Новых сегодня: ${today}, за 7 дней: ${week}\n` +
    `Заходили сегодня: ${actToday}, за 7 дней: ${actWeek}\n\n` +
    `Открывали приложение: ${app}\n` +
    `Учат слова: ${words}\n` +
    `Учат хифз: ${hifz}\n` +
    `Включили напоминания: ${rem}\n` +
    `Подписаны на слово дня: ${daily}\n\n` +
    `Ответов на тест сегодня: ${qToday}, верных: ${qOk}\n` +
    `Прошли тест за 7 дней: ${qWeek} чел.\n\n` +
    'Время по UTC (Москва на 3 часа больше).';
}

function reminderText(goal, learned) {
  return 'Ассаляму алейкум! Время хифза 🌿\n\n' +
    `Сегодня по плану ${goal} ${plural(goal, 'аят', 'аята', 'аятов')}.` +
    (learned ? ` Уже выучено аятов: ${learned}, машаАллах!` : '') +
    '\n\nОткрой хифз и послушай первый аят.';
}

async function secretOf(token) {
  // Секрет вебхука выводится из токена: отдельный ключ хранить не нужно.
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kalima-hook:' + token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function tgApi(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json());
}
function remindMarkup(env) {
  return { inline_keyboard: [[{ text: 'Открыть хифз', web_app: { url: env.APP_URL + '#hifz' } }]] };
}

// Человек недоступен: остановил бота или удалил аккаунт. Таким больше не пишем.
const gone = (res) => res.error_code === 403 || (res.error_code === 400 && /chat not found|deactivated/i.test(res.description || ''));

// Напоминание с тестом «Слово дня» на кнопках
async function sendReminder(env, chatId, goal, learned, tz) {
  const day = Math.floor((Date.now() - tz * 60000) / 86400000);
  return sendQuiz(env, chatId, pickQuiz(chatId, day), reminderText(goal, learned), remindMarkup(env));
}
// Виджет Telegram с 14.11.2026 отклоняет. Пробуем его только на аккаунте автора (таблица admins):
// если Telegram снова примет, автор увидит виджет в своём слове дня, остальным пока всегда кнопки.
async function sendQuiz(env, chatId, q, text, markup) {
  const admin = await env.DB.prepare('SELECT 1 n FROM admins WHERE user_id = ?1').bind(chatId).first('n').catch(() => null);
  if (admin) {
    const w = await tgApi(env, 'sendWidget', { chat_id: chatId, html: quizHtml(q), allow_queries: true, caption: text, reply_markup: markup });
    if (w.ok || gone(w)) return w;
    console.error('widget', w.error_code, w.description);
  }
  const res = await tgApi(env, 'sendMessage', {
    chat_id: chatId, text: quizText(q) + '\n\n' + text, parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [...quizRows(q), ...markup.inline_keyboard] },
  });
  if (!res.ok) console.error('quiz', res.error_code, res.description);
  return res;
}
// Ответ на тест: строка вопроса меняется на результат, кнопки вариантов убираются, остальные кнопки остаются
async function quizCallback(env, cq) {
  const answer = (text) => tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id, text });
  const [c, a] = cq.data.split(':').slice(1).map(Number);
  const m = cq.message;
  if (!m || !(a >= 0 && a <= 2)) return answer('');
  const rows = (m.reply_markup && m.reply_markup.inline_keyboard) || [];
  const isQuiz = (r) => r.some((b) => String(b.callback_data || '').startsWith('qz:'));
  const quiz = rows.filter(isQuiz), right = quiz[a] ? quiz[a][0].text : '';
  const ok = c === a;
  await env.DB.prepare("INSERT OR IGNORE INTO quiz_answers (user_id, message_id, day, correct) VALUES (?1, ?2, date('now'), ?3)").bind(cq.from.id, m.message_id, ok ? 1 : 0).run().catch((e) => console.error('quiz', e.message));
  await env.DB.prepare("DELETE FROM quiz_answers WHERE day < date('now', '-30 days')").run().catch(() => {});
  const text = m.text || '', i = text.indexOf(QUESTION);
  const line = ok ? `Верно, машаАллах! Это «${right}».` : `Правильный ответ: «${right}».`;
  await tgApi(env, 'editMessageText', {
    chat_id: m.chat.id, message_id: m.message_id,
    text: i < 0 ? text + '\n\n' + line : text.slice(0, i) + line + text.slice(i + QUESTION.length),
    entities: (m.entities || []).filter((e) => i < 0 || e.offset + e.length <= i),
    reply_markup: { inline_keyboard: rows.filter((r) => !isQuiz(r)) },
  });
  return answer(ok ? 'Верно!' : 'Неверно');
}

/* ---------- «Слово дня» ---------- */
const OFFER = 'Такое слово с выбором перевода бот может присылать каждый день в 9:00 по Москве. Присылать?';
const OFFER_ALL = 'Ассаляму алейкум!\n\n' + OFFER;
const DAILY_TEXT = 'Учить слова дальше можно в тренажёре.';
const SEND_LIMIT = 20; // за один запуск по расписанию: у бесплатного Cloudflare ограничено число запросов
const localMod = "(-tz) || ' minutes'";
const offerKeys = { inline_keyboard: [[{ text: 'Присылать каждый день', callback_data: 'daily:on' }, { text: 'Не надо', callback_data: 'daily:no' }]] };
const offKey = [{ text: 'Отключить слово дня', callback_data: 'daily:off' }];
const onKeys = { inline_keyboard: [[{ text: 'Присылать каждый день', callback_data: 'daily:on' }]] };
const dailyKeys = (env) => ({ inline_keyboard: [[{ text: BUTTON, web_app: { url: env.APP_URL } }], offKey] });
const dayNum = (tz) => Math.floor((Date.now() - tz * 60000) / 86400000);
const localDay = (tz) => new Date(Date.now() - tz * 60000).toISOString().slice(0, 10);

const sendWord = (env, chatId, tz, text, markup) => sendQuiz(env, chatId, pickQuiz(chatId, dayNum(tz)), text, markup);
// Включает или выключает подписку. Сегодняшний день считается закрытым: человек только что видел слово.
async function setDaily(env, id, on, tz) {
  const hasTz = Number.isFinite(tz);
  await env.DB.prepare(
    `INSERT INTO daily (user_id, enabled, pending, tz, last_day, updated) VALUES (?1, ?2, 0, ?3, date('now', (-?3) || ' minutes'), datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET enabled = ?2, pending = 0, tz = CASE WHEN ?4 THEN ?3 ELSE tz END,
       last_day = date('now', (-(CASE WHEN ?4 THEN ?3 ELSE tz END)) || ' minutes'), updated = datetime('now')`
  ).bind(id, on ? 1 : 0, hasTz ? tz : -180, hasTz ? 1 : 0).run();
}
// Предложение после /start: один раз и только если слово дня ещё не приходит
async function offerAfterStart(env, id) {
  const known = await env.DB.prepare('SELECT 1 n FROM daily WHERE user_id = ?1').bind(id).first('n');
  if (known) return;
  const rem = await env.DB.prepare('SELECT 1 n FROM reminders WHERE user_id = ?1 AND enabled = 1').bind(id).first('n');
  if (rem) return;
  await env.DB.prepare("INSERT OR IGNORE INTO daily (user_id, enabled, updated) VALUES (?1, 0, datetime('now'))").bind(id).run();
  await sendWord(env, id, -180, OFFER, offerKeys);
}
async function dailyCallback(env, cq) {
  const answer = (text) => tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id, text });
  // Неотвеченный тест в этом же сообщении не трогаем, меняем только кнопки подписки
  const quizKept = ((cq.message && cq.message.reply_markup && cq.message.reply_markup.inline_keyboard) || []).filter((r) => r.some((b) => String(b.callback_data || '').startsWith('qz:')));
  const keys = (reply_markup) => cq.message ? tgApi(env, 'editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [...quizKept, ...reply_markup.inline_keyboard] } }) : null;
  const a = cq.data.split(':')[1];
  if (a === 'on') {
    await setDaily(env, cq.from.id, true);
    await keys({ inline_keyboard: [offKey] });
    return answer('Готово, слово дня будет приходить каждый день');
  }
  await setDaily(env, cq.from.id, false);
  await keys(a === 'off' ? onKeys : { inline_keyboard: [] });
  return answer(a === 'off' ? 'Отключено. Включить снова можно в приложении' : 'Хорошо, присылать не буду');
}
// Тест сообщает об ответе. Считаем один ответ на сообщение, старше 30 дней не храним.
async function quizAnswer(env, wq) {
  const m = /^q:([01])$/.exec(wq.data || '');
  if (m && wq.message_id && wq.from) {
    await env.DB.prepare("INSERT OR IGNORE INTO quiz_answers (user_id, message_id, day, correct) VALUES (?1, ?2, date('now'), ?3)").bind(wq.from.id, wq.message_id, Number(m[1])).run().catch((e) => console.error('quiz', e.message));
    await env.DB.prepare("DELETE FROM quiz_answers WHERE day < date('now', '-30 days')").run().catch(() => {});
  }
  return tgApi(env, 'answerWidgetQuery', { widget_query_id: wq.id });
}
// Часть дневной нормы отправок: сначала слово дня подписчикам, потом разовое предложение
async function dailyRun(env, limit) {
  if (limit <= 0) return;
  const lm = localMod.replaceAll('tz', 'd.tz');
  const { results: due } = await env.DB.prepare(
    `SELECT d.user_id, d.tz FROM daily d LEFT JOIN reminders r ON r.user_id = d.user_id AND r.enabled = 1
     WHERE d.enabled = 1 AND r.user_id IS NULL AND (d.last_day IS NULL OR d.last_day <> date('now', ${lm}))
       AND CAST(strftime('%H', 'now', ${lm}) AS INTEGER) * 60 + CAST(strftime('%M', 'now', ${lm}) AS INTEGER) >= d.local_min
     LIMIT ?1`
  ).bind(limit).all();
  for (const d of due || []) {
    const res = await sendWord(env, d.user_id, d.tz, DAILY_TEXT, dailyKeys(env));
    if (res.ok) await env.DB.prepare('UPDATE daily SET last_day = ?1 WHERE user_id = ?2').bind(localDay(d.tz), d.user_id).run();
    else if (gone(res)) await env.DB.prepare('UPDATE daily SET enabled = 0 WHERE user_id = ?1').bind(d.user_id).run();
  }
  const left = limit - (due || []).length;
  if (left <= 0) return;
  const { results: wait } = await env.DB.prepare('SELECT user_id, tz FROM daily WHERE pending = 1 LIMIT ?1').bind(left).all();
  for (const d of wait || []) {
    await sendWord(env, d.user_id, d.tz, OFFER_ALL, offerKeys);
    await env.DB.prepare('UPDATE daily SET pending = 0 WHERE user_id = ?1').bind(d.user_id).run();
  }
}

export default {
  async scheduled(event, env) {
    const now = Date.now();
    const m = Math.floor(now / 60000) % 1440;
    const { results } = await env.DB.prepare(
      'SELECT * FROM reminders WHERE enabled = 1 AND ((utc_min > ?1 - 5 AND utc_min <= ?1) OR (?1 < 5 AND utc_min > ?1 + 1435))'
    ).bind(m).all();
    let sent = 0;
    for (const r of results || []) {
      const day = new Date(now - r.tz * 60000).toISOString().slice(0, 10);
      if (r.last_day === day) continue;
      const res = await sendReminder(env, r.user_id, r.goal, r.learned, r.tz);
      sent++;
      if (res.ok) await env.DB.prepare('UPDATE reminders SET last_day = ?1 WHERE user_id = ?2').bind(day, r.user_id).run();
      else if (gone(res)) await env.DB.prepare('UPDATE reminders SET enabled = 0 WHERE user_id = ?1').bind(r.user_id).run();
    }
    await dailyRun(env, SEND_LIMIT - sent);
  },

  async fetch(req, env) {
    const url = new URL(req.url);

    // Картинка аята: приложение присылает готовый JPEG, бот хранит его 2 дня (для истории Telegram) и шлёт в чат.
    const img = url.pathname.match(/^\/img\/([a-z0-9]{16})\.jpg$/);
    if (img && req.method === 'GET') {
      const buf = await env.IMG.get(img[1], 'arrayBuffer');
      if (!buf) return new Response('not found', { status: 404 });
      return new Response(buf, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=172800', 'access-control-allow-origin': '*' } });
    }
    if (url.pathname === '/api/share') {
      const origin = req.headers.get('Origin') || '';
      const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'content-type': 'application/json' };
      if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
      if (req.method !== 'POST') return new Response('{}', { status: 405, headers: cors });
      const body = await req.json().catch(() => ({}));
      const user = await checkInitData(body.initData, env.BOT_TOKEN);
      if (!user || !user.id) return new Response('{"ok":false,"error":"auth"}', { status: 401, headers: cors });
      const b64 = String(body.img || '').replace(/^data:image\/jpeg;base64,/, '');
      if (!b64 || b64.length > 4_000_000) return new Response('{"ok":false,"error":"size"}', { status: 413, headers: cors });
      let bytes;
      try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch (e) { return new Response('{"ok":false}', { status: 400, headers: cors }); }
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return new Response('{"ok":false,"error":"type"}', { status: 400, headers: cors });
      const id = hex(crypto.getRandomValues(new Uint8Array(8)));
      await env.IMG.put(id, bytes, { expirationTtl: 172800 });
      const link = `${url.origin}/img/${id}.jpg`;
      if (body.send) {
        const title = String(body.title || '').replace(/[^\p{L}\p{N} «»'’ -]/gu, '').slice(0, 40);
        const ayah = Math.max(1, Math.min(286, Number(body.a) || 1));
        const me = await tgApi(env, 'getMe', {});
        const bot = me.ok ? '@' + me.result.username : '';
        const res = await tgApi(env, 'sendPhoto', {
          chat_id: user.id, photo: link,
          caption: `«${title}», аят ${ayah}\n\nСохрани картинку и выложи в статус или историю.\nТренажёр слов Корана «Калима»: ${bot}`,
        });
        if (!res.ok) return new Response(JSON.stringify({ ok: false, error: 'send', url: link }), { status: 502, headers: cors });
      }
      return new Response(JSON.stringify({ ok: true, url: link }), { headers: cors });
    }

    if (url.pathname === '/api/seen') {
      const origin = req.headers.get('Origin') || '';
      const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'content-type': 'application/json' };
      if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
      if (req.method !== 'POST') return new Response('{}', { status: 405, headers: cors });
      const body = await req.json().catch(() => ({}));
      const user = await checkInitData(body.initData, env.BOT_TOKEN);
      if (!user || !user.id) return new Response('{"ok":false}', { status: 401, headers: cors });
      await touch(env, user.id, 'open', Math.max(0, Math.min(5000, Number(body.words) || 0)), Math.max(0, Math.min(6236, Number(body.hifz) || 0)));
      const daily = await env.DB.prepare('SELECT enabled n FROM daily WHERE user_id = ?1').bind(user.id).first('n');
      return new Response(JSON.stringify({ ok: true, daily: !!daily }), { headers: cors });
    }

    if (url.pathname === '/api/daily') {
      const origin = req.headers.get('Origin') || '';
      const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'content-type': 'application/json' };
      if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
      if (req.method !== 'POST') return new Response('{}', { status: 405, headers: cors });
      const body = await req.json().catch(() => ({}));
      const user = await checkInitData(body.initData, env.BOT_TOKEN);
      if (!user || !user.id) return new Response('{"ok":false}', { status: 401, headers: cors });
      await setDaily(env, user.id, !!body.on, Math.max(-840, Math.min(840, Number(body.tz) || 0)));
      return new Response('{"ok":true}', { headers: cors });
    }

    if (url.pathname === '/api/remind') {
      const origin = req.headers.get('Origin') || '';
      const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'content-type': 'application/json' };
      if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
      if (req.method !== 'POST') return new Response('{}', { status: 405, headers: cors });
      const body = await req.json().catch(() => ({}));
      const user = await checkInitData(body.initData, env.BOT_TOKEN);
      if (!user || !user.id) return new Response(JSON.stringify({ ok: false, error: 'auth' }), { status: 401, headers: cors });
      const goal = Math.max(1, Math.min(50, Number(body.goal) || 3));
      const learned = Math.max(0, Math.min(6236, Number(body.learned) || 0));
      if (body.progressOnly) {
        await env.DB.prepare('UPDATE reminders SET learned = ?1, goal = ?2 WHERE user_id = ?3').bind(learned, goal, user.id).run();
        return new Response('{"ok":true}', { headers: cors });
      }
      const utcMin = ((Number(body.utcMin) % 1440) + 1440) % 1440;
      const tz = Math.max(-840, Math.min(840, Number(body.tz) || 0));
      await env.DB.prepare(
        `INSERT INTO reminders (user_id, enabled, utc_min, tz, goal, learned, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET enabled = ?2, utc_min = ?3, tz = ?4, goal = ?5, learned = ?6, updated = datetime('now')`
      ).bind(user.id, body.enabled ? 1 : 0, utcMin, tz, goal, learned).run();
      if (body.test) await sendReminder(env, user.id, goal, learned, tz);
      return new Response('{"ok":true}', { headers: cors });
    }
    if (!env.BOT_TOKEN) return new Response('Нет секрета BOT_TOKEN. Выполните: npx wrangler secret put BOT_TOKEN', { status: 500 });

    const api = (method, body) =>
      fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json());
    const secret = await secretOf(env.BOT_TOKEN);
    const openBtn = { inline_keyboard: [[{ text: BUTTON, web_app: { url: env.APP_URL } }], [{ text: 'Канал Медины', url: CHANNEL }]] };

    if (url.pathname === '/me') {
      const me = await api('getMe', {});
      return new Response(me.ok ? '@' + me.result.username : 'Ошибка', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    if (url.pathname === '/setup') {
      const out = {
        webhook: await api('setWebhook', { url: `${url.origin}/hook`, secret_token: secret, allowed_updates: ['message', 'callback_query', 'widget_query'], drop_pending_updates: true }),
        menu: await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Учить слова', web_app: { url: env.APP_URL } } }),
        description: await api('setMyDescription', { description: DESCRIPTION }),
        short: await api('setMyShortDescription', { short_description: SHORT }),
        commands: await api('setMyCommands', { commands: [{ command: 'start', description: 'Открыть тренажёр' }] }),
      };
      const ok = Object.values(out).every((r) => r && r.ok);
      return new Response(ok ? 'Бот настроен.' : 'Ошибка: ' + JSON.stringify(out), { status: ok ? 200 : 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    if (url.pathname === '/hook' && req.method === 'POST') {
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return new Response('forbidden', { status: 403 });
      const update = await req.json().catch(() => null);
      const wq = update && update.widget_query;
      if (wq) { await quizAnswer(env, wq); return new Response('ok'); }
      const cq = update && update.callback_query;
      if (cq && typeof cq.data === 'string' && cq.data.startsWith('daily:')) { await dailyCallback(env, cq); return new Response('ok'); }
      if (cq && typeof cq.data === 'string' && cq.data.startsWith('qz:')) { await quizCallback(env, cq); return new Response('ok'); }
      const msg = update && update.message;
      if (msg && msg.chat) {
        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
        const isStart = text.startsWith('/start');
        const uid = msg.from && msg.from.id;
        if (uid && msg.chat.type === 'private') await touch(env, uid, isStart ? 'start' : 'msg', 0, 0).catch(() => {});
        if (text.startsWith('/stats')) {
          // Статистику видит только автор. Автор подключается один раз: /stats КОД (код хранится секретом STATS_CODE).
          const code = text.split(/\s+/)[1];
          if (code && env.STATS_CODE && code === env.STATS_CODE && uid) await env.DB.prepare('INSERT OR IGNORE INTO admins (user_id) VALUES (?1)').bind(uid).run();
          const isAdmin = uid && (await env.DB.prepare('SELECT 1 n FROM admins WHERE user_id = ?1').bind(uid).first('n'));
          await api('sendMessage', { chat_id: msg.chat.id, text: isAdmin ? await statsText(env) : 'Эта команда только для автора бота.' });
          return new Response('ok');
        }
        // Переписка с автором: сообщения людей приходят автору, ответ автора уходит человеку.
        if (uid && msg.chat.type === 'private' && !isStart) {
          const mine = await env.DB.prepare('SELECT 1 n FROM admins WHERE user_id = ?1').bind(uid).first('n');
          if (mine) {
            const orig = msg.reply_to_message;
            const row = orig && await env.DB.prepare('SELECT user_id FROM feedback WHERE admin_id = ?1 AND admin_msg_id = ?2').bind(uid, orig.message_id).first();
            if (!row) {
              await api('sendMessage', { chat_id: msg.chat.id, text: orig ? 'Не нашла, кому это отправить. Ответьте именно на сообщение человека или на подпись над ним.' : 'Чтобы ответить человеку, нажмите на его сообщение и выберите «Ответить».' });
              return new Response('ok');
            }
            const sent = text
              ? await api('sendMessage', { chat_id: row.user_id, text: 'Ответ от Медины:\n\n' + msg.text })
              : await api('copyMessage', { chat_id: row.user_id, from_chat_id: msg.chat.id, message_id: msg.message_id });
            await api('sendMessage', { chat_id: msg.chat.id, reply_to_message_id: msg.message_id, text: sent.ok ? 'Отправлено.' : sent.error_code === 403 ? 'Не доставлено: человек остановил бота.' : 'Не получилось отправить, попробуйте ещё раз.' });
            return new Response('ok');
          }
          if (!text.startsWith('/')) {
            const { results: admins } = await env.DB.prepare('SELECT user_id FROM admins').all();
            let delivered = false;
            const who = [[msg.from.first_name, msg.from.last_name].filter(Boolean).join(' '), msg.from.username ? '@' + msg.from.username : ''].filter(Boolean).join(', ');
            for (const a of admins || []) {
              const head = await api('sendMessage', { chat_id: a.user_id, text: `Сообщение от: ${who || 'без имени'}\nЧтобы ответить, нажмите «Ответить» на этом сообщении или на следующем.` });
              const copy = await api('copyMessage', { chat_id: a.user_id, from_chat_id: msg.chat.id, message_id: msg.message_id });
              for (const r of [head, copy]) {
                const id = r.ok && r.result.message_id;
                if (id) await env.DB.prepare("INSERT OR REPLACE INTO feedback (admin_id, admin_msg_id, user_id, created) VALUES (?1, ?2, ?3, datetime('now'))").bind(a.user_id, id, uid).run();
              }
              if (copy.ok) delivered = true;
            }
            await api('sendMessage', { chat_id: msg.chat.id, text: delivered ? 'Сообщение получено, Медина его прочитает. Ответ придёт сюда, в этот чат.' : 'Сейчас не получилось передать сообщение, попробуйте позже.', reply_markup: openBtn });
            return new Response('ok');
          }
        }
        await api('sendMessage', {
          chat_id: msg.chat.id,
          text: isStart ? HELLO : 'Чтобы заниматься, нажми на кнопку ниже.',
          reply_markup: openBtn,
          link_preview_options: { is_disabled: true },
        });
        if (isStart && uid && msg.chat.type === 'private') await offerAfterStart(env, uid).catch((e) => console.error('offer', e.message));
      }
      return new Response('ok');
    }

    return new Response('Калима: бот работает.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
