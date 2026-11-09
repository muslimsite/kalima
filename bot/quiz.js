// Мини-тест «Слово дня»: виджет Telegram внутри напоминания (Bot API 10.4, sendWidget).
// Лимит виджета: 32 КБ HTML и 4 КБ после сжатия. Сети внутри нет, всё нужное лежит в самом HTML.
import WORDS from './quiz-words.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// У каждого человека слова идут подряд по кругу и не повторяются, пока список не кончится
export function pickQuiz(userId, day) {
  const i = (Math.abs(Number(userId)) + day) % WORDS.length, w = WORDS[i];
  let seed = (i * 31 + day) >>> 0;
  const rnd = (n) => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed >>> 8) % n; };
  // Неверные варианты: другой перевод и другой корень. Среди прилагательных много близких по смыслу
  // («Знающий», «Ведающий»), поэтому к ним берём существительные, чтобы правильный ответ был один.
  const kind = w[3] === 1 ? 0 : w[3];
  const pool = WORDS.filter((x) => x !== w && x[3] === kind && x[2] !== w[2] && (!w[4] || x[4] !== w[4]));
  const wrong = [];
  while (wrong.length < 2) {
    const r = pool[rnd(pool.length)][2];
    if (!wrong.includes(r)) wrong.push(r);
  }
  const a = rnd(3), o = [...wrong];
  o.splice(a, 0, w[2]);
  return { ar: w[0], tr: w[1], o, a };
}

export function quizHtml(q) {
  return `<style>
body{margin:0;padding:12px}
p{margin:0}
.l{color:var(--tg-theme-hint-color);font-size:.9em}
.a{font:2.2em/1.7 serif;text-align:center}
.t{color:var(--tg-theme-hint-color);text-align:center;margin-bottom:8px}
button{display:block;width:100%;margin-top:6px}
.y{background:var(--tg-theme-button-color);color:var(--tg-theme-button-text-color)}
.n{color:var(--tg-theme-destructive-text-color)}
#r{margin-top:10px;font-weight:600}
</style>
<p class="l">Слово дня: что оно значит?</p>
<p class="a" lang="ar" dir="rtl">${esc(q.ar)}</p>
<p class="t">${esc(q.tr)}</p>
<div>${q.o.map((t) => `<button>${esc(t)}</button>`).join('')}</div>
<p id="r"></p>
<script>
var A=${q.a},B=[].slice.call(document.querySelectorAll('button')),T=window.TelegramWidget;
function show(i){
B.forEach(function(b,j){b.disabled=true;if(j==A)b.className='y';else if(j==i)b.className='n'});
document.getElementById('r').textContent=i==A?'Верно, машаАллах!':'Правильный ответ: '+B[A].textContent;
}
B.forEach(function(b,i){b.addEventListener('click',function(){
try{localStorage.setItem('c',i)}catch(e){}
if(T&&T.HapticFeedback)T.HapticFeedback.notificationOccurred(i==A?'success':'error');
show(i)
})});
var c=null;try{c=localStorage.getItem('c')}catch(e){}
if(c!==null)show(+c);
</script>`;
}

// Запасной текст, если Telegram не принял виджет: перевод скрыт, открывается нажатием
export function quizFallback(q) {
  return `Слово дня: ${esc(q.ar)} (${esc(q.tr)})\nПеревод: <tg-spoiler>${esc(q.o[q.a])}</tg-spoiler>`;
}
