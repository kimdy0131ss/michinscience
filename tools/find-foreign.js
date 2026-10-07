#!/usr/bin/env node
'use strict';

/**
 * find-foreign.js
 * 한글 텍스트 파일에 중국어(한자)·일본어·러시아어 등이 잘못 섞였는지,
 * 그리고 허용되지 않는 영문 단어가 들어갔는지 검사한다.
 *
 * 사용법: node tools\find-foreign.js
 * 오탐하는 정당한 약어는 아래 LATIN_OK 에 추가한다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 허용되는 영문 토큰 (과학 약어, 필드명, 명령어, 단위 등) */
const LATIN_OK = [
  // 과학 약어
  'DNA', 'RNA', 'STR', 'F1', 'F2', 'Aa', 'Bb', 'aa', 'BB', 'AB', 'O', 'X',
  'AaBb', 'OK', 'MC', 'OX',
  // 물리량/공식 관련
  'E', 'p', 'k', 'm', 'g', 'h', 'v', 's', 'N', 'S', 'q', 'a', 'b', 'c', 'd', 'e', 'f', 'i', 'n', 'o', 'r', 't', 'u', 'w', 'y',
  'kg', 'km', 'cm', 'mm', 'ms', 'sec', 'mgh', 'mv',
  // 데이터/필드명
  'unit', 'title', 'type', 'source', 'answer', 'explain', 'accepts', 'keywords', 'anti',
  'id', 'html', 'front', 'back', 'cards', 'decks', 'questions', 'quiz', 'deck', 'label',
  'mc', 'ox', 'short', 'essay',
  'window', 'SCIENCE', 'DATA',
  // 파일/도구/설정 관련
  'node', 'tools', 'build', 'check', 'find', 'foreign', 'validate', 'text', 'smoke', 'test',
  'content', 'agent', 'flashcards', 'progress', 'assets', 'modules', 'localStorage',
  'prefers', 'color', 'scheme', 'UI', 'AI', 'LATIN', 'OK', 'vs', 'PDF', 'JS', 'HTML', 'CSS', 'JSON',
  // 문서·검증 도구에서 쓰는 용어
  'LaTeX', 'SVG', 'DOM', 'px', 'md', 'PASS', 'FAIL', 'WARN', 'units', 'sections', 'decks',
  'Chrome', 'headless', 'sweep', 'ascii', 'ASCII', 'Service', 'Worker'
];

/* 대상 파일: 한글 학습 자료 마크다운 */
function targets() {
  const list = [];
  const rootFiles = ['content.md', 'agent.md'];
  for (const f of rootFiles) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) list.push(p);
  }
  for (const dir of ['flashcards', 'quiz']) {
    const dp = path.join(ROOT, dir);
    if (!fs.existsSync(dp)) continue;
    for (const f of fs.readdirSync(dp)) {
      if (f.endsWith('.md')) list.push(path.join(dp, f));
    }
  }
  return list;
}

function checkFile(file) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const errors = [];
  const warnings = [];
  const lines = text.split(/\r?\n/);

  const okSet = new Set(LATIN_OK.map((s) => s.toLowerCase()));

  lines.forEach((line, idx) => {
    const ln = idx + 1;

    // 1) 한자(중국어) 검사
    const han = line.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g);
    if (han) errors.push(ln + ': 한자 발견: ' + Array.from(new Set(han)).join(' ') + ' :: ' + line.trim().slice(0, 60));

    // 2) 일본어 가나 검사
    const kana = line.match(/[\u3040-\u30FF]/g);
    if (kana) errors.push(ln + ': 일본어 문자 발견 :: ' + line.trim().slice(0, 60));

    // 3) 러시아어 등 한글/영문 외 문자
    const cyrillic = line.match(/[\u0400-\u04FF]/g);
    if (cyrillic) errors.push(ln + ': 러시아어 문자 발견 :: ' + line.trim().slice(0, 60));

    // 4) 허용되지 않는 영문 단어 (백틱 코드, 파일명 제외 후 2자 이상 연속 영문)
    let scan = line.replace(/`[^`]*`/g, ' ');           // 인라인 코드 제외
    scan = scan.replace(/\b[\w-]+\.(md|js|css|html|json)\b/g, ' '); // 파일명 제외
    const words = scan.match(/[A-Za-z]{2,}/g) || [];
    for (const w of words) {
      if (okSet.has(w.toLowerCase())) continue;
      warnings.push(ln + ': 확인 필요 영문 단어 "' + w + '" :: ' + line.trim().slice(0, 60));
    }
  });

  return { rel: rel, errors: errors, warnings: warnings };
}

function main() {
  let errorCount = 0;
  let warningCount = 0;
  for (const file of targets()) {
    const res = checkFile(file);
    if (res.errors.length || res.warnings.length) {
      console.log('[' + res.rel + ']');
      for (const e of res.errors) {
        console.log('  ERROR ' + e);
        errorCount += 1;
      }
      for (const w of res.warnings) {
        console.log('  WARN  ' + w);
        warningCount += 1;
      }
    }
  }
  console.log('find-foreign: 검사 파일 ' + targets().length + '개, 오류 ' + errorCount + '건, 확인 필요 ' + warningCount + '건');
  if (errorCount > 0) process.exit(1);
}

module.exports = { checkFile: checkFile, LATIN_OK: LATIN_OK };

if (require.main === module) main();
