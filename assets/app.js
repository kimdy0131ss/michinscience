/* ==========================================================
   중3 과학 기말 대비 — 앱 로직
   - 학습자료 / 플래시카드 / 퀴즈 / 결과 / 시각화 탭
   - 채점기(단답·서술 포함), 통계, 다크모드, 로컬 저장
   ========================================================== */
(function (global) {
  'use strict';

  var DATA = global.SCIENCE_DATA || {
    units: [], decks: [], cards: [], questions: [], quizUnits: [], meta: {}
  };

  var KEYS = {
    cards: 'sc_cards_v1',
    attempts: 'sc_attempts_v1',
    theme: 'sc_theme'
  };

  var TYPE_LABELS = { mc: '5지선다', ox: 'O·X', short: '단답형', essay: '서술형' };
  var ESSAY_FULL_MIN = 60;      // 이 점수 이상이면 '정답'으로 집계
  var ESSAY_SINGLE_CAP = 35;    // 키워드 1개만 언급 시 최고 점수

  /* ------------------------------------------------------------------ */
  /* 유틸                                                                */
  /* ------------------------------------------------------------------ */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (html != null) node.innerHTML = html;
    return node;
  }

  function normalizeAnswer(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[\s\.,!?;:·…\-–—_()\[\]{}<>"'`~·、。，：]/g, '');
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pct(part, whole) {
    if (!whole) return 0;
    return Math.round((part / whole) * 100);
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function questionById(id) {
    for (var i = 0; i < DATA.questions.length; i++) {
      if (DATA.questions[i].id === id) return DATA.questions[i];
    }
    return null;
  }

  function cardById(id) {
    for (var i = 0; i < DATA.cards.length; i++) {
      if (DATA.cards[i].id === id) return DATA.cards[i];
    }
    return null;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-show'); }, 2200);
  }

  /* ------------------------------------------------------------------ */
  /* 저장소                                                              */
  /* ------------------------------------------------------------------ */

  function safeGet(key) {
    try { var v = global.localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function safeRemove(key) {
    try { global.localStorage.removeItem(key); } catch (e) {}
  }

  function getCardState() { return safeGet(KEYS.cards) || {}; }
  function setCardState(s) { safeSet(KEYS.cards, s); }
  function getAttempts() { return safeGet(KEYS.attempts) || []; }
  function setAttempts(a) { safeSet(KEYS.attempts, a); }

  /* ------------------------------------------------------------------ */
  /* 채점 엔진 (핵심)                                                     */
  /* ------------------------------------------------------------------ */

  /** 단답형: 공백·문장부호·대소문자 무시, 복수 정답 지원 */
  function gradeShort(q, user) {
    var mine = normalizeAnswer(user);
    if (!mine) return { score: 0, correct: false };
    var answers = [q.answer].concat(q.accepts || []);
    for (var i = 0; i < answers.length; i++) {
      if (normalizeAnswer(answers[i]) === mine) {
        return { score: 100, correct: true };
      }
    }
    return { score: 0, correct: false };
  }

  /**
   * 서술형: 키워드(가중치) 커버리지로 채점
   * - 반대 의미(anti) 문구가 있으면 0점
   * - 서로 다른 키워드를 2개 이상 언급해야 높은 점수 (단어 1개 언급 방지)
   */
  function gradeEssay(q, user) {
    var text = normalizeAnswer(user);
    if (!text) return { score: 0, correct: false, matched: [] };

    var anti = q.anti || [];
    for (var a = 0; a < anti.length; a++) {
      var phrase = normalizeAnswer(anti[a]);
      if (phrase && text.indexOf(phrase) !== -1) {
        return { score: 0, correct: false, matched: [], hitAnti: anti[a] };
      }
    }

    var keys = q.keywords || [];
    var total = 0;
    var got = 0;
    var matched = [];
    for (var i = 0; i < keys.length; i++) {
      var w = keys[i].weight || 1;
      total += w;
      var k = normalizeAnswer(keys[i].key);
      if (k && text.indexOf(k) !== -1) {
        got += w;
        matched.push(keys[i].key);
      }
    }
    if (!total) return { score: 0, correct: false, matched: [] };

    var score = Math.round((got / total) * 100);
    if (matched.length === 0) score = 0;
    else if (matched.length < 2) score = Math.min(score, ESSAY_SINGLE_CAP);

    return { score: score, correct: score >= ESSAY_FULL_MIN, matched: matched };
  }

  /** 문항 채점: user 는 mc=선택지키, ox=O/X, short/essay=입력 문자열 */
  function gradeQuestion(q, user) {
    if (!q) return { score: 0, correct: false };
    if (q.type === 'mc') {
      var ok = q.answer === user;
      return { score: ok ? 100 : 0, correct: ok };
    }
    if (q.type === 'ox') {
      var ok2 = String(user || '').toUpperCase() === q.answer;
      return { score: ok2 ? 100 : 0, correct: ok2 };
    }
    if (q.type === 'short') return gradeShort(q, user);
    if (q.type === 'essay') return gradeEssay(q, user);
    return { score: 0, correct: false };
  }

  /* ------------------------------------------------------------------ */
  /* 통계                                                                */
  /* ------------------------------------------------------------------ */

  function aggregateAttempts(attempts) {
    var res = {
      n: 0, points: 0, correct: 0, attempts: attempts.length,
      byUnit: {}, trend: [], last: null
    };
    for (var i = 0; i < attempts.length; i++) {
      var a = attempts[i];
      res.n += a.n || 0;
      res.points += a.points || 0;
      res.correct += a.correct || 0;
      res.trend.push({ t: a.t, score: a.n ? Math.round(a.points / a.n) : 0 });
      for (var u in a.byUnit) {
        if (!Object.prototype.hasOwnProperty.call(a.byUnit, u)) continue;
        if (!res.byUnit[u]) res.byUnit[u] = { n: 0, points: 0 };
        res.byUnit[u].n += a.byUnit[u].n;
        res.byUnit[u].points += a.byUnit[u].points;
      }
      res.last = a;
    }
    res.overall = res.n ? Math.round((res.points / (res.n * 100)) * 100) : 0;
    return res;
  }

  function weakUnitOf(agg) {
    var best = null;
    for (var u in agg.byUnit) {
      if (!Object.prototype.hasOwnProperty.call(agg.byUnit, u)) continue;
      var d = agg.byUnit[u];
      if (!d.n) continue;
      var p = Math.round((d.points / (d.n * 100)) * 100);
      if (!best || p < best.pct) best = { unitId: u, pct: p, n: d.n };
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* 다크모드                                                            */
  /* ------------------------------------------------------------------ */

  function systemPrefersDark() {
    try { return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches; }
    catch (e) { return false; }
  }

  function storedTheme() {
    var t = safeGet(KEYS.theme);
    return (t === 'light' || t === 'dark') ? t : null;
  }

  function effectiveTheme() {
    var s = storedTheme();
    if (s) return s;
    return systemPrefersDark() ? 'dark' : 'light';
  }

  function applyThemeLabel() {
    var btn = $('#btnTheme');
    if (!btn) return;
    btn.textContent = effectiveTheme() === 'dark' ? '☀ 라이트' : '🌙 다크';
  }

  function initTheme() {
    var stored = storedTheme();
    var root = document.documentElement;
    if (stored) {
      root.setAttribute('data-theme', stored);
      root.removeAttribute('data-theme-auto');
    } else {
      root.removeAttribute('data-theme');
      root.setAttribute('data-theme-auto', 'true');
    }
    applyThemeLabel();
    var btn = $('#btnTheme');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        safeSet(KEYS.theme, next);
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.removeAttribute('data-theme-auto');
        applyThemeLabel();
        toast(next === 'dark' ? '다크모드로 전환했습니다' : '라이트모드로 전환했습니다');
      });
    }
    try {
      global.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (!storedTheme()) applyThemeLabel();
      });
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* 탭 전환                                                             */
  /* ------------------------------------------------------------------ */

  var currentView = 'content';

  function showView(name) {
    currentView = name;
    $$('.view').forEach(function (v) { v.classList.remove('is-active'); });
    var view = $('#view-' + name);
    if (view) view.classList.add('is-active');
    $$('#tabbar .tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-view') === name);
    });
    if (name === 'results') renderResults();
    if (name === 'cards') renderCardsView();
    if (name === 'viz' && global.SCIENCE_VIZ && global.SCIENCE_VIZ.current) {
      global.SCIENCE_VIZ.refresh();
    }
    if (global.location && global.location.hash !== '#/' + name) {
      try { global.history.replaceState(null, '', '#/' + name); } catch (e) {}
    }
    if (global.scrollTo) global.scrollTo(0, 0);
  }

  function initTabs() {
    $$('#tabbar .tab').forEach(function (t) {
      t.addEventListener('click', function () { showView(t.getAttribute('data-view')); });
    });
    $$('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.getAttribute('data-goto')); });
    });
    var hash = (global.location && global.location.hash || '').replace('#/', '');
    if (['content', 'cards', 'quiz', 'results', 'viz'].indexOf(hash) !== -1) showView(hash);
  }

  /* ------------------------------------------------------------------ */
  /* 학습자료                                                            */
  /* ------------------------------------------------------------------ */

  var sectionList = [];   // [{unit, section}]
  var currentSection = 0;

  function initContent() {
    var toc = $('#toc');
    if (!toc) return;
    sectionList = [];
    DATA.units.forEach(function (u) {
      var h = el('div', { class: 'toc-unit', text: u.title });
      toc.appendChild(h);
      u.sections.forEach(function (s) {
        sectionList.push({ unit: u, section: s });
        var a = el('a', { 'data-sid': s.id, text: s.title.replace(/^\d+\.\d+\.\s*/, '') });
        a.addEventListener('click', function () { showSectionById(s.id); });
        toc.appendChild(a);
      });
    });
    $('#btnPrevSection').addEventListener('click', function () { moveSection(-1); });
    $('#btnNextSection').addEventListener('click', function () { moveSection(1); });
    if (sectionList.length) showSection(0);
  }

  function showSectionById(id) {
    for (var i = 0; i < sectionList.length; i++) {
      if (sectionList[i].section.id === id) { showSection(i); return; }
    }
  }

  function showSection(idx) {
    if (idx < 0 || idx >= sectionList.length) return;
    currentSection = idx;
    var item = sectionList[idx];
    $('#contentCrumb').textContent = item.unit.title + '  ·  ' + item.section.title;
    $('#contentBody').innerHTML =
      '<h1>' + escapeHtml(item.section.title) + '</h1>' + (item.section.html || '');
    $$('#toc a').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-sid') === item.section.id);
    });
    $('#btnPrevSection').disabled = idx === 0;
    $('#btnNextSection').disabled = idx === sectionList.length - 1;
    var doc = $('.doc-panel');
    if (doc) doc.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function moveSection(delta) { showSection(currentSection + delta); }

  /* ------------------------------------------------------------------ */
  /* 플래시카드                                                          */
  /* ------------------------------------------------------------------ */

  var cardView = { deckId: null, order: [], idx: 0, flipped: false };

  function deckShortTitle(title) {
    var t = String(title).replace(/^\d+\.\d+\s*/, '');
    return t.length > 11 ? t.slice(0, 11) + '…' : t;
  }

  function initCards() {
    var sel = $('#deckSelect');
    if (!sel) return;
    DATA.decks.forEach(function (d, i) {
      var chip = el('button', { class: 'chip', type: 'button', 'data-deck': d.id, title: d.title });
      chip.textContent = d.id.replace('unit', '') + ' ' + deckShortTitle(d.title);
      chip.addEventListener('click', function () { selectDeck(d.id); });
      sel.appendChild(chip);
      if (i === 0) cardView.deckId = d.id;
    });

    $('#cardStage').addEventListener('click', flipCard);
    $('#cardStage').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(); }
    });
    $('#btnKnown').addEventListener('click', function () { rateCard('known'); });
    $('#btnMaybe').addEventListener('click', function () { rateCard('maybe'); });
    $('#btnUnknown').addEventListener('click', function () { rateCard('unknown'); });
    $('#chkShuffle').addEventListener('change', rebuildOrder);
    $('#chkWeak').addEventListener('change', rebuildOrder);
    $('#btnRestartDeck').addEventListener('click', function () {
      cardView.idx = 0;
      renderCard();
      toast('덱을 처음부터 다시 시작합니다');
    });

    selectDeck(cardView.deckId);
  }

  function renderCardsView() {
    if (cardView.deckId) renderCard();
    renderCardsSummary();
  }

  function selectDeck(id) {
    cardView.deckId = id;
    $$('#deckSelect .chip').forEach(function (c) {
      c.classList.toggle('is-active', c.getAttribute('data-deck') === id);
    });
    rebuildOrder();
  }

  function deckCards(deckId) {
    return DATA.cards.filter(function (c) { return c.deckId === deckId; });
  }

  function rebuildOrder() {
    var state = getCardState();
    var list = deckCards(cardView.deckId);
    var weakOnly = $('#chkShuffle') && $('#chkWeak') && $('#chkWeak').checked;
    if (weakOnly) {
      list = list.filter(function (c) {
        var s = state[c.id];
        return s && s.wrong > 0;
      });
      if (!list.length) {
        toast('틀린 카드가 없습니다. 카드를 먼저 학습하세요');
        $('#chkWeak').checked = false;
        list = deckCards(cardView.deckId);
      }
    }
    var ids = list.map(function (c) { return c.id; });
    if ($('#chkShuffle') && $('#chkShuffle').checked) ids = shuffle(ids);
    cardView.order = ids;
    cardView.idx = 0;
    renderCard();
  }

  function renderCard() {
    var order = cardView.order;
    var stage = $('#cardStage');
    if (!order.length) {
      $('#cardFront').textContent = '표시할 카드가 없습니다.';
      $('#cardBack').textContent = '';
      $('#cardCounter').textContent = '0 / 0';
      $('#deckProgressText').textContent = '—';
      $('#deckProgressBar').style.width = '0%';
      return;
    }
    if (cardView.idx >= order.length) cardView.idx = 0;
    var card = cardById(order[cardView.idx]);
    if (!card) return;

    stage.classList.remove('is-flipped');
    cardView.flipped = false;
    $('#cardTag').textContent = card.type || '';
    $('#cardFront').textContent = card.front;
    $('#cardBack').textContent = card.back;
    $('#cardCounter').textContent = (cardView.idx + 1) + ' / ' + order.length;

    var deck = deckCards(cardView.deckId);
    var state = getCardState();
    var seen = 0, mastered = 0, weak = 0;
    deck.forEach(function (c) {
      var s = state[c.id];
      if (s && s.seen > 0) seen++;
      if (s && s.box >= 4) mastered++;
      if (s && s.wrong > 0) weak++;
    });
    $('#deckProgressText').textContent = '학습 진행 ' + seen + ' / ' + deck.length;
    $('#deckProgressCounts').textContent =
      '완료 ' + mastered + ' · 약함 ' + weak;
    $('#deckProgressBar').style.width = pct(seen, deck.length) + '%';
  }

  function flipCard() {
    if (!cardView.order.length) return;
    cardView.flipped = !cardView.flipped;
    $('#cardStage').classList.toggle('is-flipped', cardView.flipped);
  }

  function rateCard(rating) {
    if (!cardView.order.length) return;
    var id = cardView.order[cardView.idx];
    var state = getCardState();
    var s = state[id] || { box: 1, seen: 0, wrong: 0 };
    s.seen = (s.seen || 0) + 1;
    if (rating === 'known') {
      s.box = Math.min(4, (s.box || 1) + 1);
    } else if (rating === 'maybe') {
      s.box = Math.max(1, s.box || 1);
    } else {
      s.box = Math.max(1, (s.box || 1) - 1);
      s.wrong = (s.wrong || 0) + 1;
    }
    s.last = Date.now();
    state[id] = s;
    setCardState(state);

    if (cardView.idx >= cardView.order.length - 1) {
      cardView.idx = cardView.order.length; // 끝
      renderCardDone();
      renderCardsSummary();
    } else {
      cardView.idx++;
      renderCard();
    }
  }

  function renderCardDone() {
    $('#cardFront').textContent = '이 덱을 모두 확인했습니다! 🎉';
    $('#cardBack').textContent = '다른 단원으로 넘어가거나, "처음부터"를 눌러 다시 학습하세요.';
    $('#cardTag').textContent = '완료';
    $('#cardCounter').textContent = cardView.order.length + ' / ' + cardView.order.length;
    var deck = deckCards(cardView.deckId);
    $('#deckProgressText').textContent = '학습 진행 ' + deck.length + ' / ' + deck.length;
    $('#deckProgressBar').style.width = '100%';
    $('#cardStage').classList.remove('is-flipped');
    cardView.flipped = false;
    renderCardsSummary();
  }

  function renderCardsSummary() {
    var state = getCardState();
    var total = DATA.cards.length;
    var seen = 0, mastered = 0, weak = 0;
    DATA.cards.forEach(function (c) {
      var s = state[c.id];
      if (s && s.seen > 0) seen++;
      if (s && s.box >= 4) mastered++;
      if (s && s.wrong > 0) weak++;
    });
    var node = $('#cardsSummary');
    if (node) {
      node.textContent = '전체 ' + total + '장 중 ' + seen + '장 학습 · 완료 ' +
        mastered + '장 · 다시 볼 카드 ' + weak + '장';
    }
  }

  /* ------------------------------------------------------------------ */
  /* 퀴즈                                                                */
  /* ------------------------------------------------------------------ */

  var quiz = {
    units: {}, types: {}, count: 10,
    session: null
  };

  function initQuizSetup() {
    var uc = $('#unitChecks');
    DATA.quizUnits.forEach(function (u) {
      quiz.units[u.id] = true;
      var chip = el('button', { class: 'chip is-active', type: 'button', 'data-unit': u.id });
      chip.textContent = u.title;
      chip.addEventListener('click', function () {
        quiz.units[u.id] = !quiz.units[u.id];
        chip.classList.toggle('is-active', quiz.units[u.id]);
        updateSetupInfo();
      });
      uc.appendChild(chip);
    });

    var tc = $('#typeChecks');
    ['mc', 'ox', 'short', 'essay'].forEach(function (t) {
      quiz.types[t] = true;
      var chip = el('button', { class: 'chip is-active', type: 'button', 'data-type': t });
      chip.textContent = TYPE_LABELS[t];
      chip.addEventListener('click', function () {
        quiz.types[t] = !quiz.types[t];
        chip.classList.toggle('is-active', quiz.types[t]);
        updateSetupInfo();
      });
      tc.appendChild(chip);
    });

    var cc = $('#countChecks');
    [10, 20, 0].forEach(function (n) {
      var chip = el('button', {
        class: 'chip' + (n === quiz.count ? ' is-active' : ''),
        type: 'button', 'data-count': String(n)
      });
      chip.textContent = n === 0 ? '전체' : n + '문항';
      chip.addEventListener('click', function () {
        quiz.count = n;
        $$('#countChecks .chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        updateSetupInfo();
      });
      cc.appendChild(chip);
    });

    $('#btnStart').addEventListener('click', startQuiz);
    $('#btnGrade').addEventListener('click', gradeCurrent);
    $('#btnNext').addEventListener('click', nextQuestion);
    $('#btnQuit').addEventListener('click', quitQuiz);
    $('#btnRetry').addEventListener('click', function () {
      $('#quizEnd').classList.add('is-hidden');
      $('#quizSetup').classList.remove('is-hidden');
    });
    $('#btnGoResults').addEventListener('click', function () { showView('results'); });

    updateSetupInfo();
  }

  function selectedPool() {
    return DATA.questions.filter(function (q) {
      return quiz.units[q.unitId] && quiz.types[q.type];
    });
  }

  function updateSetupInfo() {
    var pool = selectedPool();
    var n = quiz.count === 0 ? pool.length : Math.min(quiz.count, pool.length);
    var info = $('#setupInfo');
    if (!pool.length) {
      info.textContent = '선택한 조건에 해당하는 문항이 없습니다. 단원이나 유형을 다시 선택하세요.';
      $('#btnStart').disabled = true;
    } else {
      var counts = {};
      pool.forEach(function (q) { counts[q.type] = (counts[q.type] || 0) + 1; });
      info.textContent = pool.length + '문항 중 ' + n + '문항 출제 · ' +
        ['mc', 'ox', 'short', 'essay'].map(function (t) {
          return TYPE_LABELS[t] + ' ' + (counts[t] || 0);
        }).join(' / ');
      $('#btnStart').disabled = false;
    }
  }

  function startQuiz() {
    var pool = selectedPool();
    if (!pool.length) return;
    var list = shuffle(pool);
    if (quiz.count !== 0) list = list.slice(0, quiz.count);
    quiz.session = { list: list, idx: 0, results: [], graded: false };

    $('#quizSetup').classList.add('is-hidden');
    $('#quizEnd').classList.add('is-hidden');
    $('#quizPlay').classList.remove('is-hidden');
    renderQuestion();
  }

  function quitQuiz() {
    quiz.session = null;
    $('#quizPlay').classList.add('is-hidden');
    $('#quizSetup').classList.remove('is-hidden');
    toast('퀴즈를 종료했습니다 (기록은 저장되지 않습니다)');
  }

  function renderQuestion() {
    var s = quiz.session;
    if (!s) return;
    if (s.idx >= s.list.length) { finishQuiz(); return; }
    var q = s.list[s.idx];
    s.graded = false;
    s.user = null;

    $('#quizProgress').textContent = (s.idx + 1) + ' / ' + s.list.length;
    $('#quizBar').style.width = pct(s.idx, s.list.length) + '%';
    $('#quizUnitBadge').textContent = q.unitTitle;
    $('#quizTypeBadge').textContent = TYPE_LABELS[q.type];
    $('#quizSourceBadge').textContent = q.source ? ('출처: ' + q.source) : '';
    $('#quizQuestion').textContent = q.q;

    var area = $('#quizAnswerArea');
    area.innerHTML = '';
    $('#quizFeedback').className = 'quiz-feedback is-hidden';
    $('#quizFeedback').innerHTML = '';
    $('#btnGrade').classList.remove('is-hidden');
    $('#btnNext').classList.add('is-hidden');
    $('#btnGrade').disabled = false;

    if (q.type === 'mc') {
      var wrap = el('div', { class: 'choice-list' });
      ['a', 'b', 'c', 'd'].forEach(function (key, i) {
        var btn = el('button', { class: 'choice', type: 'button', 'data-key': key });
        btn.innerHTML = '<span class="choice-key">' + (i + 1) + '.</span><span>' +
          escapeHtml(q.choices[i]) + '</span>';
        btn.addEventListener('click', function () {
          if (s.graded) return;
          s.user = key;
          $$('.choice', area).forEach(function (c) { c.classList.remove('is-selected'); });
          btn.classList.add('is-selected');
        });
        wrap.appendChild(btn);
      });
      area.appendChild(wrap);
    } else if (q.type === 'ox') {
      var ox = el('div', { class: 'ox-row' });
      ['O', 'X'].forEach(function (v) {
        var btn = el('button', { class: 'ox-btn', type: 'button', 'data-key': v });
        btn.textContent = v === 'O' ? 'O (맞음)' : 'X (틀림)';
        btn.addEventListener('click', function () {
          if (s.graded) return;
          s.user = v;
          $$('.ox-btn', ox).forEach(function (c) { c.classList.remove('is-selected'); });
          btn.classList.add('is-selected');
        });
        ox.appendChild(btn);
      });
      area.appendChild(ox);
    } else if (q.type === 'short') {
      area.appendChild(el('label', { class: 'answer-label', text: '답을 입력하세요 (공백·표점 무시)' }));
      var input = el('input', { class: 'text-input', type: 'text', id: 'shortInput',
        placeholder: '답을 입력한 뒤 채점을 누르세요', autocomplete: 'off' });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); gradeCurrent(); }
      });
      area.appendChild(input);
      setTimeout(function () { input.focus(); }, 30);
    } else {
      area.appendChild(el('label', { class: 'answer-label',
        text: '핵심 개념을 연결하여 문장으로 설명하세요 (키워드와 관계로 채점)' }));
      var ta = el('textarea', { class: 'essay-input', id: 'essayInput',
        placeholder: '예: 롤러코스터가 내려올 때 … 때문에 … 이기 때문이다.' });
      area.appendChild(ta);
      setTimeout(function () { ta.focus(); }, 30);
    }
  }

  function gradeCurrent() {
    var s = quiz.session;
    if (!s || s.graded) return;
    var q = s.list[s.idx];
    var user = s.user;

    if (q.type === 'short') user = ($('#shortInput') || {}).value || '';
    if (q.type === 'essay') user = ($('#essayInput') || {}).value || '';

    if (user == null || String(user).trim() === '') {
      toast('답을 입력해 주세요');
      return;
    }

    var r = gradeQuestion(q, user);
    s.graded = true;
    s.userAnswer = String(user);
    s.results.push({ id: q.id, unitId: q.unitId, type: q.type, score: r.score, ua: String(user) });

    // 화면에 정답 표시
    if (q.type === 'mc') {
      $$('#quizAnswerArea .choice').forEach(function (btn, i) {
        btn.disabled = true;
        var key = btn.getAttribute('data-key');
        if (key === q.answer) btn.classList.add('is-correct');
        else if (key === s.user) btn.classList.add('is-wrong');
      });
    } else if (q.type === 'ox') {
      $$('#quizAnswerArea .ox-btn').forEach(function (btn) {
        btn.disabled = true;
        var key = btn.getAttribute('data-key');
        if (key === q.answer) btn.classList.add('is-correct');
        else if (key === s.user) btn.classList.add('is-wrong');
      });
    } else {
      var input = $('#shortInput') || $('#essayInput');
      if (input) input.disabled = true;
    }

    var fb = $('#quizFeedback');
    var level = r.score >= 100 ? 'is-correct' : (r.score >= 60 ? 'is-partial' : 'is-wrong');
    var title;
    if (r.score >= 100) title = '정답입니다!';
    else if (r.score >= 60) title = '부분 정답 (' + r.score + '점)';
    else if (r.score > 0) title = '아쉬워요 (' + r.score + '점)';
    else title = '오답입니다';

    var html = '<div class="fb-title">' + title + '</div>';
    if (q.type === 'short') {
      html += '<div class="fb-answer">정답: <b>' + escapeHtml(q.answer) + '</b></div>';
    }
    if (q.type === 'essay') {
      if (r.matched && r.matched.length) {
        html += '<div class="fb-answer">찾은 개념: <b>' +
          escapeHtml(r.matched.join(' · ')) + '</b></div>';
      } else {
        html += '<div class="fb-answer">핵심 개념이 거의 나타나지 않았습니다.</div>';
      }
      if (r.hitAnti) {
        html += '<div class="fb-answer">반대되는 표현 감지: <b>' +
          escapeHtml(r.hitAnti) + '</b></div>';
      }
      html += '<div class="fb-answer">모범 답안 흐름: <b>' + escapeHtml(q.explain) + '</b></div>';
    } else {
      html += '<div class="fb-explain">' + escapeHtml(q.explain) + '</div>';
    }
    fb.innerHTML = html;
    fb.className = 'quiz-feedback ' + level;

    $('#btnGrade').classList.add('is-hidden');
    $('#btnNext').classList.remove('is-hidden');
    $('#btnNext').textContent = (s.idx >= s.list.length - 1) ? '결과 보기 →' : '다음 문제 →';
    $('#btnNext').focus();
  }

  function nextQuestion() {
    var s = quiz.session;
    if (!s) return;
    s.idx++;
    if (s.idx >= s.list.length) finishQuiz();
    else renderQuestion();
  }

  function finishQuiz() {
    var s = quiz.session;
    if (!s) return;

    var points = 0, correct = 0, byUnit = {}, byType = {};
    s.results.forEach(function (r) {
      points += r.score;
      if (r.score >= ESSAY_FULL_MIN) correct++;
      if (!byUnit[r.unitId]) byUnit[r.unitId] = { n: 0, points: 0 };
      byUnit[r.unitId].n++;
      byUnit[r.unitId].points += r.score;
      if (!byType[r.type]) byType[r.type] = { n: 0, points: 0 };
      byType[r.type].n++;
      byType[r.type].points += r.score;
    });

    var n = s.results.length;
    var score = n ? Math.round(points / n) : 0;

    var attempt = {
      t: Date.now(),
      n: n,
      points: points,
      correct: correct,
      byUnit: byUnit,
      byType: byType,
      wrong: s.results.filter(function (r) { return r.score < ESSAY_FULL_MIN; })
    };
    var attempts = getAttempts();
    attempts.push(attempt);
    if (attempts.length > 60) attempts = attempts.slice(-60);
    setAttempts(attempts);

    // 화면
    $('#quizPlay').classList.add('is-hidden');
    $('#quizEnd').classList.remove('is-hidden');
    $('#scoreNum').textContent = score;
    var ring = $('#scoreRing');
    var circ = 2 * Math.PI * 52;
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = circ - (circ * score) / 100;
    ring.style.stroke = score >= 80 ? 'var(--good)' : (score >= 60 ? 'var(--warn)' : 'var(--bad)');

    var unitLines = Object.keys(byUnit).map(function (u) {
      var d = byUnit[u];
      var name = (DATA.quizUnits.filter(function (x) { return x.id === u; })[0] || {}).title || u;
      return '<div class="line">' + escapeHtml(name) + ': ' +
        pct(d.points, d.n * 100) + '%</div>';
    }).join('');

    $('#endSummary').innerHTML =
      '<div class="line"><b>' + correct + ' / ' + n + '문항 정답</b></div>' + unitLines +
      '<div class="line muted">기록은 "결과" 탭에 저장되었습니다.</div>';

    quiz.session = null;
    renderCardsSummary();
  }

  /* ------------------------------------------------------------------ */
  /* 결과 분석                                                            */
  /* ------------------------------------------------------------------ */

  function renderResults() {
    var attempts = getAttempts();
    var empty = $('#resEmpty');
    var body = $('#resBody');
    if (!attempts.length) {
      empty.classList.remove('is-hidden');
      body.classList.add('is-hidden');
      return;
    }
    empty.classList.add('is-hidden');
    body.classList.remove('is-hidden');

    var agg = aggregateAttempts(attempts);
    $('#statOverall').textContent = agg.overall + '%';
    $('#statOverallSub').textContent = agg.correct + ' / ' + agg.n + '문항 정답';
    $('#statAttempts').textContent = agg.attempts + '회';
    $('#statAttemptsSub').textContent = '최근 ' + fmtDate(agg.last ? agg.last.t : Date.now()) +
      ' · ' + (agg.last ? Math.round(agg.last.points / agg.last.n) : 0) + '점';

    // 단원별
    var weak = weakUnitOf(agg);
    var unitBars = $('#resUnits');
    unitBars.innerHTML = '';
    DATA.quizUnits.forEach(function (u) {
      var d = agg.byUnit[u.id] || { n: 0, points: 0 };
      var p = d.n ? pct(d.points, d.n * 100) : 0;
      var row = el('div', { class: 'unit-bar-row' });
      row.innerHTML =
        '<div>' + escapeHtml(u.title) + '</div>' +
        '<div class="unit-bar-track"><div class="unit-bar-fill ' +
        (p < 60 ? 'is-low' : (p < 80 ? 'is-mid' : '')) + '" style="width:' + p + '%"></div></div>' +
        '<div class="unit-bar-val">' + (d.n ? p + '%' : '—') + '</div>';
      unitBars.appendChild(row);
    });

    var weakCard = $('#weakCard');
    if (weak) {
      var name = (DATA.quizUnits.filter(function (x) { return x.id === weak.unitId; })[0] || {}).title || weak.unitId;
      $('#statWeak').textContent = name;
      $('#statWeakSub').textContent = weak.pct + '% (문항 ' + weak.n + '개)';
      weakCard.classList.toggle('is-alert', weak.pct < 70);
    } else {
      $('#statWeak').textContent = '—';
      $('#statWeakSub').textContent = '';
      weakCard.classList.remove('is-alert');
    }

    // 플래시카드 요약
    var state = getCardState();
    var seen = 0, mastered = 0;
    DATA.cards.forEach(function (c) {
      var s = state[c.id];
      if (s && s.seen > 0) seen++;
      if (s && s.box >= 4) mastered++;
    });
    $('#statCards').textContent = mastered + ' / ' + DATA.cards.length;
    $('#statCardsSub').textContent = '학습함 ' + seen + '장 · 완료 ' + mastered + '장';

    renderTrend(agg.trend);
    renderWrongList(attempts[attempts.length - 1]);
    renderWeakCards(state);

    $('#btnResetQuiz').onclick = function () {
      if (confirm('퀴즈 기록을 모두 지울까요?')) {
        safeRemove(KEYS.attempts);
        renderResults();
        toast('퀴즈 기록을 초기화했습니다');
      }
    };
    $('#btnResetCards').onclick = function () {
      if (confirm('플래시카드 학습 기록을 모두 지울까요?')) {
        safeRemove(KEYS.cards);
        renderResults();
        renderCardsSummary();
        toast('플래시카드 기록을 초기화했습니다');
      }
    };
  }

  function renderTrend(trend) {
    var box = $('#resTrend');
    if (!trend.length) { box.innerHTML = '<div class="trend-empty">기록 없음</div>'; return; }
    var w = 640, h = 200, pad = 34;
    var max = 100;
    var step = trend.length > 1 ? (w - pad * 2) / (trend.length - 1) : 0;
    var pts = trend.map(function (p, i) {
      var x = pad + (trend.length > 1 ? i * step : (w - pad * 2) / 2);
      var y = h - pad - (p.score / max) * (h - pad * 2);
      return { x: x, y: y, p: p };
    });
    var line = pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    var dots = pts.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4.5" fill="var(--accent)">' +
        '<title>' + fmtDate(p.p.t) + ' · ' + p.p.score + '점</title></circle>';
    }).join('');
    var labels = pts.map(function (p, i) {
      if (trend.length > 8 && i % Math.ceil(trend.length / 8) !== 0 && i !== trend.length - 1) return '';
      return '<text x="' + p.x.toFixed(1) + '" y="' + (h - 12) +
        '" font-size="11" fill="var(--text-soft)" text-anchor="middle">' + fmtDate(p.p.t) + '</text>';
    }).join('');
    var grid = [0, 25, 50, 75, 100].map(function (v) {
      var y = h - pad - (v / max) * (h - pad * 2);
      return '<line x1="' + pad + '" y1="' + y + '" x2="' + (w - pad) + '" y2="' + y +
        '" stroke="var(--border)" stroke-dasharray="3 4"></line>' +
        '<text x="' + (pad - 8) + '" y="' + (y + 4) + '" font-size="10" fill="var(--text-soft)" text-anchor="end">' + v + '</text>';
    }).join('');

    box.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="회차별 점수 추이">' +
      grid +
      '<polyline points="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"></polyline>' +
      dots + labels + '</svg>';
  }

  function renderWrongList(attempt) {
    var box = $('#resWrong');
    box.innerHTML = '';
    var wrong = (attempt && attempt.wrong) || [];
    $('#wrongCount').textContent = wrong.length ? '(' + wrong.length + '개)' : '';
    if (!wrong.length) {
      box.innerHTML = '<div class="empty-line">최근 회차에서는 틀린 문제가 없습니다. 잘했어요!</div>';
      return;
    }
    wrong.slice().reverse().forEach(function (w) {
      var q = questionById(w.id);
      if (!q) return;
      var item = el('div', { class: 'wrong-item' });
      var answerLine = '';
      if (q.type === 'mc') {
        var idx = ['a', 'b', 'c', 'd'].indexOf(q.answer);
        answerLine = '정답: <b>' + (idx + 1) + '. ' + escapeHtml(q.choices[idx]) + '</b>';
      } else if (q.type === 'ox') {
        answerLine = '정답: <b>' + q.answer + '</b>';
      } else if (q.type === 'short') {
        answerLine = '정답: <b>' + escapeHtml(q.answer) + '</b>';
      } else {
        answerLine = '모범 답안 흐름: <b>' + escapeHtml(q.explain) + '</b>';
      }
      var my = '';
      if (q.type === 'mc' && w.ua) {
        var mi = ['a', 'b', 'c', 'd'].indexOf(w.ua);
        if (mi >= 0) my = '내 답: ' + (mi + 1) + '. ' + escapeHtml(q.choices[mi]) + ' · ';
      } else if (w.ua && q.type !== 'essay') {
        my = '내 답: ' + escapeHtml(w.ua) + ' · ';
      } else if (q.type === 'essay') {
        my = '획득 ' + w.score + '점 · ';
      }
      item.innerHTML =
        '<div class="wrong-meta"><span class="badge badge-soft">' + escapeHtml(q.source || q.unitTitle) +
        '</span><span class="badge badge-type">' + TYPE_LABELS[q.type] +
        '</span><span class="badge">득점 ' + w.score + '</span></div>' +
        '<div class="wrong-q" style="margin-top:7px">' + escapeHtml(q.q) + '</div>' +
        '<div class="wrong-a">' + my + answerLine + '</div>' +
        (q.type === 'essay' ? '' : '<div class="wrong-explain">' + escapeHtml(q.explain) + '</div>');
      box.appendChild(item);
    });
  }

  function renderWeakCards(state) {
    var box = $('#resWeakCards');
    box.innerHTML = '';
    var list = DATA.cards.filter(function (c) {
      var s = state[c.id];
      return s && s.wrong > 0;
    }).sort(function (a, b) { return (state[b.id].wrong || 0) - (state[a.id].wrong || 0); });

    if (!list.length) {
      box.innerHTML = '<div class="empty-line">자주 틀린 카드가 없습니다. 플래시카드를 더 학습하면 이곳에 표시됩니다.</div>';
      return;
    }
    list.slice(0, 8).forEach(function (c) {
      var s = state[c.id];
      var deck = DATA.decks.filter(function (d) { return d.id === c.deckId; })[0];
      var item = el('div', { class: 'wrong-item is-weakcard' });
      item.innerHTML =
        '<div class="wrong-meta"><span class="badge badge-soft">' +
        escapeHtml(deck ? deck.title : c.deckId) + '</span>' +
        '<span class="badge badge-type">' + escapeHtml(c.type || '') + '</span>' +
        '<span class="badge">틀림 ' + s.wrong + '회</span></div>' +
        '<div class="wrong-q" style="margin-top:7px">' + escapeHtml(c.front) + '</div>' +
        '<div class="wrong-a">정답: <b>' + escapeHtml(c.back.replace(/\n/g, ' ')) + '</b></div>';
      box.appendChild(item);
    });
    if (list.length > 8) {
      box.appendChild(el('div', { class: 'empty-line', text: '외 ' + (list.length - 8) + '장 더 있음' }));
    }
  }

  /* ------------------------------------------------------------------ */
  /* 시각화 탭                                                           */
  /* ------------------------------------------------------------------ */

  function initViz() {
    var V = global.SCIENCE_VIZ;
    var list = $('#vizList');
    if (!V || !list) return;
    V.items.forEach(function (item, i) {
      var chip = el('button', { class: 'chip' + (i === 0 ? ' is-active' : ''), type: 'button',
        'data-viz': item.id });
      chip.textContent = item.title;
      chip.addEventListener('click', function () {
        $$('#vizList .chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        V.select(item.id);
      });
      list.appendChild(chip);
    });
    V.select(V.items[0].id);
  }

  /* ------------------------------------------------------------------ */
  /* 초기화                                                              */
  /* ------------------------------------------------------------------ */

  function init() {
    initTheme();
    initTabs();
    initContent();
    initCards();
    initQuizSetup();
    if (global.SCIENCE_VIZ) initViz();
    else if (global.addEventListener) global.addEventListener('load', initViz);
    renderCardsSummary();

    var footer = $('#footerInfo');
    if (footer && DATA.meta) {
      var built = DATA.builtAt ? new Date(DATA.builtAt) : null;
      footer.textContent = '카드 ' + (DATA.meta.cardCount || 0) + '장 · 퀴즈 ' +
        (DATA.meta.questionCount || 0) + '문항 · 자료 생성 ' +
        (built ? built.getFullYear() + '.' + (built.getMonth() + 1) + '.' + built.getDate() : '—');
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  /* 외부(테스트) 공개 */
  global.SE = {
    normalizeAnswer: normalizeAnswer,
    gradeShort: gradeShort,
    gradeEssay: gradeEssay,
    gradeQuestion: gradeQuestion,
    aggregateAttempts: aggregateAttempts,
    weakUnitOf: weakUnitOf,
    shuffle: shuffle,
    pct: pct,
    fmtDate: fmtDate,
    effectiveTheme: effectiveTheme,
    questionById: questionById,
    TYPE_LABELS: TYPE_LABELS,
    data: DATA
  };

})(typeof window !== 'undefined' ? window : globalThis);
