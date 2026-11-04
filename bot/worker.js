// Бот «Калима» на Cloudflare Workers.
// /start → приветствие с кнопкой, которая открывает мини-приложение.
// /setup → один раз подключает вебхук, кнопку меню и описание бота.

const CHANNEL = 'https://t.me/+K04B4CsLj8E1OTc6';
const HELLO =
  'Ассаляму алейкум, сестра!\n\n' +
  'Рада видеть тебя в тренажёре «Калима». Занимайся, учи слова Корана и получай свою награду.\n\n' +
  'Нажми на кнопку ниже.\n\n' +
  'Этот бот создала Медина.\n\n' +
  'Мой канал про вайб-кодинг: ' + CHANNEL + '\n' +
  'Показываю, что делаю в своих проектах: сайты, боты, мини-приложения и всё, что можно собрать с нейросетями без знания программирования. Заходите, сёстры, там много полезного 🌿';
const DESCRIPTION =
  'Ассаляму алейкум, сестра! Рада видеть тебя в тренажёре. Занимайся, учи слова Корана и получай свою награду. Нажми на кнопку ниже.\n\nБота создала Медина. Канал про вайб-кодинг: ' + CHANNEL;
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

function reminderText(goal, learned) {
  return 'Ассаляму алейкум! Время хифза 🌿\n\n' +
    `Сегодня по плану ${goal} ${plural(goal, 'аят', 'аята', 'аятов')}.` +
    (learned ? ` Ты уже выучила ${learned} ${plural(learned, 'аят', 'аята', 'аятов')}, машаАллах!` : '') +
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

export default {
  async scheduled(event, env) {
    const now = Date.now();
    const m = Math.floor(now / 60000) % 1440;
    const { results } = await env.DB.prepare(
      'SELECT * FROM reminders WHERE enabled = 1 AND ((utc_min > ?1 - 5 AND utc_min <= ?1) OR (?1 < 5 AND utc_min > ?1 + 1435))'
    ).bind(m).all();
    for (const r of results || []) {
      const day = new Date(now - r.tz * 60000).toISOString().slice(0, 10);
      if (r.last_day === day) continue;
      const res = await tgApi(env, 'sendMessage', { chat_id: r.user_id, text: reminderText(r.goal, r.learned), reply_markup: remindMarkup(env) });
      if (res.ok) await env.DB.prepare('UPDATE reminders SET last_day = ?1 WHERE user_id = ?2').bind(day, r.user_id).run();
      else if (res.error_code === 403) await env.DB.prepare('UPDATE reminders SET enabled = 0 WHERE user_id = ?1').bind(r.user_id).run();
    }
  },

  async fetch(req, env) {
    const url = new URL(req.url);

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
      if (body.test) await tgApi(env, 'sendMessage', { chat_id: user.id, text: reminderText(goal, learned), reply_markup: remindMarkup(env) });
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
        webhook: await api('setWebhook', { url: `${url.origin}/hook`, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true }),
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
      const msg = update && update.message;
      if (msg && msg.chat) {
        const isStart = typeof msg.text === 'string' && msg.text.startsWith('/start');
        await api('sendMessage', {
          chat_id: msg.chat.id,
          text: isStart ? HELLO : 'Чтобы заниматься, нажми на кнопку ниже.',
          reply_markup: openBtn,
          link_preview_options: { is_disabled: true },
        });
      }
      return new Response('ok');
    }

    return new Response('Калима: бот работает.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
