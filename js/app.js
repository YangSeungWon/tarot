import { CARDS, SPREADS } from './cards.js';

const $ = (s, r = document) => r.querySelector(s);
const ROMAN = ['0','I','II','III','IV','V','VI','VII','VIII','IX','X',
               'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI'];
const SUIT_KO = { wands:'완드', cups:'컵', swords:'소드', pents:'펜타클' };
const SPREAD_ORDER = ['one','three','celtic'];
const LOG_KEY = 'tarot.log.v1';
const LOG_MAX = 20;

const el = {
  fan: $('#fan'), scroll: $('#fan-scroll'), swipe: $('#fan-swipe'),
  hint: $('#fan-hint'), counter: $('#counter'),
  board: $('#board'), reading: $('#reading'), actions: $('#actions'),
  toast: $('#toast'),
  log: $('#log'), logList: $('#log-list'),
  shuffleBtn: $('#btn-shuffle'), autoBtn: $('#btn-auto'),
};

let state = { key:'one', deck:[], drawn:[], done:false, busy:false, auto:false };

/* ── 덱 ──────────────────────────────────────────────────── */
// 섞기 = 78개 자리에 78장을 배치하는 일. 한 번 섞으면 어느 자리에
// 무엇이 어느 방향으로 놓였는지가 전부 결정되고, 뽑을 때 바뀌지 않습니다.
function shuffled() {
  const a = CARDS.map((_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  const flips = new Uint8Array(a.length);
  crypto.getRandomValues(flips);
  return a.map((idx, i) => ({ idx, rev: flips[i] < 96 }));  // 역방향 약 37%
}

function label(card) {
  return card.arcana === 'major'
    ? ROMAN[card.num]
    : `${SUIT_KO[card.suit]} · ${card.num <= 10 ? card.num : ['페이지','나이트','퀸','킹'][card.num - 11]}`;
}

/* ── 부채꼴 덱 ───────────────────────────────────────────────
   78장을 전부 펼칩니다. 카드는 자기 중심을 축으로 회전하고,
   호 위의 자리는 평행이동(--tx/--ty)으로 잡습니다. 이렇게 두면
   섞는 동작(모으기·자르기)과 펼친 상태 사이가 그대로 보간됩니다.
   ──────────────────────────────────────────────────────────── */
const THETA   = () => (window.innerWidth < 760 ? 14 : 26);   // 부채 반각(도)
const MIN_GAP = () => (window.innerWidth < 760 ? 11 : 14);   // 카드 한 장이 보이는 최소 폭
const rad = deg => deg * Math.PI / 180;
const wait = ms => new Promise(r => setTimeout(r, ms));
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// cardW/cardH는 CSS의 clamp()·calc() 결과라 커스텀 속성으로는 못 읽습니다.
// 실제로 놓인 카드의 레이아웃 크기(transform 이전 값)를 재서 씁니다.
function fanGeometry(n, cardW, cardH, avail) {
  const t = rad(THETA());
  // 양 끝 카드는 기울어져 있어 제 폭보다 옆으로 더 튀어나옵니다.
  const overhang = (cardW / 2) * Math.cos(t) + (cardH / 2) * Math.sin(t) - cardW / 2;
  const gap = Math.max(MIN_GAP(), (avail - 2 * overhang - cardW) / (n - 1));
  const spread = gap * (n - 1);            // 양 끝 카드 중심 사이 거리
  const d = spread / (2 * Math.sin(t));    // 호의 반지름
  // 뽑을 때 들어올린 카드가 잘리지 않도록 윗여백을 잡습니다(--draw-lift + 회전 여유).
  const top = window.innerWidth < 760 ? 54 : 72;
  const sag = d * (1 - Math.cos(t))                // 끝으로 갈수록 내려앉는 양
            + (cardH / 2) * Math.cos(t) + (cardW / 2) * Math.sin(t) - cardH / 2;

  return { d, top, width: spread + cardW + 2 * overhang, height: top + cardH + sag,
           stackY: (sag - top) / 2 };   // 모았을 때 한 벌이 세로 가운데 오도록
}

// 자리 i의 각도와 평행이동. 중심축 회전 + 이동으로 호 위의 위치를 만듭니다.
function seat(i, n, d) {
  const th = THETA();
  const a = -th + (2 * th / (n - 1)) * i;
  const r = rad(a);
  return { a, tx: d * Math.sin(r), ty: d * (1 - Math.cos(r)) };
}

function applySeats() {
  const n = CARDS.length;
  const cards = [...el.fan.children];
  if (!cards.length) return;
  const avail = el.scroll.clientWidth - 8;
  const g = fanGeometry(n, cards[0].offsetWidth, cards[0].offsetHeight, avail);
  el.fan.style.width = g.width + 'px';
  el.fan.style.height = g.height + 'px';
  el.fan.style.setProperty('--fan-top', g.top + 'px');
  el.fan.style.setProperty('--stack-y', g.stackY.toFixed(1) + 'px');
  cards.forEach((b, i) => {
    const p = seat(i, n, g.d);
    b.style.setProperty('--a', p.a.toFixed(3) + 'deg');
    b.style.setProperty('--tx', p.tx.toFixed(2) + 'px');
    b.style.setProperty('--ty', p.ty.toFixed(2) + 'px');
  });
  el.scroll.scrollLeft = (el.scroll.scrollWidth - el.scroll.clientWidth) / 2;
  el.swipe.hidden = el.scroll.scrollWidth <= el.scroll.clientWidth + 1;
}

function renderFan() {
  const n = CARDS.length;
  el.fan.innerHTML = '';
  el.fan.className = 'fan';

  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fan-card';
    b.dataset.n = i;
    b.style.setProperty('--z', i);
    b.style.setProperty('--d', (i * 5) + 'ms');    // 첫 펼침 시차
    b.style.setProperty('--sd', (i * 5) + 'ms');   // 섞은 뒤 펼침 시차
    b.setAttribute('aria-label', `왼쪽에서 ${i + 1}번째 카드 뽑기`);
    b.innerHTML = '<svg><use href="#cardback"/></svg>';
    b.addEventListener('click', e => take(b, e));
    frag.appendChild(b);
  }
  el.fan.appendChild(frag);
  applySeats();
}

const LIFT_MS = () => (calm() ? 260 : 380);

// 카드가 빠져나가는 동안 hover를 잠급니다. 포인터가 실제로 움직이면 풀립니다.
let hoverArmed = null;
function holdHover(ev) {
  el.fan.classList.add('no-hover');
  if (hoverArmed) el.fan.removeEventListener('pointermove', hoverArmed);
  const from = ev ? { x: ev.clientX, y: ev.clientY } : null;
  hoverArmed = e => {
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 8) return;
    el.fan.classList.remove('no-hover');
    el.fan.removeEventListener('pointermove', hoverArmed);
    hoverArmed = null;
  };
  el.fan.addEventListener('pointermove', hoverArmed);
}

function take(btn, ev) {
  if (state.done || state.busy || btn.classList.contains('is-drawing')) return;
  const total = SPREADS[state.key].positions.length;
  if (state.drawn.length >= total) return;
  // 카드는 섞는 순간 자리마다 확정됩니다. 여기서 새로 뽑는 것이 아니라,
  // 그 자리에 놓여 있던 장을 그대로 가져옵니다.
  const pick = state.deck[+btn.dataset.n];
  if (!pick) return;

  holdHover(ev);                         // 커서 밑 카드가 저절로 뜨지 않게
  btn.classList.add('is-drawing');       // 호에서 한 장을 들어 세우고
  state.drawn.push(pick);
  const at = state.drawn.length - 1;
  syncCounter();

  setTimeout(() => {                     // 배치판으로 넘깁니다
    btn.classList.add('is-taken');
    fill(at, pick);
    if (at + 1 === total) finish();
  }, LIFT_MS());
}

// 남은 자리를 무작위로 골라 차례차례 뽑습니다. 고르는 자리도 진짜 무작위입니다.
async function autoDraw() {
  const total = SPREADS[state.key].positions.length;
  if (state.auto || state.busy || state.done || state.drawn.length >= total) return;
  state.auto = true;
  el.autoBtn.disabled = true;
  el.shuffleBtn.disabled = true;
  el.fan.classList.add('is-busy');

  while (state.drawn.length < total) {
    const free = [...el.fan.children].filter(b => !b.classList.contains('is-drawing'));
    if (!free.length) break;
    take(free[crypto.getRandomValues(new Uint32Array(1))[0] % free.length]);
    await wait(calm() ? 300 : 340);
  }
  await wait(LIFT_MS() + 40);

  el.fan.classList.remove('is-busy');
  state.auto = false;
  el.shuffleBtn.disabled = false;
}

/* ── 섞기 ────────────────────────────────────────────────────
   모으기 → 자르기 → 펼치기. 리더가 실제로 덱을 다루는 순서입니다.
   자르는 지점은 매번 새로 정합니다.
   ──────────────────────────────────────────────────────────── */
function markStack(cutAt) {
  const n = CARDS.length;
  [...el.fan.children].forEach((b, i) => {
    // 78장이 한 벌로 포개진 두께. 위로 갈수록 조금씩 밀려 올라가고,
    // 거기에 손으로 모은 만큼의 미세한 흐트러짐을 더합니다.
    const lean = i / (n - 1);
    b.style.setProperty('--jx', (lean * 5.5 - 2.75 + (((i * 37) % 5) - 2) * 0.35).toFixed(2) + 'px');
    b.style.setProperty('--jy', (3.6 - lean * 7.2 + (((i * 53) % 5) - 2) * 0.3).toFixed(2) + 'px');
    b.style.setProperty('--jr', (lean * 1.2 - 0.6 + (((i * 29) % 7) - 3) * 0.12).toFixed(2) + 'deg');
    // 윗뭉치를 덜어 오른쪽에 내려놓습니다
    const upper = i >= cutAt;
    b.style.setProperty('--cx', (upper ? 80 : -80) + 'px');
    b.style.setProperty('--cy', (upper ? -12 : 5) + 'px');
    b.dataset.upper = upper ? '1' : '';
  });
  return n;
}

async function shuffleDeck() {
  if (state.busy) return;
  state.busy = true;
  el.shuffleBtn.disabled = true;
  history.replaceState(null, '', location.pathname + location.search);

  // 판을 비웁니다
  state.drawn = [];
  state.done = false;
  el.reading.innerHTML = '';
  el.actions.hidden = true;
  renderBoard();
  el.fan.classList.remove('is-done', 'no-hover');
  [...el.fan.children].forEach(b => b.classList.remove('is-taken', 'is-drawing'));

  el.hint.textContent = '덱을 섞는 중';
  el.fan.classList.add('is-busy');
  const n = CARDS.length;

  // 동작 줄이기 설정에서는 옮기는 대신 밝기로 같은 이야기를 합니다.
  // 덱 전체가 한 번 어두워졌다가, 왼쪽부터 차례로 되살아납니다.
  if (calm()) {
    el.fan.classList.add('s-gather');
    await wait(500);
    state.deck = shuffled();
    [...el.fan.children].forEach((b, i) => { b.style.setProperty('--z', i); });
    el.fan.classList.add('s-spread');
    el.fan.classList.remove('s-gather');
    await wait(n * 5 + 420);
    el.fan.classList.remove('s-spread');
    finishShuffle();
    return;
  }

  const cutAt = 26 + (crypto.getRandomValues(new Uint32Array(1))[0] % 27);  // 26~52
  markStack(cutAt);

  el.fan.classList.add('s-gather');            // 1. 모으기
  await wait(640);
  el.fan.classList.add('s-cut');               // 2. 자르기 — 갈라놓고
  await wait(560);
  // 두 뭉치가 떨어져 있는 동안 위아래를 맞바꿉니다 (겹치지 않아 티가 안 납니다)
  [...el.fan.children].forEach((b, i) => {
    b.style.setProperty('--z', b.dataset.upper ? i - cutAt : i + (n - cutAt));
  });
  el.fan.classList.remove('s-cut');            //    다시 한 벌로 포개고
  await wait(560);

  state.deck = shuffled();
  [...el.fan.children].forEach((b, i) => { b.style.setProperty('--z', i); });
  el.fan.classList.add('s-spread');            // 3. 펼치기
  el.fan.classList.remove('s-gather');
  await wait(n * 5 + 640);
  el.fan.classList.remove('s-spread');
  finishShuffle();
}

function finishShuffle() {
  el.fan.classList.remove('is-busy');
  el.shuffleBtn.disabled = false;
  el.autoBtn.disabled = false;
  el.hint.innerHTML = '덱에서 카드를 고르세요 <b id="counter"></b>';
  el.counter = $('#counter');
  syncCounter();
  state.busy = false;
}

/* ── 배치판 ─────────────────────────────────────────────── */
function renderBoard() {
  const spread = SPREADS[state.key];
  el.board.dataset.spread = state.key;
  el.board.innerHTML = spread.positions.map((pos, i) => `
    <div class="slot" data-i="${i}">
      <span class="slot-label">${String(i + 1).padStart(2, '0')} <i>${pos}</i></span>
      <div class="slot-frame">
        <div class="card-wrap">
          <div class="card">
            <div class="card-face card-back"><svg><use href="#cardback"/></svg></div>
            <div class="card-face card-front"></div>
          </div>
        </div>
      </div>
      <p class="slot-caption"></p>
    </div>`).join('');
}

function fill(i, pick) {
  const card = CARDS[pick.idx];
  const slot = el.board.querySelector(`.slot[data-i="${i}"]`);
  const front = $('.card-front', slot);
  front.classList.toggle('is-rev', pick.rev);
  front.innerHTML =
    `<img src="assets/cards/${card.id}.webp" alt="${card.ko}" loading="lazy" decoding="async">`;
  $('.slot-caption', slot).innerHTML =
    `${card.ko}${pick.rev ? '<em>역방향</em>' : ''}`;
  // 빈 자리에 카드가 먼저 놓이고(뒷면), 잠시 뒤 뒤집힙니다.
  requestAnimationFrame(() => slot.classList.add('is-placing'));
  setTimeout(() => slot.classList.add('is-filled'), 340);
  // 켈틱 크로스의 2번은 1번 위에 가로로 놓이므로 이름을 1번 캡션에 덧붙입니다.
  if (state.key === 'celtic' && i === 1) {
    const first = $('.slot[data-i="0"] .slot-caption', el.board);
    first.insertAdjacentHTML('beforeend',
      `<span class="cross-note">가로지름 · 장애물<br><b>${card.ko}</b>${pick.rev ? ' <i>역</i>' : ''}</span>`);
  }
}

/* ── 해석 ───────────────────────────────────────────────── */
function renderReading() {
  const spread = SPREADS[state.key];
  el.reading.innerHTML = `
    <div class="reading-head"><h2 class="sec-title">${spread.name} 해석</h2></div>
    ` + state.drawn.map((pick, i) => {
      const c = CARDS[pick.idx];
      return `<article class="entry">
        <div><img class="entry-thumb${pick.rev ? ' is-rev' : ''}"
             src="assets/cards/${c.id}.webp" alt="${c.ko}" loading="lazy"></div>
        <div>
          <p class="entry-pos">${String(i + 1).padStart(2, '0')} — ${spread.positions[i]}</p>
          <h3 class="entry-name">${c.ko}<span class="entry-numeral">${label(c)}</span>
            <span class="entry-dir ${pick.rev ? 'dir-rev' : 'dir-up'}">${pick.rev ? '역방향' : '정방향'}</span>
          </h3>
          <ul class="entry-kw">${c.k.map(k => `<li>${k}</li>`).join('')}</ul>
          <p class="entry-text">${pick.rev ? c.r : c.u}</p>
        </div>
      </article>`;
    }).join('');
}

function finish() {
  state.done = true;
  el.fan.classList.add('is-done');
  el.hint.textContent = `${SPREADS[state.key].positions.length}장을 모두 뽑았습니다.`;
  el.actions.hidden = false;
  el.autoBtn.disabled = true;
  renderReading();
  saveLog();
  el.reading.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncCounter() {
  const total = SPREADS[state.key].positions.length;
  el.counter.textContent = `${state.drawn.length} / ${total}`;
}

/* ── 새 판 ──────────────────────────────────────────────── */
function reset(key = state.key) {
  state = { key, deck: shuffled(), drawn: [], done: false, busy: false, auto: false };
  el.hint.innerHTML = '덱에서 카드를 고르세요 <b id="counter"></b>';
  el.counter = $('#counter');
  el.reading.innerHTML = '';
  el.actions.hidden = true;
  el.autoBtn.disabled = false;
  document.querySelectorAll('.spread-btn').forEach(b =>
    b.classList.toggle('is-on', b.dataset.spread === key));
  renderBoard();
  renderFan();
  syncCounter();
}

/* ── 공유 링크 ──────────────────────────────────────────── */
function encode() {
  const bytes = [SPREAD_ORDER.indexOf(state.key),
                 ...state.drawn.map(p => p.idx | (p.rev ? 128 : 0))];
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(s) {
  try {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = [...bin].map(c => c.charCodeAt(0));
  const key = SPREAD_ORDER[bytes[0]];
  if (!key) return null;
  const drawn = bytes.slice(1).map(b => ({ idx: b & 127, rev: !!(b & 128) }));
  if (drawn.length !== SPREADS[key].positions.length) return null;
  if (drawn.some(d => d.idx >= CARDS.length)) return null;
  return { key, drawn };
  } catch { return null; }
}

function restore({ key, drawn }) {
  reset(key);
  state.drawn = drawn;
  drawn.forEach((p, i) => fill(i, p));
  el.fan.querySelectorAll('.fan-card').forEach(b => b.classList.add('is-taken'));
  state.done = true;
  el.fan.classList.add('is-done');
  el.hint.textContent = '공유된 리딩입니다. 직접 뽑으려면 다시 섞기를 누르세요.';
  el.actions.hidden = false;
  el.autoBtn.disabled = true;
  renderReading();
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-up');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('is-up'), 2200);
}

/* ── 기록 ───────────────────────────────────────────────── */
const readLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { return []; } };
const writeLog = v => { try { localStorage.setItem(LOG_KEY, JSON.stringify(v)); } catch {} };

function saveLog() {
  const log = readLog();
  log.unshift({ t: new Date().toISOString(), s: state.key, c: encode() });
  writeLog(log.slice(0, LOG_MAX));
  renderLog();
}

function renderLog() {
  const log = readLog();
  el.log.hidden = log.length === 0;
  el.logList.innerHTML = log.map((r, i) => {
    const d = new Date(r.t);
    const when = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const parsed = decode(r.c);
    const names = parsed
      ? parsed.drawn.map(p => CARDS[p.idx].ko + (p.rev ? '(역)' : '')).join(' · ')
      : '—';
    return `<li class="log-item">
      <span class="log-when">${when}</span>
      <span class="log-spread">${SPREADS[r.s]?.name ?? ''}</span>
      <span class="log-cards">${names}</span>
      <button class="log-open" type="button" data-i="${i}">다시 보기</button>
    </li>`;
  }).join('');
}

/* ── 이벤트 ─────────────────────────────────────────────── */
document.querySelectorAll('.spread-btn').forEach(b =>
  b.addEventListener('click', () => {
    history.replaceState(null, '', location.pathname + location.search);
    reset(b.dataset.spread);
  }));

el.shuffleBtn.addEventListener('click', shuffleDeck);
el.autoBtn.addEventListener('click', autoDraw);

$('#btn-share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#r=${encode()}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('링크를 복사했습니다');
  } catch {
    location.hash = 'r=' + encode();
    toast('주소창의 링크를 복사해 주세요');
  }
});

$('#btn-clearlog').addEventListener('click', () => {
  writeLog([]);
  renderLog();
  toast('기록을 지웠습니다');
});

el.logList.addEventListener('click', e => {
  const btn = e.target.closest('.log-open');
  if (!btn) return;
  const rec = readLog()[+btn.dataset.i];
  const parsed = rec && decode(rec.c);
  if (parsed) { restore(parsed); el.reading.scrollIntoView({ behavior: 'smooth' }); }
});

let rt;
window.addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => { if (!state.busy) applySeats(); }, 180);
});

/* ── 시작 ───────────────────────────────────────────────── */
renderLog();
const shared = location.hash.startsWith('#r=') && decode(location.hash.slice(3));
if (shared) restore(shared); else reset('one');
