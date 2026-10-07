#!/usr/bin/env node
'use strict';

/**
 * build.js
 * content.md + flashcards/*.md + quiz/*.md  ->  assets/data.js (+ flashcards/progress.md)
 *
 * 사용법: node build.js
 * 다른 스크립트(tools/*)에서도 파서를 재사용하기 위해 함수를 export 한다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CONTENT_PATH = path.join(ROOT, 'content.md');
const FLASH_DIR = path.join(ROOT, 'flashcards');
const QUIZ_DIR = path.join(ROOT, 'quiz');
const OUT_DATA = path.join(ROOT, 'assets', 'data.js');
const OUT_PROGRESS = path.join(FLASH_DIR, 'progress.md');

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

/* ------------------------------------------------------------------ */
/* Markdown 부분 렌더러                                                 */
/* ------------------------------------------------------------------ */

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMd(s) {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return t;
}

function isTableSep(line) {
  return /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function isListItem(line) {
  return /^\s*(-|\d+\.)\s+\S/.test(line);
}

function listItemParts(line) {
  const m = /^(\s*)(-|\d+\.)\s+(.*)$/.exec(line);
  return { indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] };
}

function renderListLines(rawLines) {
  const items = rawLines.map(listItemParts);
  const minIndent = Math.min.apply(null, items.map((it) => it.indent));
  const topOrdered = items.filter((it) => it.indent === minIndent)[0].ordered;
  let html = topOrdered ? '<ol>' : '<ul>';
  let i = 0;
  while (i < items.length) {
    if (items[i].indent > minIndent) { i += 1; continue; }
    const group = [items[i]];
    i += 1;
    while (i < items.length && items[i].indent > minIndent) { group.push(items[i]); i += 1; }
    html += '<li>' + inlineMd(group[0].text);
    const sub = group.slice(1);
    if (sub.length) {
      const subOrdered = sub[0].ordered;
      html += subOrdered ? '<ol>' : '<ul>';
      for (const s of sub) html += '<li>' + inlineMd(s.text) + '</li>';
      html += subOrdered ? '</ol>' : '</ul>';
    }
    html += '</li>';
  }
  html += topOrdered ? '</ol>' : '</ul>';
  return html;
}

function renderMd(src) {
  const lines = String(src).split(/\r?\n/);
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lv = h[1].length;
      html += '<h' + lv + '>' + inlineMd(h[2].trim()) + '</h' + lv + '>';
      i += 1;
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]) && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      html += '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      for (const c of head) html += '<th>' + inlineMd(c) + '</th>';
      html += '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>';
        for (const c of r) html += '<td>' + inlineMd(c) + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      continue;
    }

    if (isListItem(line)) {
      const buf = [];
      while (i < lines.length && (isListItem(lines[i]) || (buf.length && /^\s{2,}\S/.test(lines[i])))) {
        if (isListItem(lines[i]) || /^\s{2,}\S/.test(lines[i])) { buf.push(lines[i]); i += 1; } else break;
      }
      html += renderListLines(buf.filter((l) => isListItem(l)));
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      html += '<blockquote>' + renderMd(buf.join('\n')) + '</blockquote>';
      continue;
    }

    const para = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s/.test(lines[i]) &&
           !isListItem(lines[i]) && !/^\s*\|/.test(lines[i]) && !/^\s*>\s?/.test(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    html += '<p>' + inlineMd(para.join(' ')) + '</p>';
  }
  return html;
}

/* ------------------------------------------------------------------ */
/* content.md 파서                                                     */
/* ------------------------------------------------------------------ */

function parseContent(src) {
  const lines = String(src).split(/\r?\n/);
  const units = [];
  let unit = null;
  let section = null;
  let buf = [];

  function flush() {
    const text = buf.join('\n').trim();
    buf = [];
    if (!text) return;
    const html = renderMd(text);
    if (section) section.html += html;
    else if (unit) unit.introHtml += html;
  }

  for (const line of lines) {
    const h1 = /^#\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h1) {
      flush();
      unit = null;
      section = null;
      const title = h1[1].trim();
      const num = /^(\d+)\./.exec(title);
      unit = {
        id: num ? 'u' + num[1] : 'u' + (units.length + 1),
        num: num ? num[1] : String(units.length + 1),
        title: title,
        introHtml: '',
        sections: []
      };
      units.push(unit);
      continue;
    }
    if (h2) {
      flush();
      section = null;
      const title = h2[1].trim();
      const num = /^(\d+)\.(\d+)\./.exec(title) || /^(\d+)\.(\d+)\s/.exec(title);
      section = {
        id: num ? 'u' + num[1] + '-' + num[2] : (unit ? unit.id : 'u') + '-s' + (unit ? unit.sections.length + 1 : 0),
        title: title,
        html: ''
      };
      if (!unit) {
        unit = { id: 'u1', num: '1', title: '', introHtml: '', sections: [] };
        units.push(unit);
      }
      unit.sections.push(section);
      continue;
    }
    buf.push(line);
  }
  flush();
  return units;
}

/* ------------------------------------------------------------------ */
/* 플래시카드 파서                                                      */
/* ------------------------------------------------------------------ */

const CARD_TAGS = ['정의', '과정', '비교', '원리', '암기', '계산'];

function parseDeck(src, file) {
  const lines = String(src).split(/\r?\n/);
  const deckId = (lines[0] || '').replace(/^#\s*/, '').trim();
  const titleLine = (lines[1] || '').trim();
  const title = titleLine.replace(/^title:\s*/, '').trim();
  const cards = [];
  let front = null;
  let backLines = [];
  let tag = null;

  function push() {
    if (front === null) return;
    cards.push({
      deckId: deckId,
      type: tag,
      front: front,
      back: backLines.join('\n').trim()
    });
    front = null;
    backLines = [];
    tag = null;
  }

  for (let i = 2; i < lines.length; i += 1) {
    const line = lines[i];
    const m = /^##\s+\[([^\]]+)\]\s*(.+)$/.exec(line);
    if (m) {
      push();
      tag = m[1].trim();
      front = m[2].trim();
      continue;
    }
    if (!line.trim()) continue;
    if (front === null) continue;
    backLines.push(line.trim());
  }
  push();

  const num = /^(\d+)\.(\d+)/.exec(title);
  return {
    id: deckId,
    file: file || '',
    title: title,
    sectionId: num ? 'u' + num[1] + '-' + num[2] : '',
    unitNum: num ? num[1] : '',
    cards: cards
  };
}

function deckFiles() {
  if (!fs.existsSync(FLASH_DIR)) return [];
  return fs.readdirSync(FLASH_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'progress.md')
    .sort((a, b) => {
      const na = /(\d+)[^\d]*(\d+)/.exec(a);
      const nb = /(\d+)[^\d]*(\d+)/.exec(b);
      if (na && nb) return (Number(na[1]) - Number(nb[1])) || (Number(na[2]) - Number(nb[2]));
      return a.localeCompare(b);
    });
}

function parseAllDecks() {
  return deckFiles().map((f) => parseDeck(readText(path.join(FLASH_DIR, f)), f));
}

/* ------------------------------------------------------------------ */
/* 퀴즈 파서                                                            */
/* ------------------------------------------------------------------ */

function parseQuiz(src, file) {
  const lines = String(src).split(/\r?\n/);
  const unitId = (lines[0] || '').replace(/^#\s*/, '').trim();
  const title = (lines[1] || '').replace(/^title:\s*/, '').trim();
  const questions = [];
  let cur = null;

  function push() {
    if (!cur) return;
    questions.push(cur);
    cur = null;
  }

  for (let i = 2; i < lines.length; i += 1) {
    const line = lines[i];
    const m = /^##\s+(\S+)\s*$/.exec(line);
    if (m) {
      push();
      cur = { label: m[1], unitId: unitId, file: file || '' };
      continue;
    }
    if (!line.trim()) continue;
    if (!cur) continue;
    const c = line.indexOf(':');
    if (c < 0) continue;
    const key = line.slice(0, c).trim();
    const value = line.slice(c + 1).trim();
    cur[key] = value;
  }
  push();

  for (const q of questions) {
    if (q.type === 'mc') {
      q.choices = ['a', 'b', 'c', 'd'].map((k) => q[k] || '');
    }
    if (q.type === 'short') {
      const norm = (s) => String(s || '').toLowerCase()
        .replace(/[\s\.,!?;:·…\-–—_()\[\]{}<>"'`~·、。，]/g, '');
      const ans = (q.answer || '').trim();
      const seen = new Set([norm(ans)]);
      q.acceptList = (q.accepts || '').split('|')
        .map((s) => s.trim())
        .filter((s) => {
          if (!s || seen.has(norm(s))) return false;
          seen.add(norm(s));
          return true;
        });
    }
    if (q.type === 'essay' && q.keywords) {
      q.keywordList = q.keywords.split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
        const parts = entry.split('|');
        const w = Number(parts[1]);
        return { key: parts[0].trim(), weight: isNaN(w) || w <= 0 ? 1 : w };
      }).filter((k) => k.key);
      q.antiList = (q.anti || '').split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return { id: unitId, title: title, file: file || '', questions: questions };
}

function quizFiles() {
  if (!fs.existsSync(QUIZ_DIR)) return [];
  return fs.readdirSync(QUIZ_DIR).filter((f) => f.endsWith('.md')).sort();
}

function parseAllQuiz() {
  return quizFiles().map((f) => parseQuiz(readText(path.join(QUIZ_DIR, f)), f));
}

/* ------------------------------------------------------------------ */
/* 전체 데이터 빌드                                                     */
/* ------------------------------------------------------------------ */

function buildData() {
  const contentSrc = fs.existsSync(CONTENT_PATH) ? readText(CONTENT_PATH) : '';
  const units = parseContent(contentSrc);
  const decks = parseAllDecks();
  const quizUnits = parseAllQuiz();

  const cards = [];
  const deckMeta = [];
  for (const d of decks) {
    deckMeta.push({
      id: d.id,
      title: d.title,
      sectionId: d.sectionId,
      unitNum: d.unitNum,
      file: d.file,
      count: d.cards.length
    });
    d.cards.forEach((c, idx) => {
      cards.push({
        id: d.id + '-' + (idx + 1),
        deckId: d.id,
        type: c.type,
        front: c.front,
        back: c.back
      });
    });
  }

  const questions = [];
  for (const u of quizUnits) {
    u.questions.forEach((q) => {
      questions.push({
        id: u.id + '-' + q.label,
        unitId: u.id,
        unitTitle: u.title,
        type: q.type,
        source: q.source || '',
        q: q.q || '',
        choices: q.choices || null,
        answer: q.answer || '',
        accepts: q.acceptList || null,
        keywords: q.keywordList || null,
        anti: q.antiList || null,
        explain: q.explain || ''
      });
    });
  }

  return {
    builtAt: new Date().toISOString(),
    units: units,
    decks: deckMeta,
    cards: cards,
    quizUnits: quizUnits.map((u) => ({ id: u.id, title: u.title })),
    questions: questions,
    meta: {
      unitCount: units.length,
      sectionCount: units.reduce((n, u) => n + u.sections.length, 0),
      deckCount: deckMeta.length,
      cardCount: cards.length,
      questionCount: questions.length
    }
  };
}

function renderProgress(data) {
  const unitName = { '1': '생식과 유전', '2': '에너지 전환과 보존', '3': '별과 우주' };
  const rows = data.decks.map((d) =>
    '| ' + d.id + ' | ' + d.title + ' | ' + d.count + ' |'
  );
  const total = data.cards.length;
  return [
    '# 플래시카드 진행 상황',
    '',
    '이 파일은 `node build.js`가 자동으로 갱신합니다. 카드가 추가·삭제되면 빌드하면 표가 맞춰집니다.',
    '',
    '| 덱 | 단원 | 카드 수 |',
    '| --- | --- | --- |'
  ].concat(rows).concat([
    '| **합계** |  | **' + total + '** |',
    '',
    '## 단원별 카드 수',
    '',
    '- 1단원 ' + (unitName['1']) + ': ' + data.decks.filter((d) => d.unitNum === '1').reduce((n, d) => n + d.count, 0) + '장',
    '- 2단원 ' + (unitName['2']) + ': ' + data.decks.filter((d) => d.unitNum === '2').reduce((n, d) => n + d.count, 0) + '장',
    '- 3단원 ' + (unitName['3']) + ': ' + data.decks.filter((d) => d.unitNum === '3').reduce((n, d) => n + d.count, 0) + '장',
    '',
    '## 실제 학습 진행률',
    '',
    '- 카드별 학습 상태(알았다 / 애매했다 / 모른다, 상자 단계)는 사이트가 브라우저에 저장합니다.',
    '- 사이트의 **플래시카드** 탭에서 확인하고, **결과** 탭에서 단원별 진행 요약을 볼 수 있습니다.',
    '- 퀴즈 문항 수: ' + data.questions.length + '문항 (단원별: ' +
      data.quizUnits.map((u) => u.title.split(' ')[0] + ' ' + data.questions.filter((q) => q.unitId === u.id).length).join(', ') + ')',
    ''
  ]).join('\n');
}

function build(options) {
  const opts = options || {};
  const data = buildData();
  if (!opts.silent) {
    fs.mkdirSync(path.dirname(OUT_DATA), { recursive: true });
    const banner = '/* 이 파일은 node build.js 가 생성하는 산출물입니다. 직접 수정하지 마세요. */\n';
    fs.writeFileSync(OUT_DATA, banner + 'window.SCIENCE_DATA = ' + JSON.stringify(data) + ';\n', 'utf8');
    fs.writeFileSync(OUT_PROGRESS, renderProgress(data), 'utf8');
  }
  return data;
}

module.exports = {
  readText: readText,
  renderMd: renderMd,
  parseContent: parseContent,
  parseDeck: parseDeck,
  parseQuiz: parseQuiz,
  parseAllDecks: parseAllDecks,
  parseAllQuiz: parseAllQuiz,
  buildData: buildData,
  build: build,
  renderProgress: renderProgress,
  CARD_TAGS: CARD_TAGS,
  paths: {
    ROOT: ROOT,
    CONTENT_PATH: CONTENT_PATH,
    FLASH_DIR: FLASH_DIR,
    QUIZ_DIR: QUIZ_DIR,
    OUT_DATA: OUT_DATA,
    OUT_PROGRESS: OUT_PROGRESS
  }
};

if (require.main === module) {
  try {
    const data = build();
    console.log('build 완료: units=' + data.meta.unitCount +
      ', sections=' + data.meta.sectionCount +
      ', decks=' + data.meta.deckCount +
      ', cards=' + data.meta.cardCount +
      ', questions=' + data.meta.questionCount);
    console.log(' -> ' + path.relative(process.cwd(), OUT_DATA));
    console.log(' -> ' + path.relative(process.cwd(), OUT_PROGRESS));
  } catch (err) {
    console.error('build 실패:', err.message);
    process.exit(1);
  }
}
