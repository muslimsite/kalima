CREATE TABLE IF NOT EXISTS reminders (
  user_id INTEGER PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  utc_min INTEGER NOT NULL,      -- минута суток по UTC, когда напомнить
  tz INTEGER NOT NULL DEFAULT 0, -- смещение часового пояса в минутах (как getTimezoneOffset)
  goal INTEGER NOT NULL DEFAULT 3,
  learned INTEGER NOT NULL DEFAULT 0,
  last_day TEXT,                 -- местная дата последнего напоминания
  updated TEXT
);

-- Учёт пользователей для команды /stats: только номер аккаунта, даты и сколько выучено
CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  starts INTEGER NOT NULL DEFAULT 0, -- сколько раз нажимала «Старт»
  opens INTEGER NOT NULL DEFAULT 0,  -- сколько раз открывала приложение
  words INTEGER NOT NULL DEFAULT 0,  -- слов в изучении
  hifz INTEGER NOT NULL DEFAULT 0    -- выученных аятов
);
-- Кто видит /stats (автор подключается командой /stats КОД)
CREATE TABLE IF NOT EXISTS admins (user_id INTEGER PRIMARY KEY);

-- Сообщения автору: какой пересланный автору пост от какого человека, чтобы ответ ушёл ему. Текст не хранится.
CREATE TABLE IF NOT EXISTS feedback (
  admin_id INTEGER NOT NULL,
  admin_msg_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created TEXT NOT NULL,
  PRIMARY KEY (admin_id, admin_msg_id)
);

-- «Слово дня»: только те, кому бот предлагал подписку или кто её включил
CREATE TABLE IF NOT EXISTS daily (
  user_id INTEGER PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0, -- 1, если человек согласился получать
  pending INTEGER NOT NULL DEFAULT 0, -- 1, если предложение ждёт отправки в разовой рассылке
  tz INTEGER NOT NULL DEFAULT -180,   -- смещение часового пояса (как getTimezoneOffset), по умолчанию Москва
  local_min INTEGER NOT NULL DEFAULT 540, -- минута суток по местному времени, 540 = 9:00
  last_day TEXT,                      -- местная дата последнего слова
  updated TEXT
);
