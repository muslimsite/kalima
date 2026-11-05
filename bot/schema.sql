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
