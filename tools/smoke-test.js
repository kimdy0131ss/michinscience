#!/usr/bin/env node
'use strict';

/**
 * smoke-test.js
 * 실제 HTML/JS 를 실행해 주요 기능을 점검한다 (의존성 없음).
 *   1) 빌드 산출물(data.js) 최신성
 *   2) index.html 필수 요소/리소스
 *   3) app.js 이 화면 요소 참조 id 와 일치 여부
 *   4) 채점 엔진(5지선다/O·X/단답/서술) 동작
 *   5) 결과 통계 함수 동작
 *   6) 시각화 레지스트리
 *
 * 사용법: node tools\smoke-test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const build = require(path.join(ROOT, 'build.js'));

let failures = 0;
let checks = 0;

function ok(cond, msg) {
  checks += 1;
  if (cond) {
    console.log('  PASS ' + msg);
  } else {
    failures += 1;
    console.log('  FAIL ' + msg);
  }
}

function section(name) {
  console.log('\n== ' + name + ' ==');
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/* ------------------------------------------------------------------ */
section('1. 빌드 산출물');

const dataPath = path.join(ROOT, 'assets', 'data.js');
ok(fs.existsSync(dataPath), 'assets/data.js 존재');

let data = null;
if (fs.existsSync(dataPath)) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  try {
    vm.runInContext(read('assets/data.js'), sandbox, { filename: 'data.js' });
    data = sandbox.window.SCIENCE_DATA;
    ok(!!data, 'data.js 를 실행하여 SCIENCE_DATA 획득');
  } catch (e) {
    ok(false, 'data.js 실행 실패: ' + e.message);
  }
}

if (data) {
  const fresh = build.buildData({ silent: true });
  ok(data.meta.cardCount === fresh.meta.cardCount,
    '카드 수 일치 (' + data.meta.cardCount + ')');
  ok(data.meta.questionCount === fresh.meta.questionCount,
    '문항 수 일치 (' + data.meta.questionCount + ')');
  ok(data.units.length === fresh.units.length && data.units.length > 0,
    '단원 구조 일치 (' + data.units.length + '단원)');
  ok(data.units.every((u) => u.sections.length > 0 && u.sections.every((s) => s.html.length > 50)),
    '각 단원에 렌더된 학습자료 HTML 존재');
  ok(data.cards.every((c) => c.front && c.back), '모든 카드에 앞면/뒷면 존재');
  ok(data.questions.every((q) => q.q && q.explain && q.source),
    '모든 문항에 문제/해설/출처 존재');
}

/* ------------------------------------------------------------------ */
section('2. index.html 구조');

const html = read('index.html');
const requiredIds = [
  'tabbar', 'btnTheme', 'view-content', 'view-cards', 'view-quiz',
  'view-results', 'view-viz', 'toc', 'contentBody', 'contentCrumb',
  'btnPrevSection', 'btnNextSection', 'deckSelect', 'cardStage', 'cardInner',
  'cardFront', 'cardBack', 'cardTag', 'cardCounter', 'deckProgressBar',
  'btnKnown', 'btnMaybe', 'btnUnknown', 'chkShuffle', 'chkWeak',
  'quizSetup', 'unitChecks', 'typeChecks', 'countChecks', 'btnStart',
  'quizPlay', 'quizQuestion', 'quizAnswerArea', 'quizFeedback',
  'btnGrade', 'btnNext', 'quizEnd', 'scoreRing', 'scoreNum',
  'resEmpty', 'resBody', 'statOverall', 'statWeak', 'resUnits', 'resTrend',
  'resWrong', 'resWeakCards', 'btnResetQuiz', 'btnResetCards',
  'vizList', 'vizStage', 'vizTitle', 'vizDesc', 'vizNote', 'toast', 'footerInfo'
];
const missingIds = requiredIds.filter((id) => html.indexOf('id="' + id + '"') === -1);
ok(missingIds.length === 0,
  '필수 요소 id 모두 존재' + (missingIds.length ? ' (누락: ' + missingIds.join(', ') + ')' : ''));

['assets/styles.css', 'assets/data.js', 'assets/app.js', 'assets/viz.js'].forEach((f) => {
  ok(fs.existsSync(path.join(ROOT, f)), f + ' 리소스 존재');
  ok(html.indexOf(f) !== -1, f + ' 가 HTML 에 연결됨');
});
ok(html.indexOf('<meta name="viewport"') !== -1, 'viewport 메타 태그 존재 (반응형)');
ok(/prefers-color-scheme/.test(read('assets/styles.css')), 'CSS prefers-color-scheme 지원');
ok(/data-theme/.test(html) && /localStorage/.test(html), '다크모드 초기화 스크립트 존재');

/* ------------------------------------------------------------------ */
section('3. JS ↔ HTML 요소 연결');

const runtimeOnly = new Set(['shortInput', 'essayInput', 'toast', 'scoreRing']);

function checkIdRefs(srcFile, label) {
  const src = read(srcFile);
  const refs = new Set();
  let m;
  const re1 = /\$\('#([\w-]+)'\)/g;
  while ((m = re1.exec(src))) refs.add(m[1]);
  const re2 = /getElementById\('([\w-]+)'\)/g;
  while ((m = re2.exec(src))) refs.add(m[1]);
  const missing = [];
  refs.forEach((id) => {
    if (runtimeOnly.has(id)) return;
    if (html.indexOf('id="' + id + '"') === -1) missing.push(id);
  });
  ok(missing.length === 0,
    label + ' 참조 id 가 HTML 에 모두 존재' + (missing.length ? ' (누락: ' + missing.join(', ') + ')' : ' (' + refs.size + '개 참조)'));
}

checkIdRefs('assets/app.js', 'app.js');
checkIdRefs('assets/viz.js', 'viz.js');

const appSrc = read('assets/app.js');
ok(/prefers-color-scheme/.test(appSrc), 'app.js 가 시스템 다크모드 선호 확인');
ok(/localStorage/.test(appSrc), 'app.js 가 localStorage 사용');
ok(/SCIENCE_DATA/.test(appSrc), 'app.js 가 데이터 로드');

/* ------------------------------------------------------------------ */
section('4. 채점 엔진');

// app.js 를 Node 에서 로드 (document 없음 → UI 초기화 생략, SE 만 노출)
global.SCIENCE_DATA = data || { units: [], decks: [], cards: [], questions: [], quizUnits: [], meta: {} };
delete global.SE;
require(path.join(ROOT, 'assets', 'app.js'));
const SE = global.SE;
ok(!!SE, 'app.js 를 실행하여 SE 인터페이스 획득');

if (SE && data) {
  // 정규화
  ok(SE.normalizeAnswer('  중기. ') === '중기', '단답 정규화: 공백·문장부호 제거');
  ok(SE.normalizeAnswer('Location Energy') === 'locationenergy', '단답 정규화: 대소문자 무시');

  const mc = data.questions.filter((q) => q.type === 'mc');
  const ox = data.questions.filter((q) => q.type === 'ox');
  const short = data.questions.filter((q) => q.type === 'short');
  const essay = data.questions.filter((q) => q.type === 'essay');

  ok(mc.length >= 10 && ox.length >= 8 && short.length >= 6 && essay.length >= 6,
    '유형별 문항 확보 (mc ' + mc.length + ', ox ' + ox.length +
    ', short ' + short.length + ', essay ' + essay.length + ')');

  // 5지선다
  const mcQ = mc[0];
  ok(SE.gradeQuestion(mcQ, mcQ.answer).score === 100, '5지선다 정답 → 100점');
  const wrongKey = ['a', 'b', 'c', 'd'].find((k) => k !== mcQ.answer);
  ok(SE.gradeQuestion(mcQ, wrongKey).score === 0, '5지선다 오답 → 0점');
  ok(mc.every((q) => ['a', 'b', 'c', 'd'].includes(q.answer)), '모든 5지선다 answer 가 a~d');

  // O·X
  const oxQ = ox[0];
  ok(SE.gradeQuestion(oxQ, oxQ.answer.toLowerCase()).score === 100, 'O·X 소문자 입력도 정답 처리');
  ok(SE.gradeQuestion(oxQ, oxQ.answer === 'O' ? 'X' : 'O').score === 0, 'O·X 반대 답 → 0점');

  // 단답
  const sQ = short[0];
  const spaced = ' ' + sQ.answer.split('').join(' ') + '!!';
  ok(SE.gradeQuestion(sQ, spaced).score === 100, '단답: 공백·문장부호 무시 채점');
  ok(SE.gradeQuestion(sQ, sQ.answer.toUpperCase()).score === 100 || /[ㄱ-힝]/.test(sQ.answer),
    '단답: 대소문자 무시 채점');
  ok(SE.gradeQuestion(sQ, '완전히 틀린 답변').score === 0, '단답: 오답 → 0점');
  const withAccepts = short.find((q) => q.accepts && q.accepts.length);
  if (withAccepts) {
    ok(SE.gradeQuestion(withAccepts, withAccepts.accepts[0]).score === 100,
      '단답: accepts 복수 정답 인정');
  }

  // 서술형
  const eQ = essay[0];
  ok(eQ.keywords && eQ.keywords.length >= 2, '서술형 문항에 키워드 2개 이상');
  const fullText = eQ.keywords.map((k) => k.key).join(' ') + ' 이기 때문이다.';
  const full = SE.gradeQuestion(eQ, fullText);
  ok(full.score === 100, '서술형: 모든 키워드 언급 시 100점 (' + full.score + ')');
  const single = SE.gradeQuestion(eQ, eQ.keywords[0].key);
  ok(single.score <= 35, '서술형: 키워드 1개 언급만으로 높은 점수 방지 (' + single.score + '점)');
  const empty = SE.gradeQuestion(eQ, '아무것도 모릅니다');
  ok(empty.score === 0, '서술형: 무관한 답 → 0점');
  if (eQ.anti && eQ.anti.length) {
    const anti = SE.gradeQuestion(eQ, eQ.keywords.map((k) => k.key).join(' ') + ' ' + eQ.anti[0]);
    ok(anti.score === 0, '서술형: 반대 의미 답변 포함 시 0점');
  }
  // 모든 서술형: 정답 키워드 조합이 만점을 내는지
  const essayAll = essay.every((q) => {
    const txt = q.keywords.map((k) => k.key).join(' ') + ' 때문에 결과가 나온다.';
    return SE.gradeQuestion(q, txt).score === 100;
  });
  ok(essayAll, '모든 서술형이 완전한 답안에 만점');

  // 모든 mc/ox 의 answer 유효성 + 채점 라운드트립
  const roundTrip = data.questions.filter((q) => q.type === 'mc' || q.type === 'ox')
    .every((q) => SE.gradeQuestion(q, q.answer).score === 100);
  ok(roundTrip, '모든 객관식 문항이 정답 키로 만점 처리');

  // 단답 문항 모두 자기 정답에 만점
  const shortTrip = short.every((q) => SE.gradeQuestion(q, q.answer).score === 100);
  ok(shortTrip, '모든 단답 문항이 자기 정답에 만점');
}

/* ------------------------------------------------------------------ */
section('5. 결과 통계');

if (SE) {
  const attempts = [
    { t: Date.now() - 100000, n: 10, points: 700, correct: 7,
      byUnit: { unit1: { n: 5, points: 400 }, unit2: { n: 5, points: 300 } }, wrong: [] },
    { t: Date.now() - 50000, n: 10, points: 900, correct: 9,
      byUnit: { unit1: { n: 5, points: 500 }, unit2: { n: 5, points: 400 } }, wrong: [] },
    { t: Date.now(), n: 4, points: 400, correct: 4,
      byUnit: { unit3: { n: 4, points: 400 } }, wrong: [] }
  ];
  const agg = SE.aggregateAttempts(attempts);
  ok(agg.n === 24 && agg.attempts === 3, '누적 문항 수/회차 계산 (' + agg.n + '문항, ' + agg.attempts + '회)');
  ok(agg.overall === Math.round((2000 / 2400) * 100), '전체 정답률 계산 (' + agg.overall + '%)');
  ok(agg.trend.length === 3 && agg.trend[0].score === 70 && agg.trend[2].score === 100,
    '회차별 점수 추이 계산');
  ok(agg.byUnit.unit1.n === 10, '단원별 누적 집계');
  const weak = SE.weakUnitOf(agg);
  ok(weak && weak.unitId === 'unit2', '취약 단원 판정 (' + (weak ? weak.unitId + ' ' + weak.pct + '%' : '없음') + ')');
  ok(SE.aggregateAttempts([]).overall === 0, '기록 없음 → 0%');
}

/* ------------------------------------------------------------------ */
section('6. 시각화 레지스트리');

global.SCIENCE_VIZ = undefined;
require(path.join(ROOT, 'assets', 'viz.js'));
const V = global.SCIENCE_VIZ;
ok(!!V && Array.isArray(V.items), 'viz.js 가 레지스트리 노출');
if (V) {
  ok(V.items.length >= 6, '시각화 ' + V.items.length + '종 준비');
  ok(V.items.every((i) => i.id && i.title && i.desc && i.note && typeof i.build === 'function'),
    '각 시각화에 id/제목/설명/핵심노트/build 함수 존재');
  const ids = V.items.map((i) => i.id);
  ok(new Set(ids).size === ids.length, '시각화 id 중복 없음');
}

/* ------------------------------------------------------------------ */
section('7. 데이터 ↔ 범위 정합');

if (data) {
  const expectedSections = ['1.1', '1.2', '2.1', '2.2', '3.1'];
  const sectionTitles = [];
  data.units.forEach((u) => u.sections.forEach((s) => sectionTitles.push(s.title)));
  const all = sectionTitles.join(' | ');
  const missingSec = expectedSections.filter((n) => all.indexOf(n) === -1);
  ok(missingSec.length === 0, '시험 범위 5개 절이 모두 학습자료에 존재' +
    (missingSec.length ? ' (누락: ' + missingSec.join(', ') + ')' : ''));
  const deckSections = data.decks.map((d) => d.sectionId);
  ok(expectedSections.every((n) => deckSections.some((s) => s.endsWith('-' + n.split('.')[1]) && s.startsWith('u' + n.split('.')[0]))),
    '플래시카드 덱이 시험 범위 절과 매칭');
  ok(data.questions.every((q) => expectedSections.some((n) => (q.source || '').startsWith(n))),
    '모든 퀴즈 문항의 출처가 시험 범위 절임');
}

/* ------------------------------------------------------------------ */
console.log('\n---------------------------------------');
console.log('smoke-test: 체크 ' + checks + '건, 실패 ' + failures + '건');
if (failures > 0) process.exit(1);
console.log('모든 스모크 테스트 통과');
