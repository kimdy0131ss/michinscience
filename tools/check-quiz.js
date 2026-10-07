#!/usr/bin/env node
'use strict';

/**
 * check-quiz.js
 * quiz/*.md 의 문항 구조와 정답 데이터를 검증한다.
 *
 * 사용법: node tools\check-quiz.js
 */

const path = require('path');
const build = require(path.join(__dirname, '..', 'build.js'));

const TYPES = ['mc', 'ox', 'short', 'essay'];

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s\.,!?;:·…\-–—_()\[\]{}<>"'`~·、。，]/g, '');
}

function main() {
  const errors = [];
  const warnings = [];
  const units = build.parseAllQuiz();

  if (units.length === 0) errors.push('quiz 디렉터리에 문항 파일이 없습니다.');

  const seenIds = new Set();
  const seenQuestions = new Set();
  let total = 0;
  const typeCount = { mc: 0, ox: 0, short: 0, essay: 0 };
  const oxCount = { O: 0, X: 0 };

  for (const u of units) {
    if (!u.id) errors.push(u.file + ': 파일 첫 줄의 # unitId 가 없습니다.');
    if (!u.title) errors.push(u.file + ': title 이 없습니다.');
    if (u.questions.length === 0) errors.push(u.file + ': 문항이 없습니다.');

    for (const q of u.questions) {
      total += 1;
      const label = u.file + ' ' + q.label;

      const id = u.id + '-' + q.label;
      if (seenIds.has(id)) errors.push(label + ': 중복 ID (' + id + ')');
      seenIds.add(id);

      if (!TYPES.includes(q.type)) {
        errors.push(label + ': type 오류 (' + q.type + ')');
        continue;
      }
      typeCount[q.type] += 1;

      if (!q.q || !q.q.trim()) errors.push(label + ': q(문제)가 없습니다.');
      if (!q.source || !q.source.trim()) errors.push(label + ': source(출처)가 없습니다.');
      if (!q.explain || !q.explain.trim()) errors.push(label + ': explain(해설)이 없습니다.');

      const dupQ = normalize(q.q);
      if (seenQuestions.has(dupQ)) warnings.push(label + ': 문제 문구가 다른 문항과 중복됩니다.');
      seenQuestions.add(dupQ);

      if (q.type === 'mc') {
        const missing = ['a', 'b', 'c', 'd'].filter((k) => !q[k] || !q[k].trim());
        if (missing.length) errors.push(label + ': 선택지 누락 (' + missing.join(',') + ')');
        if (!/^[a-d]$/.test(q.answer || '')) errors.push(label + ': answer 는 a/b/c/d 여야 합니다 (' + q.answer + ')');
        if (q.answer && q[q.answer] && normalize(q.q) === normalize(q[q.answer])) {
          warnings.push(label + ': 문제와 정답 선택지가 거의 같습니다.');
        }
        const normChoices = ['a', 'b', 'c', 'd'].map((k) => normalize(q[k]));
        if (new Set(normChoices).size !== 4) errors.push(label + ': 선택지가 서로 겹칩니다.');
      }

      if (q.type === 'ox') {
        if (q.answer !== 'O' && q.answer !== 'X') errors.push(label + ': ox answer 는 O 또는 X (' + q.answer + ')');
        else oxCount[q.answer] += 1;
      }

      if (q.type === 'short') {
        if (!q.answer || !q.answer.trim()) errors.push(label + ': short answer 가 없습니다.');
        const list = [q.answer].concat(q.acceptList || []).map((s) => normalize(s)).filter(Boolean);
        if (list.length === 0) errors.push(label + ': 채점 가능한 답이 없습니다.');
        if (new Set(list).size !== list.length) warnings.push(label + ': answer/accepts 중복');
        if (q.answer && q.answer.trim().split(/\s+/).length > 5) {
          warnings.push(label + ': 답이 깁니다 (시험 대비용으로 짧게)');
        }
      }

      if (q.type === 'essay') {
        if (!q.keywords || !q.keywords.trim()) {
          errors.push(label + ': essay keywords 가 없습니다.');
        } else {
          const entries = q.keywords.split(',').map((s) => s.trim()).filter(Boolean);
          if (entries.length < 2) errors.push(label + ': keywords 가 2개 이상이어야 합니다.');
          let weightSum = 0;
          for (const e of entries) {
            const parts = e.split('|');
            if (!parts[0] || !parts[0].trim()) errors.push(label + ': 빈 키워드 (' + e + ')');
            const w = Number(parts[1]);
            if (parts.length > 1 && (isNaN(w) || w <= 0)) errors.push(label + ': 가중치 오류 (' + e + ')');
            if (parts.length > 1) weightSum += isNaN(w) || w <= 0 ? 1 : w;
            else weightSum += 1;
          }
          if (weightSum < 4) warnings.push(label + ': 키워드 가중치 합이 작아 채점 변별력이 낮습니다 (' + weightSum + ')');
        }
        if (q.anti) {
          const anti = q.anti.split(',').map((s) => s.trim()).filter(Boolean);
          if (anti.length === 0) warnings.push(label + ': anti 가 비어 있습니다.');
          const kw = (q.keywords || '').split(',').map((s) => s.trim().split('|')[0].trim());
          for (const a of anti) {
            if (kw.some((k) => k === a)) {
              warnings.push(label + ': anti("' + a + '") 가 키워드와 정확히 같습니다. 채점이 모호해질 수 있습니다.');
            }
          }
        }
      }
    }
  }

  // 유형별 최소 수량
  if (typeCount.mc < 12) warnings.push('mc 문항이 ' + typeCount.mc + '개입니다 (12개 이상 권장)');
  if (typeCount.ox < 8) warnings.push('ox 문항이 ' + typeCount.ox + '개입니다 (8개 이상 권장)');
  if (typeCount.short < 6) warnings.push('short 문항이 ' + typeCount.short + '개입니다 (6개 이상 권장)');
  if (typeCount.essay < 6) warnings.push('essay 문항이 ' + typeCount.essay + '개입니다 (6개 이상 권장)');
  if (Math.abs(oxCount.O - oxCount.X) > 4) warnings.push('O/X 문항 비율이 크게 쏠립니다 (O ' + oxCount.O + ' / X ' + oxCount.X + ')');

  // 각 단원에 4유형이 모두 있는지
  for (const u of units) {
    const ts = new Set(u.questions.map((q) => q.type));
    for (const t of TYPES) {
      if (!ts.has(t)) warnings.push(u.file + ': ' + t + ' 문항이 없습니다.');
    }
  }

  for (const w of warnings) console.log('WARN  ' + w);
  for (const e of errors) console.log('ERROR ' + e);

  console.log('check-quiz: 문항 ' + total + '개 (mc ' + typeCount.mc + ', ox ' + typeCount.ox +
    ', short ' + typeCount.short + ', essay ' + typeCount.essay + '), 오류 ' + errors.length +
    '건, 경고 ' + warnings.length + '건');

  if (errors.length > 0) process.exit(1);
}

if (require.main === module) main();
