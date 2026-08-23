import { CARDS, SPREADS, TOPICS, LENS_KO } from './cards.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const SPREAD_ORDER = ['one','three','celtic'];
const LOG_KEY = 'tarot.log.v1';
const REV_KEY = 'tarot.reversals.v1';
const LOG_MAX = 20;

const el = {
  fan: $('#fan'), scroll: $('#fan-scroll'), swipe: $('#fan-swipe'),
  stage: $('.fan-stage'),
  hint: $('#fan-hint'), counter: $('#counter'),
  board: $('#board'), reading: $('#reading'), actions: $('#actions'),
  toast: $('#toast'),
  log: $('#log'), logList: $('#log-list'),
  shuffleBtn: $('#btn-shuffle'), autoBtn: $('#btn-auto'), revBtn: $('#btn-rev'),
  ask: $('.ask'), askCat: $('#ask-cat'), askQ: $('#ask-q'),
};

let useRev = true;
try { useRev = localStorage.getItem(REV_KEY) !== 'off'; } catch {}

let gen = 0;   // 판이 새로 깔릴 때마다 올라갑니다. 진행 중이던 뽑기를 구분하는 표.
let state = { key:'one', deck:[], drawn:[], done:false, busy:false, auto:false, ask:{ cat:'', q:'' } };

/* ── 덱 ──────────────────────────────────────────────────── */
const rnd = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;

function fisherYates(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 리더가 덱을 다루는 순서 그대로입니다.
//   1. 덱을 정방향으로 바로잡고
//   2. 충분히 섞고
//   3. 한 뭉치를 덜어 180도 돌려 합치고 (그 뭉치가 통째로 역방향이 됩니다)
//   4. 다시 섞습니다
// 방향은 3번의 뭉치 크기가 정하고, 순서는 피셔–예이츠라 균등합니다.
// 한 번 섞으면 어느 자리에 무엇이 어느 방향으로 놓였는지가 전부 결정되고,
// 뽑을 때 바뀌지 않습니다.
const CHUNK_MIN = 6, CHUNK_MAX = 25;       // 78장의 8~32%, 평균 약 20%
const pickChunk = () => CHUNK_MIN + rnd(CHUNK_MAX - CHUNK_MIN + 1);

function shuffled(chunk = pickChunk()) {
  const order = fisherYates(CARDS.map((_, i) => i));
  const deck = order.map((idx, i) => ({ idx, rev: i >= order.length - chunk }));
  return fisherYates(deck);
}

// 제목 옆에 붙는 표식. 카드 아래쪽에 인쇄된 영문 이름을 그대로 씁니다.
const label = card => card.en;

/* ── 부채꼴 덱 ───────────────────────────────────────────────
   78장을 전부 펼칩니다. 카드는 자기 중심을 축으로 회전하고,
   호 위의 자리는 평행이동(--tx/--ty)으로 잡습니다. 이렇게 두면
   섞는 동작(모으기·자르기)과 펼친 상태 사이가 그대로 보간됩니다.
   ──────────────────────────────────────────────────────────── */
// 좁은 화면에서는 부채 대신 '돌려서 고르는 띠'를 씁니다.
const isRail = () => window.innerWidth < 760;
// gap이 곧 감도입니다. 손가락이 400px 움직였을 때 지나가는 장수 = 400/gap.
// R은 기울기가 최대가 되는 거리 — 화면 절반쯤에서 30도가 되도록 맞춥니다.
const RAIL = { gap: 56, rot: 30, drop: 44, R: 200, top: 46, bottom: 74, tMax: 1.7, tDrop: 1.25 };
let rail = null, railRaf = 0, centerIdx = -1, railLo = 0, railHi = -1;

const THETA   = () => 23;                                   // 부채 반각(도)
const MIN_GAP = () => 14;                                   // 카드 한 장이 보이는 최소 폭
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
  const top = 72;
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

/* ── 돌려서 고르는 띠 (모바일) ────────────────────────────────
   카드 자리는 스크롤이 정하고, 가운데에서 멀어질수록 기울고 내려앉게
   해서 톱니처럼 이어 보이게 합니다. 위치는 계산으로만 구합니다
   (매 프레임 getBoundingClientRect를 부르면 레이아웃이 튑니다).
   ──────────────────────────────────────────────────────────── */
function layoutRail() {
  const cards = [...el.fan.children];
  if (!cards.length) return;
  const cw = cards[0].offsetWidth, ch = cards[0].offsetHeight;
  const stageW = el.scroll.clientWidth;
  const pad = Math.max(0, stageW / 2 - cw / 2);

  rail = { n: cards.length, cw, gap: RAIL.gap, pad, stageW };
  el.fan.style.width = '';
  el.fan.style.height = '';
  el.fan.style.setProperty('--rail-gap', RAIL.gap + 'px');
  el.fan.style.setProperty('--rail-pad', pad + 'px');
  el.fan.style.setProperty('--rail-top', RAIL.top + 'px');
  el.fan.style.setProperty('--rail-bottom', RAIL.bottom + 'px');
  // 표식은 .fan-stage 기준이라 버튼 줄 높이까지 더해야 카드에 맞습니다.
  el.stage.style.setProperty('--mark-top', (el.scroll.offsetTop + RAIL.top - 6) + 'px');
  cards.forEach(b => { b.dataset.far = '1'; });
  railLo = 0; railHi = cards.length - 1; centerIdx = -1;
  centerOn(Math.floor(cards.length / 2), false);
  railTick();
}

function railTick() {
  railRaf = 0;
  if (!rail) return;
  const cards = el.fan.children;
  const { cw, gap, pad, stageW, n } = rail;
  const c = el.scroll.scrollLeft + stageW / 2;      // 가운데 자리의 띠 좌표
  const span = Math.ceil((stageW / 2 + cw) / gap) + 1;
  const mid = (c - pad - cw / 2) / gap;
  const lo = Math.max(0, Math.floor(mid - span));
  const hi = Math.min(n - 1, Math.ceil(mid + span));

  for (let i = railLo; i <= railHi; i++)                 // 화면 밖으로 나간 카드는 재웁니다
    if ((i < lo || i > hi) && cards[i]) cards[i].dataset.far = '1';
  for (let i = lo; i <= hi; i++) {
    const b = cards[i];
    if (!b) continue;
    if (b.dataset.far) delete b.dataset.far;
    const d = pad + cw / 2 + i * gap - c;
    const t = Math.max(-RAIL.tMax, Math.min(RAIL.tMax, d / RAIL.R));
    const td = Math.max(-RAIL.tDrop, Math.min(RAIL.tDrop, t));   // 아래로 잘리지 않게
    b.style.setProperty('--ra', (t * RAIL.rot).toFixed(2) + 'deg');
    b.style.setProperty('--ry', (td * td * RAIL.drop).toFixed(1) + 'px');
    b.style.setProperty('--rs', (1 - Math.min(Math.abs(t), 1.5) * 0.05).toFixed(3));
    b.style.setProperty('--z', Math.round(400 - Math.abs(d)));
  }
  railLo = lo; railHi = hi;

  const near = Math.max(0, Math.min(n - 1, Math.round(mid)));
  if (near !== centerIdx) {
    cards[centerIdx]?.classList.remove('is-center');
    centerIdx = near;
    cards[centerIdx]?.classList.add('is-center');
  }
}

function centerOn(i, smooth) {
  if (!rail) return;
  const left = rail.pad + rail.cw / 2 + i * rail.gap - rail.stageW / 2;
  el.scroll.scrollTo(smooth && !calm() ? { left, behavior: 'smooth' } : { left });
}

// 띠를 크게 한 바퀴 돌려 새 자리에 세웁니다. 섞기의 마지막 박자입니다.
function spinRail() {
  if (!rail) return Promise.resolve();
  let i = rnd(rail.n);
  if (Math.abs(i - centerIdx) < 25) i = (centerIdx + 26 + rnd(26)) % rail.n;
  const to = rail.pad + rail.cw / 2 + i * rail.gap - rail.stageW / 2;
  if (calm()) { el.scroll.scrollLeft = to; return Promise.resolve(); }

  const from = el.scroll.scrollLeft, t0 = performance.now(), dur = 950;
  return new Promise(res => {
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      el.scroll.scrollLeft = from + (to - from) * (1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
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
    b.addEventListener('click', e => pick(b, e));
    frag.appendChild(b);
  }
  el.fan.appendChild(frag);
  relayout();
}

// 띠에서는 가운데 자리에 온 카드만 뽑힙니다. 다른 카드를 누르면 그 카드를
// 가운데로 돌려놓습니다. 손가락으로 정확히 짚기 어려운 화면이라서입니다.
function pick(btn, ev) {
  if (!isRail()) return take(btn, ev);
  const i = +btn.dataset.n;
  if (i === centerIdx) take(btn, ev);
  else centerOn(i, true);
}

function relayout() {
  const railMode = isRail();
  el.stage.classList.toggle('is-rail', railMode);
  el.scroll.classList.toggle('is-rail', railMode);
  el.fan.classList.toggle('is-rail', railMode);
  if (railMode) { layoutRail(); el.swipe.hidden = true; }
  else {
    rail = null; centerIdx = -1;
    [...el.fan.children].forEach(b => { delete b.dataset.far; b.classList.remove('is-center'); });
    applySeats();
  }
}

const LIFT_MS = () => (calm() ? 260 : 380);
const hintLead = () => isRail() ? '돌려서 가운데로 놓고 누르세요' : '덱에서 카드를 고르세요';

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

  if (at + 1 === total) finish();        // 기다리지 않고 곧바로 해석으로

  const g = gen;
  setTimeout(() => {                     // 카드는 그동안 배치판으로 넘어갑니다
    if (g !== gen) return;               // 판이 갈렸으면 그만둡니다
    btn.classList.add('is-taken');
    fill(at, pick);
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
    const b = free[rnd(free.length)];
    if (isRail()) { centerOn(+b.dataset.n, true); await wait(calm() ? 0 : 400); }
    take(b);
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
function markStack(cutAt, spin) {
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
    if (upper && spin) b.dataset.spin = '1'; else delete b.dataset.spin;
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

  // 180도 돌릴 뭉치. 보이는 뭉치가 곧 역방향이 되는 카드들입니다.
  // 역방향을 끄면 돌리지 않고, 순서만 자릅니다.
  const chunk = useRev ? pickChunk() : 0;
  const cutAt = useRev ? n - chunk : 26 + rnd(27);

  // 띠에서는 카드를 옮겨 쌓을 자리가 없습니다. 어두워지고 → 뭉치가 돌고
  // → 띠가 크게 한 바퀴 돌아 새 자리에 서는 것으로 같은 세 박자를 냅니다.
  if (isRail()) {
    markStack(cutAt, useRev);
    el.fan.classList.add('s-gather');
    await wait(calm() ? 260 : 420);
    el.fan.classList.add('s-cut');
    await wait(calm() ? 200 : 780);
    el.fan.classList.remove('s-cut');
    state.deck = shuffled(chunk);
    await spinRail();
    el.fan.classList.add('s-spread');
    el.fan.classList.remove('s-gather');
    await wait(calm() ? 200 : 520);
    el.fan.classList.remove('s-spread');
    finishShuffle();
    return;
  }

  // 동작 줄이기 설정에서는 옮기는 대신 밝기로 같은 이야기를 합니다.
  // 덱 전체가 한 번 어두워졌다가, 왼쪽부터 차례로 되살아납니다.
  if (calm()) {
    el.fan.classList.add('s-gather');
    await wait(500);
    state.deck = shuffled(chunk);
    [...el.fan.children].forEach((b, i) => { b.style.setProperty('--z', i); });
    el.fan.classList.add('s-spread');
    el.fan.classList.remove('s-gather');
    await wait(n * 5 + 420);
    el.fan.classList.remove('s-spread');
    finishShuffle();
    return;
  }

  markStack(cutAt, useRev);

  el.fan.classList.add('s-gather');            // 1. 모으기
  await wait(640);
  el.fan.classList.add('s-cut');               // 2. 덜어내서 180도 돌리고
  await wait(900);
  // 두 뭉치가 떨어져 있는 동안 위아래를 맞바꿉니다 (겹치지 않아 티가 안 납니다)
  [...el.fan.children].forEach((b, i) => {
    b.style.setProperty('--z', b.dataset.upper ? i - cutAt : i + (n - cutAt));
  });
  el.fan.classList.remove('s-cut');            //    다시 한 벌로 포개고
  await wait(560);

  state.deck = shuffled(chunk);
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
  el.hint.innerHTML = `${hintLead()} <b id="counter"></b>`;
  el.counter = $('#counter');
  syncCounter();
  state.busy = false;
}

/* ── 배치판 ─────────────────────────────────────────────── */
function renderBoard() {
  gen++;
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
  if (!slot) return;                     // 그새 판이 바뀌었으면 버립니다
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
    if (first) first.insertAdjacentHTML('beforeend',
      `<span class="cross-note">02 장애물<br><b>${card.ko}</b>${pick.rev ? ' <i>역</i>' : ''}</span>`);
  }
}

/* ── 무엇에 대한 리딩인가 ────────────────────────────────────
   주제와 질문은 둘 다 선택 사항입니다. 적어두면 해석 머리와
   지난 기록에 함께 남아, 나중에 봐도 무엇을 물었는지 알 수 있습니다.
   ──────────────────────────────────────────────────────────── */
const lensOf = cat => TOPICS.find(t => t.label === cat)?.lens || '';

function buildTopics() {
  const frag = document.createDocumentFragment();
  let group = null, lens = null;
  for (const t of TOPICS) {
    const o = document.createElement('option');
    o.textContent = t.label;
    if (t.lens && t.lens !== lens) {
      lens = t.lens;
      group = document.createElement('optgroup');
      group.label = LENS_KO[t.lens];
      el.askCat.appendChild(group);
    }
    (t.lens ? group : frag).appendChild(o);
  }
  el.askCat.insertBefore(frag, el.askCat.children[1] || null);
}

const readAsk = () => {
  const cat = el.askCat.value.trim();
  return { cat, lens: lensOf(cat), q: el.askQ.value.trim().slice(0, 60) };
};

function setAsk({ cat = '', q = '' } = {}) {
  el.askCat.value = [...el.askCat.options].some(o => o.value === cat) ? cat : '';
  el.askQ.value = q;
  syncAsk();
}
const syncAsk = () => el.ask.classList.toggle('has-topic', !!el.askCat.value);

/* ── 해석 ───────────────────────────────────────────────── */
function renderReading() {
  const spread = SPREADS[state.key];
  const { cat, q, lens } = state.ask || {};
  const head = (cat || q)
    ? `<div class="reading-head">
         ${cat ? `<p class="reading-cat">${esc(cat)}</p>` : ''}
         ${q ? `<p class="reading-q">${esc(q)}</p>` : ''}
         <p class="reading-spread">${spread.name}</p>
       </div>`
    : `<div class="reading-head"><h2 class="sec-title">${spread.name} 해석</h2></div>`;

  el.reading.innerHTML = head + state.drawn.map((pick, i) => {
      const c = CARDS[pick.idx];
      return `<article class="entry">
        <div><img class="entry-thumb${pick.rev ? ' is-rev' : ''}"
             src="assets/cards/${c.id}.webp" alt="${c.ko}" loading="lazy"></div>
        <div>
          <p class="entry-pos"><span class="entry-num">${String(i + 1).padStart(2, '0')}</span>${spread.positions[i]}</p>
          <h3 class="entry-name">${c.ko}<span class="entry-numeral">${label(c)}</span>
            <span class="entry-dir ${pick.rev ? 'dir-rev' : 'dir-up'}">${pick.rev ? '역방향' : '정방향'}</span>
          </h3>
          <ul class="entry-kw">${c.k.map(k => `<li>${k}</li>`).join('')}</ul>
          <p class="entry-text">${pick.rev ? c.r : c.u}</p>
          ${lens && c.t?.[lens] ? `<p class="entry-topic"><span>${LENS_KO[lens]}</span>${c.t[lens]}</p>` : ''}
        </div>
      </article>`;
    }).join('');
}

function finish() {
  state.done = true;
  state.ask = readAsk();
  el.fan.classList.add('is-done');
  el.hint.textContent = `${SPREADS[state.key].positions.length}장을 모두 뽑았습니다.`;
  el.actions.hidden = false;
  el.autoBtn.disabled = true;
  renderReading();
  saveLog();
  // 카드가 자리에 놓이고(0.38초) 뒤집히기 시작하는 것까지 보고 내려갑니다.
  setTimeout(scrollToReading, calm() ? 300 : 700);
}

// 기본 smooth 스크롤은 거리가 멀수록 길어집니다. 거리와 무관하게 짧게 끝냅니다.
function scrollToReading() {
  const to = el.reading.getBoundingClientRect().top + window.scrollY;
  if (calm()) { window.scrollTo(0, to); return; }

  const from = window.scrollY, dist = to - from;
  if (Math.abs(dist) < 4) return;

  let stopped = false;
  const stop = () => { stopped = true; done(); };
  const done = () => {
    removeEventListener('wheel', stop);
    removeEventListener('touchstart', stop);
  };
  addEventListener('wheel', stop, { passive: true });
  addEventListener('touchstart', stop, { passive: true });

  const t0 = performance.now();
  const step = now => {
    if (stopped) return;
    const k = Math.min(1, (now - t0) / 380);
    window.scrollTo(0, from + dist * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step); else done();
  };
  requestAnimationFrame(step);
}

function syncCounter() {
  const total = SPREADS[state.key].positions.length;
  el.counter.textContent = `${state.drawn.length} / ${total}`;
}

/* ── 새 판 ──────────────────────────────────────────────── */
function reset(key = state.key) {
  state = { key, deck: shuffled(useRev ? undefined : 0), drawn: [], done: false, busy: false, auto: false, ask: readAsk() };
  el.hint.innerHTML = `${hintLead()} <b id="counter"></b>`;
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
function shareUrl() {
  const { cat, q } = state.ask || readAsk();
  const p = new URLSearchParams({ r: encode() });
  if (cat) p.set('c', cat);
  if (q) p.set('q', q);
  return `${location.origin}${location.pathname}#${p}`;
}

// 해시에서 카드와 질문을 함께 읽습니다. 질문은 링크에 그대로 실립니다.
function fromHash() {
  const h = location.hash.slice(1);
  if (!h) return null;
  const p = new URLSearchParams(h);
  const parsed = decode(p.get('r') || '');
  if (!parsed) return null;
  return { ...parsed, ask: { cat: p.get('c') || '', q: (p.get('q') || '').slice(0, 60) } };
}

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

function restore({ key, drawn, ask }) {
  reset(key);
  if (ask) setAsk(ask);
  state.ask = readAsk();
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
  const { cat, q } = state.ask || {};
  log.unshift({ t: new Date().toISOString(), s: state.key, c: encode(), cat, q });
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
      ? parsed.drawn.map(p => CARDS[p.idx].ko + (p.rev ? '(역)' : '')).join(', ')
      : '';
    return `<li class="log-item">
      <span class="log-meta">
        <span class="log-when">${when}</span>
        <span class="log-spread">${SPREADS[r.s]?.name ?? ''}</span>
        ${r.cat ? `<span class="log-cat">${esc(r.cat)}</span>` : ''}
      </span>
      <button class="log-open" type="button" data-i="${i}">다시 보기</button>
      ${r.q ? `<span class="log-q">${esc(r.q)}</span>` : ''}
      <span class="log-cards">${names}</span>
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
el.askCat.addEventListener('change', syncAsk);
el.askQ.addEventListener('keydown', e => { if (e.key === 'Enter') el.askQ.blur(); });

function syncRevBtn() {
  el.revBtn.textContent = useRev ? '역방향 켬' : '역방향 끔';
  el.revBtn.classList.toggle('is-on', useRev);
  el.revBtn.setAttribute('aria-pressed', String(useRev));
}
el.revBtn.addEventListener('click', () => {
  if (state.busy || state.auto) return;
  useRev = !useRev;
  try { localStorage.setItem(REV_KEY, useRev ? 'on' : 'off'); } catch {}
  syncRevBtn();
  // 아직 아무것도 안 뽑았으면 덱을 조용히 다시 놓고, 아니면 다음 섞기부터
  if (!state.drawn.length && !state.done) {
    state.deck = shuffled(useRev ? undefined : 0);
    toast(useRev ? '역방향을 씁니다' : '전부 정방향으로 놓았습니다');
  } else {
    toast('다음 섞기부터 적용됩니다');
  }
});
syncRevBtn();

$('#btn-share').addEventListener('click', async () => {
  const url = shareUrl();
  try {
    await navigator.clipboard.writeText(url);
    toast(state.ask?.q ? '질문과 함께 링크를 복사했습니다' : '링크를 복사했습니다');
  } catch {
    location.hash = url.split('#')[1];
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
  if (parsed) {
    restore({ ...parsed, ask: { cat: rec.cat || '', q: rec.q || '' } });
    el.reading.scrollIntoView({ behavior: 'smooth' });
  }
});

el.scroll.addEventListener('scroll', () => {
  if (rail && !railRaf) railRaf = requestAnimationFrame(railTick);
}, { passive: true });

let rt;
window.addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => { if (!state.busy) relayout(); }, 180);
});

buildTopics();

/* ── 시작 ───────────────────────────────────────────────── */
renderLog();
const shared = fromHash();
if (shared) restore(shared); else reset('one');
