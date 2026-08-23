# 타로 — 78장 라이더-웨이트

한국어와 영어 두 언어.

- `/` 는 브라우저 설정을 따르고, `/en/` 은 영어로 엽니다. 설정에서 언제든 전환됩니다.
- `/en/index.html` 은 `scripts/build-en.sh` 가 `index.html` 에서 만듭니다.
  크롤러와 링크 미리보기는 자바스크립트를 돌리지 않아 영어 `<head>` 가 박힌 페이지가 따로 필요합니다.
  **`index.html` 을 고치면 이 스크립트를 다시 돌리세요.**

## 카드 사전

`/card/` 와 `/en/card/` 에 78장 전체 목록과 카드별 페이지가 있습니다.
정/역 해석과 주제별 한 줄이 정적 HTML로 들어 있어 검색엔진이 읽을 수 있습니다.

```
node scripts/build-pages.mjs
```

`js/cards.js` 를 고치면 이 스크립트를 다시 돌리세요. sitemap.xml 도 함께 만듭니다.

정적 웹 타로. 서버 없이 브라우저에서만 동작합니다.

- 78장 풀덱(메이저 22 + 마이너 56), 정/역방향
- 스프레드 7종: 원 카드(1), 쓰리 카드(3), 무엇을 할까(3), 선택(5), 말굽(7), 켈틱 크로스(10), 조디악(12)
- 주제(썸/이직/돈/손절 등)를 고르면 카드마다 그 주제로 읽는 한 줄이 붙습니다
- 부채꼴로 펼쳐진 덱에서 직접 뽑는 방식, 3D 플립
- 결과 공유 링크(`#r=...`에 인코딩), 지난 리딩 기록(localStorage)

## 로컬에서 보기

ES 모듈을 쓰므로 `file://`로는 안 열립니다. 정적 서버로 띄우세요.

```
python3 -m http.server 8000
# http://localhost:8000
```

## GitHub Pages 배포

```
git init && git add -A && git commit -m "타로 웹"
git branch -M main
git remote add origin https://github.com/<유저명>/<저장소>.git
git push -u origin main
```

저장소 Settings → Pages → Source를 **Deploy from a branch**, 브랜치 `main` / 폴더 `/ (root)`로 지정하면
`https://<유저명>.github.io/<저장소>/` 에서 열립니다. (`.nojekyll`이 있어야 Jekyll 처리를 건너뜁니다.)

## 카드 이미지

`assets/cards/`의 78장은 1909년 라이더-웨이트-스미스 판본으로 **퍼블릭 도메인**입니다.
Wikimedia Commons에서 받아 폭 400px WebP(q72)로 인코딩했습니다 — 전부 합쳐 4.6MB.
카드가 화면에 표시되는 최대 폭은 132px이라 2x 디스플레이에서도 선명합니다.

다시 받으려면 (`cwebp` 필요 — `sudo apt install webp`):

```
./scripts/fetch-cards.sh
```

## 파일

```
index.html          마크업 + 카드 뒷면 SVG
css/style.css       스타일
js/cards.js         78장 데이터(정/역 해석, 키워드, 주제별 한 줄) + 스프레드 정의. 전부 {ko, en}
js/i18n.js          UI 문자열 두 벌
js/app.js           셔플·뽑기·해석·공유·기록
scripts/fetch-cards.sh   카드 이미지 내려받기
scripts/build-en.sh      en/index.html 생성
scripts/build-pages.mjs  카드 사전 페이지 158장 + sitemap.xml 생성
card/, en/card/          생성물. 직접 고치지 마세요
```

## 커스텀 도메인 (tarot.ysw.kr)

저장소에 `CNAME` 파일이 들어 있습니다(내용: `tarot.ysw.kr`).
DNS에 아래 레코드를 추가하세요.

| 타입 | 이름 | 값 |
|---|---|---|
| CNAME | `tarot` | `<유저명>.github.io.` |

그다음 GitHub 저장소 Settings → Pages → Custom domain에 `tarot.ysw.kr`을 입력하고,
DNS 검증이 끝나면 **Enforce HTTPS**를 켜면 됩니다. (인증서 발급까지 보통 몇 분~한 시간)

확인:

```
dig +short tarot.ysw.kr CNAME
```
