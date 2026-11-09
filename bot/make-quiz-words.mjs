// Собирает компактный список слов для теста в напоминании: node bot/make-quiz-words.mjs
// Запускать после правок в data/words.json, затем деплоить бота.
import { readFileSync, writeFileSync } from 'node:fs';

const d = JSON.parse(readFileSync(new URL('../data/words.json', import.meta.url)));
const POS = ['существительное', 'прилагательное', 'глагол'];
const first = (ru) => String(ru).split(/[,;]/)[0].trim();
// Служебные слова и имя Аллаха в тесте на перевод слишком просты, берём только смысловые
const rows = Object.values(d.words)
  .filter((w) => POS.includes(w.pos))
  .sort((a, b) => b.freq - a.freq)
  .map((w) => [w.ar, w.translit, first(w.ru), POS.indexOf(w.pos), w.root || '']);
writeFileSync(new URL('./quiz-words.js', import.meta.url), '// Создан make-quiz-words.mjs из data/words.json: [арабский, транслит, перевод, часть речи, корень]\nexport default ' + JSON.stringify(rows) + ';\n');
console.log('слов:', rows.length);
