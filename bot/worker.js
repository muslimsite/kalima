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

async function secretOf(token) {
  // Секрет вебхука выводится из токена: отдельный ключ хранить не нужно.
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kalima-hook:' + token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!env.BOT_TOKEN) return new Response('Нет секрета BOT_TOKEN. Выполните: npx wrangler secret put BOT_TOKEN', { status: 500 });

    const api = (method, body) =>
      fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json());
    const secret = await secretOf(env.BOT_TOKEN);
    const openBtn = { inline_keyboard: [[{ text: BUTTON, web_app: { url: env.APP_URL } }], [{ text: 'Канал Медины', url: CHANNEL }]] };

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
