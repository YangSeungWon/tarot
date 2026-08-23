#!/usr/bin/env bash
# /en/index.html 을 index.html 에서 만들어 냅니다.
# 크롤러와 링크 미리보기는 자바스크립트를 돌리지 않아, 영어권에는 영어 <head>가
# 박힌 페이지가 따로 있어야 합니다. index.html 을 고치면 이 스크립트를 다시 돌리세요.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p en
python3 - <<'PY'
import re
s = open('index.html').read()
s = s.replace('<html lang="ko">', '<html lang="en" data-lang="en">')
s = s.replace('<title>무료 타로 카드 뽑기</title>', '<title>Free Tarot Card Reading</title>')
s = re.sub(r'<meta name="description" content="[^"]*">',
           '<meta name="description" content="Free tarot with the full 78-card Rider-Waite deck. Upright and reversed meanings for every card. One card, three cards, Celtic Cross.">', s)
s = re.sub(r'<meta property="og:title" content="[^"]*">',
           '<meta property="og:title" content="Free Tarot Card Reading">', s)
s = re.sub(r'<meta property="og:description" content="[^"]*">',
           '<meta property="og:description" content="Pick a card straight from a deck fanned out in front of you.">', s)
s = s.replace('<link rel="canonical" href="https://tarot.ysw.kr/">',
              '<link rel="canonical" href="https://tarot.ysw.kr/en/">')
s = s.replace('<meta property="og:url" content="https://tarot.ysw.kr/">',
              '<meta property="og:url" content="https://tarot.ysw.kr/en/">')
s = s.replace('<!doctype html>', '<!doctype html>\n<!-- scripts/build-en.sh 가 index.html 에서 생성합니다. 직접 고치지 마세요. -->')
open('en/index.html','w').write(s)
PY
echo "en/index.html 생성"
