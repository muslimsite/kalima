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
