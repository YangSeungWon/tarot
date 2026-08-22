#!/usr/bin/env bash
# Rider-Waite-Smith (1909) 카드 이미지를 Wikimedia Commons에서 내려받아
# WebP로 변환합니다. 해당 판본은 퍼블릭 도메인입니다. 한 번만 실행하면 됩니다.
#
# 필요: curl, cwebp (Debian/Ubuntu: sudo apt install webp)
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=assets/cards
UA="tarot-web/1.0 (https://github.com/; static tarot site)"
WIDTH=900       # 원본을 넉넉히 받아서
OUT_W=400       # 이 폭으로 줄여 인코딩합니다 (표시 최대폭의 약 1.5배)
QUALITY=72

MAJORS=(
  00:Fool 01:Magician 02:High_Priestess 03:Empress 04:Emperor 05:Hierophant
  06:Lovers 07:Chariot 08:Strength 09:Hermit 10:Wheel_of_Fortune 11:Justice
  12:Hanged_Man 13:Death 14:Temperance 15:Devil 16:Tower 17:Star
  18:Moon 19:Sun 20:Judgement 21:World
)

command -v cwebp >/dev/null || { echo "cwebp가 필요합니다: sudo apt install webp" >&2; exit 1; }

get() { # $1 = Commons 파일명, $2 = 저장할 이름(확장자 제외)
  local dest="$OUT/$2.webp" tmp
  [ -s "$dest" ] && { echo "skip  $2"; return 0; }
  tmp=$(mktemp)
  local code
  code=$(curl -sS -L -A "$UA" -o "$tmp" -w '%{http_code}' \
    "https://commons.wikimedia.org/wiki/Special:FilePath/$1?width=$WIDTH")
  if [ "$code" = "200" ] && [ -s "$tmp" ] &&
     cwebp -quiet -q "$QUALITY" -resize "$OUT_W" 0 -m 6 -mt "$tmp" -o "$dest"; then
    rm -f "$tmp"; echo "ok    $2"
  else
    rm -f "$tmp" "$dest"; echo "FAIL  $2  ($1 -> $code)" >&2; return 1
  fi
}

fails=0
for m in "${MAJORS[@]}"; do
  num=${m%%:*}; name=${m#*:}
  get "RWS_Tarot_${num}_${name}.jpg" "major-${num}" || fails=$((fails+1))
done

for suit in Wands Cups Swords Pents; do
  low=$(echo "$suit" | tr 'A-Z' 'a-z')
  for i in $(seq -w 1 14); do
    get "${suit}${i}.jpg" "${low}-${i}" || fails=$((fails+1))
  done
done

echo "---"
echo "받은 파일: $(ls -1 $OUT/*.webp 2>/dev/null | wc -l) / 78, 실패: $fails, 용량: $(du -sh $OUT | cut -f1)"
