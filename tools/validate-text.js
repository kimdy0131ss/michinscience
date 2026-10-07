#!/usr/bin/env node
'use strict';

/**
 * validate-text.js
 * 플래시카드 문자열 검사
 *   - 앞면/뒷면 비어 있지 않은지, 길이 적정한지
 *   - 잘못 들어간 마크다운 기호/특수문자
 *   - 덱 간 중복 질문
 *   - progress.md 의 카드 수와 실제 카드 수 일치
 *
 * 사용법: node tools\validate-text.js
 */

const fs = require('fs');
const path = require('path');
const build = require(path.join(__dirname, '..', 'build.js'));

const FRONT_MAX = 70;
const BACK_MAX = 160;
const BACK_LINES_MAX = 4;

function main() {
  const errors = [];
  const warnings = [];
  const decks = build.parseAllDecks();

  if (decks.length === 0) errors.push('flashcards 디렉터리에 카드 파일이 없습니다.');

  const seenFront = new Map();
  let total = 0;
  const tagCount = {};

  for (const d of decks) {
    if (!d.id) errors.push(d.file + ': 첫 줄의 # 덱ID 가 없습니다.');
    if (!d.title) errors.push(d.file + ': title 이 없습니다.');
    if (d.cards.length === 0) errors.push(d.file + ': 카드가 없습니다.');

    for (const c of d.cards) {
      total += 1;
      const where = d.file + ' [' + c.front.slice(0, 20) + ']';

      if (!build.CARD_TAGS.includes(c.type)) errors.push(where + ': 잘못된 태그 (' + c.type + ')');
      else tagCount[c.type] = (tagCount[c.type] || 0) + 1;

      if (!c.front || !c.front.trim()) errors.push(d.file + ': 빈 질문');
      if (!c.back || !c.back.trim()) errors.push(where + ': 빈 답변');

      if (c.front && c.front.length > FRONT_MAX) {
        warnings.push(where + ': 질문이 깁니다 (' + c.front.length + '자 > ' + FRONT_MAX + ')');
      }
      if (c.back && c.back.length > BACK_MAX) {
        warnings.push(where + ': 답변이 깁니다 (' + c.back.length + '자 > ' + BACK_MAX + ')');
      }
      if (c.back && c.back.split('\n').length > BACK_LINES_MAX) {
        warnings.push(where + ': 답변 줄 수가 많습니다');
      }

      if (/\*\*|__|`/.test(c.front + c.back)) warnings.push(where + ': 카드에 마크다운 기호가 있습니다');
      if (/[#|<>{}]/.test(c.front + c.back)) errors.push(where + ': 금지된 특수문자 포함');
      if (/\s{2,}/.test(c.front + c.back)) warnings.push(where + ': 연속 공백');
      if ((c.front || '').trim() !== c.front) errors.push(where + ': 질문 앞뒤 공백');
      if ((c.back || '').trim() !== c.back) errors.push(where + ': 답변 앞뒤 공백');
      if ((c.front || '').endsWith('?') === false && !/[?？]$/.test(c.front || '')) {
        warnings.push(where + ': 질문이 물음표로 끝나지 않습니다');
      }

      const key = (c.front || '').replace(/\s/g, '');
      if (seenFront.has(key)) errors.push(where + ': 다른 덱과 질문 중복 (' + seenFront.get(key) + ')');
      else seenFront.set(key, d.file);
    }
  }

  // 단원 태그 분포 확인 (정의형만 있는 덱 경고)
  for (const d of decks) {
    const types = new Set(d.cards.map((c) => c.type));
    if (types.size < 3) warnings.push(d.file + ': 카드 유형이 ' + types.size + '종류뿐입니다 (3종류 이상 권장)');
    if (!types.has('정의')) warnings.push(d.file + ': 정의형 카드가 없습니다');
    if (!types.has('과정') && !types.has('비교') && !types.has('원리')) {
      warnings.push(d.file + ': 과정/비교/원리형 카드가 없습니다');
    }
  }

  // progress.md 카드 수 일치 확인
  const progressPath = path.join(build.paths.FLASH_DIR, 'progress.md');
  if (fs.existsSync(progressPath)) {
    const text = fs.readFileSync(progressPath, 'utf8');
    for (const d of decks) {
      const row = new RegExp('\\|\\s*' + d.id + '\\s*\\|[^\\n]*\\|\\s*(\\d+)\\s*\\|').exec(text);
      if (!row) {
        warnings.push('progress.md: ' + d.id + ' 행이 없습니다 (node build.js 로 갱신)');
      } else if (Number(row[1]) !== d.cards.length) {
        errors.push('progress.md: ' + d.id + ' 카드 수 불일치 (표 ' + row[1] + ' / 실제 ' + d.cards.length + ')');
      }
    }
    const totalRow = /\|\s*\*\*합계\*\*\s*\|[^\n]*\|\s*\*\*(\d+)\*\*\s*\|/.exec(text);
    if (totalRow && Number(totalRow[1]) !== total) {
      errors.push('progress.md: 총 카드 수 불일치 (표 ' + totalRow[1] + ' / 실제 ' + total + ')');
    }
  } else {
    warnings.push('progress.md 가 없습니다 (node build.js 로 생성)');
  }

  for (const w of warnings) console.log('WARN  ' + w);
  for (const e of errors) console.log('ERROR ' + e);

  const tags = Object.keys(tagCount).map((k) => k + ' ' + tagCount[k]).join(', ');
  console.log('validate-text: 카드 ' + total + '장 (' + tags + '), 오류 ' + errors.length +
    '건, 경고 ' + warnings.length + '건');

  if (errors.length > 0) process.exit(1);
}

if (require.main === module) main();
