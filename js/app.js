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
  desc: $('#spread-desc'), toast: $('#toast'),
  log: $('#log'), logList: $('#log-list'),
};

let state = { key:'one', deck:[], drawn:[], done:false };

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
   78장을 전부 펼칩니다. 카드 한 장이 보이는 폭(gap)에 하한을 두고,
   그만큼도 안 되면 부채가 컨테이너보다 넓어지면서 가로 스크롤이 생깁니다.
   ──────────────────────────────────────────────────────────── */
// 좁은 화면에서는 호를 완만하게 눕혀야 보이는 구간이 자연스럽습니다.
const THETA   = () => (window.innerWidth < 760 ? 14 : 26);   // 부채 반각(도)
const MIN_GAP = () => (window.innerWidth < 760 ? 11 : 14);
const rad = d => d * Math.PI / 180;

// cardW/cardH는 CSS의 clamp()·calc() 결과라 커스텀 속성으로는 못 읽습니다.
// 실제로 놓인 카드의 레이아웃 크기(transform 이전 값)를 재서 씁니다.
function fanGeometry(n, cardW, cardH, avail) {
  const t = rad(THETA());
  // 양 끝 카드는 THETA만큼 기울어져 있어 제 폭보다 옆으로 더 튀어나옵니다.
  const overhang = (cardW / 2) * Math.cos(t) + (cardH / 2) * Math.sin(t) - cardW / 2;
  const usable = avail - 2 * overhang;

  const gap = Math.max(MIN_GAP(), (usable - cardW) / (n - 1));
  const spread = gap * (n - 1);                       // 양 끝 카드 중심 사이 거리
  const d = spread / (2 * Math.sin(t));               // 회전축까지의 거리
  const drop = d * (1 - Math.cos(t))
             + (cardH / 2) * Math.cos(t) + (cardW / 2) * Math.sin(t) - cardH / 2;

  return { width: spread + cardW + 2 * overhang, originY: cardH / 2 + d,
           drop, height: cardH + drop + (window.innerWidth < 760 ? 28 : 38) };
}

function renderFan() {
  const n = CARDS.length;
  const avail = el.scroll.clientWidth - 8;
  el.fan.innerHTML = '';
  el.fan.classList.remove('is-done', 'is-collapsing');

  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const th = THETA();
    const a = -th + (2 * th / (n - 1)) * i;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fan-card';
    b.style.setProperty('--a', a.toFixed(3) + 'deg');
    b.style.setProperty('--d', (i * 7) + 'ms');
    b.style.zIndex = i;
    b.dataset.n = i;
    b.setAttribute('aria-label', `왼쪽에서 ${i + 1}번째 카드 뽑기`);
    b.innerHTML = '<svg><use href="#cardback"/></svg>';
    b.addEventListener('click', () => take(b));
    frag.appendChild(b);
  }
  el.fan.appendChild(frag);

  const probe = el.fan.firstElementChild;
  const g = fanGeometry(n, probe.offsetWidth, probe.offsetHeight, avail);
  el.fan.style.width = g.width + 'px';
  el.fan.style.height = g.height + 'px';
  el.fan.style.setProperty('--origin-y', g.originY + 'px');
  el.fan.style.setProperty('--fan-drop', g.drop + 'px');
  el.scroll.scrollLeft = (el.scroll.scrollWidth - el.scroll.clientWidth) / 2;
  el.swipe.hidden = el.scroll.scrollWidth <= el.scroll.clientWidth + 1;
}

function take(btn) {
  if (state.done || btn.classList.contains('is-taken')) return;
  // 카드는 섞는 순간 자리마다 확정됩니다. 여기서 새로 뽑는 것이 아니라,
  // 그 자리에 놓여 있던 장을 그대로 가져옵니다.
  const pick = state.deck[+btn.dataset.n];
  if (!pick) return;
  btn.classList.add('is-taken');
  state.drawn.push(pick);
  fill(state.drawn.length - 1, pick);
  syncCounter();
  if (state.drawn.length === SPREADS[state.key].positions.length) finish();
}

/* ── 배치판 ─────────────────────────────────────────────── */
function renderBoard() {
  const spread = SPREADS[state.key];
  el.board.dataset.spread = state.key;
  el.board.innerHTML = spread.positions.map((pos, i) => `
    <div class="slot" data-i="${i}">
      <span class="slot-label">${String(i + 1).padStart(2, '0')} <i>${pos}</i></span>
      <div class="slot-frame">
        <div class="card">
          <div class="card-face card-back"><svg><use href="#cardback"/></svg></div>
          <div class="card-face card-front"></div>
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
  // 켈틱 크로스의 2번은 1번 위에 가로로 놓이므로 이름을 1번 캡션에 덧붙입니다.
  if (state.key === 'celtic' && i === 1) {
    const first = $('.slot[data-i="0"] .slot-caption', el.board);
    first.insertAdjacentHTML('beforeend',
      `<span class="cross-note">가로지름 · 장애물<br><b>${card.ko}</b>${pick.rev ? ' <i>역</i>' : ''}</span>`);
  }
  requestAnimationFrame(() => slot.classList.add('is-filled'));
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
  state = { key, deck: shuffled(), drawn: [], done: false };
  el.desc.textContent = SPREADS[key].desc;
  el.hint.innerHTML = '덱에서 카드를 고르세요 <b id="counter"></b>';
  el.counter = $('#counter');
  el.reading.innerHTML = '';
  el.actions.hidden = true;
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

$('#btn-shuffle').addEventListener('click', () => {
  history.replaceState(null, '', location.pathname + location.search);
  el.fan.classList.add('is-collapsing');
  toast('덱을 섞었습니다');
  setTimeout(() => reset(), 280);
});

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
  rt = setTimeout(() => { if (!state.drawn.length) renderFan(); }, 180);
});

/* ── 시작 ───────────────────────────────────────────────── */
renderLog();
const shared = location.hash.startsWith('#r=') && decode(location.hash.slice(3));
if (shared) restore(shared); else reset('one');
