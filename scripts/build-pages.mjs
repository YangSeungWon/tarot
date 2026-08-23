// 카드 사전 페이지를 만듭니다. 78장 x 2언어 + 목록 2장.
// 글은 전부 js/cards.js 에서 옵니다. cards.js 를 고치면 이 스크립트를 다시 돌리세요.
import fs from 'fs';
import path from 'path';
import { CARDS, LENS } from '../js/cards.js';

const SITE = 'https://tarot.ysw.kr';
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

const T = {
  ko: {
    listTitle: '타로 카드 78장 의미와 해석',
    listDesc: '라이더-웨이트 78장 전체의 정방향, 역방향 해석. 연애, 일, 돈, 관계별로 읽는 법까지.',
    listLead: '카드를 누르면 정방향과 역방향 해석, 주제별로 읽는 법을 볼 수 있습니다.',
    cardTitle: c => `${c.name.ko} 타로 카드 의미와 해석`,
    cardDesc: c => `${c.name.ko}(${c.name.en}) 타로 카드의 정방향, 역방향 해석과 키워드. 연애, 일, 돈, 관계별로 읽는 법.`,
    all: '카드 78장 전체', app: '타로 뽑으러 가기',
    up: '정방향', rev: '역방향', lenses: '주제별로 읽으면',
    cta: '이 덱으로 직접 뽑아보기',
    prev: '이전 카드', next: '다음 카드',
    other: 'English', otherHref: c => c ? `/en/card/${c}/` : '/en/card/',
    home: '/', groups: { major:'메이저 아르카나', wands:'완드', cups:'컵', swords:'소드', pents:'펜타클' },
    groupNote: { major:'22장', wands:'열정과 행동', cups:'감정과 관계',
                 swords:'사고와 갈등', pents:'물질과 현실' },
    suitOf: c => c.arcana === 'major' ? `메이저 아르카나 ${c.num}번` : `${{wands:'완드',cups:'컵',swords:'소드',pents:'펜타클'}[c.suit]} 슈트`,
  },
  en: {
    listTitle: 'All 78 Tarot Card Meanings',
    listDesc: 'Upright and reversed meanings for the full 78-card Rider-Waite deck, with readings for love, work, money and people.',
    listLead: 'Open a card for its upright and reversed meaning, and how it reads by topic.',
    cardTitle: c => `${c.name.en} Tarot Card Meaning`,
    cardDesc: c => `Upright and reversed meanings of ${c.name.en}, with keywords and how the card reads for love, work, money and people.`,
    all: 'All 78 cards', app: 'Draw a card',
    up: 'Upright', rev: 'Reversed', lenses: 'By topic',
    cta: 'Draw from this deck yourself',
    prev: 'Previous card', next: 'Next card',
    other: '한국어', otherHref: c => c ? `/card/${c}/` : '/card/',
    home: '/en/', groups: { major:'Major Arcana', wands:'Wands', cups:'Cups', swords:'Swords', pents:'Pentacles' },
    groupNote: { major:'22 cards', wands:'Drive and action', cups:'Feeling and bonds',
                 swords:'Thought and conflict', pents:'Matter and the real' },
    suitOf: c => c.arcana === 'major' ? `Major Arcana ${c.num}` : `Suit of ${{wands:'Wands',cups:'Cups',swords:'Swords',pents:'Pentacles'}[c.suit]}`,
  },
};

const head = (lang, title, desc, canonical, alt) => `<!doctype html>
<!-- scripts/build-pages.mjs 가 js/cards.js 에서 생성합니다. 직접 고치지 마세요. -->
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${canonical}">
<link rel="alternate" hreflang="ko" href="${SITE}${lang === 'ko' ? canonical : alt}">
<link rel="alternate" hreflang="en" href="${SITE}${lang === 'en' ? canonical : alt}">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/page.css">
</head>
<body>
<main class="doc">`;

const foot = `</main>
</body>
</html>
`;

const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const GROUPS = ['major','wands','cups','swords','pents'];
const groupOf = c => c.arcana === 'major' ? 'major' : c.suit;

let n = 0;
const urls = [];

for (const lang of ['ko','en']) {
  const t = T[lang];
  const base = lang === 'ko' ? '/card' : '/en/card';
  const dir  = lang === 'ko' ? 'card'  : 'en/card';

  // ── 카드마다 한 장 ──
  CARDS.forEach((c, i) => {
    const prev = CARDS[i - 1], next = CARDS[i + 1];
    const url = `${base}/${c.id}/`;
    const body = `
  <nav class="crumb">
    <a href="${base}/">&larr; ${esc(t.all)}</a>
    <a href="${t.otherHref(c.id)}">${esc(t.other)}</a>
  </nav>

  <header class="card-head">
    <img src="/assets/cards/${c.id}.webp" alt="${esc(c.name[lang])}" width="400" height="671">
    <div>
      <h1 class="card-title">${esc(c.name[lang])}${lang === 'ko' ? `<span class="card-latin">${esc(c.name.en)}</span>` : ''}</h1>
      <p class="card-suit">${esc(t.suitOf(c))}</p>
      <ul class="kw">${c.k[lang].map(k => `<li>${esc(k)}</li>`).join('')}</ul>
    </div>
  </header>

  <section class="sec up"><h2>${esc(t.up)}</h2><p>${esc(c.u[lang])}</p></section>
  <section class="sec rev"><h2>${esc(t.rev)}</h2><p>${esc(c.r[lang])}</p></section>

  <section class="lenses">
    <h2>${esc(t.lenses)}</h2>
    ${['love','work','money','rel'].map(k =>
      `<div class="lens-row"><b>${esc(LENS[k][lang])}</b><span>${esc(c.t[k][lang])}</span></div>`).join('\n    ')}
  </section>

  <a class="cta" href="${t.home}">${esc(t.cta)}</a>

  <nav class="pager">
    ${prev ? `<a href="${base}/${prev.id}/"><i>&larr; ${esc(t.prev)}</i>${esc(prev.name[lang])}</a>` : '<span></span>'}
    ${next ? `<a href="${base}/${next.id}/" style="text-align:right"><i>${esc(t.next)} &rarr;</i>${esc(next.name[lang])}</a>` : '<span></span>'}
  </nav>`;
    write(`${dir}/${c.id}/index.html`,
      head(lang, t.cardTitle(c), t.cardDesc(c), url, `${lang === 'ko' ? '/en/card' : '/card'}/${c.id}/`) + body + foot);
    urls.push(url); n++;
  });

  // ── 목록 ──
  const groups = GROUPS.map(g => {
    const list = CARDS.filter(c => groupOf(c) === g);
    return `
  <section class="deck-group">
    <h2>${esc(t.groups[g])}<em>${esc(t.groupNote[g])}</em></h2>
    <ul class="deck-grid">
      ${list.map(c => `<li><a href="${base}/${c.id}/">
        <img src="/assets/cards/${c.id}.webp" alt="${esc(c.name[lang])}" loading="lazy" width="400" height="671">
        <span>${esc(c.name[lang])}</span></a></li>`).join('\n      ')}
    </ul>
  </section>`;
  }).join('\n');
  write(`${dir}/index.html`,
    head(lang, t.listTitle, t.listDesc, `${base}/`, lang === 'ko' ? '/en/card/' : '/card/') + `
  <nav class="crumb">
    <a href="${t.home}">&larr; ${esc(t.app)}</a>
    <a href="${t.otherHref('')}">${esc(t.other)}</a>
  </nav>
  <h1 class="card-title" style="margin-bottom:.6rem">${esc(t.listTitle)}</h1>
  <p class="card-suit" style="margin:0 0 2rem">${esc(t.listLead)}</p>
${groups}` + foot);
  urls.push(`${base}/`); n++;
}

// ── 사이트맵 ──
const day = new Date().toISOString().slice(0, 10);
const entry = (loc, pri) => `  <url>\n    <loc>${SITE}${loc}</loc>\n` +
  `    <lastmod>${day}</lastmod>\n    <priority>${pri}</priority>\n  </url>`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${SITE}/</loc>
    <xhtml:link rel="alternate" hreflang="ko" href="${SITE}/"/>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}/en/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>
    <lastmod>${day}</lastmod>
    <priority>1.0</priority>
  </url>
${entry('/en/', '0.9')}
${urls.map(u => entry(u, u.endsWith('card/') ? '0.8' : '0.6')).join('\n')}
</urlset>
`;
fs.writeFileSync('sitemap.xml', sitemap);
console.log(`페이지 ${n}장 생성, 사이트맵 ${urls.length + 2}개 URL`);
