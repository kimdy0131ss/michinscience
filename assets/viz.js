/* ==========================================================
   중3 과학 시각화 모듈
   - 세포 분열 / 감수 분열
   - 멘델 유전 모의실험
   - 역학적 에너지 전환·보존
   - 발전기 원리
   - 별의 색과 표면 온도
   - 연주 시차 거리 측정
   - 밝기로 거리 측정
   ========================================================== */
(function (global) {
  'use strict';

  function h(tag, attrs, html) {
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

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function controls(items) {
    var row = h('div', { class: 'viz-controls' });
    items.forEach(function (it) { row.appendChild(it); });
    return row;
  }

  function btn(label, cls, onClick) {
    var b = h('button', { class: 'btn btn-small ' + (cls || ''), type: 'button', text: label });
    b.addEventListener('click', onClick);
    return b;
  }

  function readout(pairs) {
    var row = h('div', { class: 'viz-readout' });
    pairs.forEach(function (p) {
      row.appendChild(h('span', {}, esc(p[0]) + ': <span class="val" data-r="' + p[1] + '">—</span>'));
    });
    return row;
  }

  function setRead(root, key, value) {
    var node = root.querySelector('[data-r="' + key + '"]');
    if (node) node.textContent = value;
  }

  function svgWrap(inner, vb) {
    return '<svg viewBox="' + (vb || '0 0 420 230') + '" width="100%" style="max-width:560px" role="img">' +
      inner + '</svg>';
  }

  /* ================================================================== */
  /* 1. 세포 분열 / 감수 분열                                             */
  /* ================================================================== */

  function chromosomeX(x, y, color, scale) {
    var s = scale || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')" stroke="' + color +
      '" stroke-width="4" stroke-linecap="round">' +
      '<line x1="-7" y1="-9" x2="7" y2="9"></line>' +
      '<line x1="-7" y1="9" x2="7" y2="-9"></line></g>';
  }

  function chromatidV(x, y, color, dir, scale) {
    var s = scale || 1;
    var d = dir > 0 ? 1 : -1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + d * s + ',' + s + ')" stroke="' +
      color + '" stroke-width="4" stroke-linecap="round" fill="none">' +
      '<path d="M -8 -9 Q 4 0 -8 9"></path></g>';
  }

  function cellCircle(cx, cy, r, fill) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
      '" fill="' + (fill || 'var(--bg-elev)') + '" stroke="var(--accent)" stroke-width="2.5"></circle>';
  }

  function nucleus(cx, cy, r) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
      '" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5" opacity="0.9"></circle>';
  }

  function spindle(cx, w) {
    return '<g stroke="var(--text-soft)" stroke-width="1.3" opacity="0.65">' +
      '<line x1="' + (cx - w) + '" y1="60" x2="' + cx + '" y2="115"></line>' +
      '<line x1="' + (cx - w) + '" y1="170" x2="' + cx + '" y2="115"></line>' +
      '<line x1="' + (cx + w) + '" y1="60" x2="' + cx + '" y2="115"></line>' +
      '<line x1="' + (cx + w) + '" y1="170" x2="' + cx + '" y2="115"></line></g>';
  }

  var MITOSIS_STEPS = [
    {
      label: '간기',
      desc: '세포가 자라고 염색체(DNA)가 복제된다. 핵 속의 염색체는 아직 실 모양이다.',
      draw: function () {
        return cellCircle(210, 115, 88) + nucleus(210, 115, 34) +
          '<g stroke="var(--accent)" stroke-width="2.5" fill="none" opacity="0.75">' +
          '<path d="M195 105 q10 -8 20 2 t18 -4"></path>' +
          '<path d="M192 124 q12 8 24 -2 t16 6"></path></g>' +
          '<text x="210" y="222" font-size="13" text-anchor="middle" fill="var(--text-soft)">세포 성장 + 염색체 복제</text>';
      }
    },
    {
      label: '전기',
      desc: '핵막과 핵소체가 사라지고 염색체가 뚜렷해진다. 방추사가 형성된다.',
      draw: function () {
        var out = cellCircle(210, 115, 88);
        out += spindle(210, 78);
        out += chromosomeX(175, 80, 'var(--bad)') + chromosomeX(245, 82, 'var(--bad)');
        out += chromosomeX(178, 152, 'var(--accent)') + chromosomeX(246, 150, 'var(--accent)');
        out += '<text x="210" y="222" font-size="13" text-anchor="middle" fill="var(--text-soft)">핵막 파괴 · 방추사 형성</text>';
        return out;
      }
    },
    {
      label: '중기',
      desc: '염색체가 세포의 한가운데(중심평면)에 나란히 배열된다.',
      draw: function () {
        var out = cellCircle(210, 115, 88) + spindle(210, 78);
        out += chromosomeX(210, 72, 'var(--bad)') + chromosomeX(210, 100, 'var(--accent)');
        out += chromosomeX(210, 130, 'var(--accent)') + chromosomeX(210, 158, 'var(--bad)');
        out += '<line x1="210" y1="52" x2="210" y2="178" stroke="var(--warn)" stroke-dasharray="4 4" stroke-width="2"></line>';
        out += '<text x="210" y="222" font-size="13" text-anchor="middle" fill="var(--text-soft)">염색체 나란히 배열</text>';
        return out;
      }
    },
    {
      label: '후기',
      desc: '자매 염색체가 서로 떨어져 양극으로 이동한다. 염색체 수가 잠시 늘어난다.',
      draw: function () {
        var out = cellCircle(210, 115, 88) + spindle(210, 78);
        out += chromatidV(168, 78, 'var(--bad)', 1) + chromatidV(168, 104, 'var(--accent)', 1);
        out += chromatidV(168, 134, 'var(--accent)', 1) + chromatidV(168, 160, 'var(--bad)', 1);
        out += chromatidV(252, 78, 'var(--bad)', -1) + chromatidV(252, 104, 'var(--accent)', -1);
        out += chromatidV(252, 134, 'var(--accent)', -1) + chromatidV(252, 160, 'var(--bad)', -1);
        out += '<text x="210" y="222" font-size="13" text-anchor="middle" fill="var(--text-soft)">자매 염색체 양극 이동</text>';
        return out;
      }
    },
    {
      label: '말기',
      desc: '염색체가 염색질로 돌아가고 핵막·핵소체가 다시 만들어진다. 이후 세포질이 갈라져 딸세포 2개가 된다.',
      draw: function () {
        var out = '<g>' + cellCircle(138, 115, 66) + nucleus(138, 115, 26) + '</g>';
        out += '<g>' + cellCircle(286, 115, 66) + nucleus(286, 115, 26) + '</g>';
        out += chromosomeX(130, 108, 'var(--bad)', 0.7) + chromosomeX(146, 124, 'var(--accent)', 0.7);
        out += chromosomeX(278, 108, 'var(--accent)', 0.7) + chromosomeX(294, 124, 'var(--bad)', 0.7);
        out += '<text x="210" y="222" font-size="13" text-anchor="middle" fill="var(--text-soft)">딸세포 2개 · 염색체 수 모세포와 동일</text>';
        return out;
      }
    }
  ];

  var MEIOSIS_STEPS = [
    {
      label: '모세포 (2n)',
      desc: '염색체가 한 쌍씩(2개 1쌍) 이루어져 있다. 예: 4개 = 2쌍.',
      draw: function () {
        var out = cellCircle(210, 115, 88) + nucleus(210, 115, 40);
        out += chromosomeX(190, 96, 'var(--bad)') + chromosomeX(232, 96, 'var(--bad)');
        out += chromosomeX(190, 136, 'var(--accent)') + chromosomeX(232, 136, 'var(--accent)');
        out += '<text x="210" y="222" font-size="13" text-anchor="middle" fill="var(--text-soft)">2n = 4 (쌍 2개)</text>';
        return out;
      }
    },
    {
      label: '1회 분열 후',
      desc: '감수 분열 1회: 염색체 쌍(동원 염색체)이 서로 나뉘어 세포 2개로 갈라진다. 각 세포의 염색체 수는 절반(n)이다.',
      draw: function () {
        var out = cellCircle(126, 115, 66) + cellCircle(300, 115, 66);
        out += chromosomeX(126, 96, 'var(--bad)') + chromosomeX(126, 134, 'var(--accent)');
        out += chromosomeX(300, 96, 'var(--bad)') + chromosomeX(300, 134, 'var(--accent)');
        out += '<text x="210" y="222" font-size="13" text-anchor="middle" fill="var(--text-soft)">세포 2개 · 각 n = 2 (아직 2배체 형태)</text>';
        return out;
      }
    },
    {
      label: '2회 분열 후',
      desc: '감수 분열 2회: 자매 염색체가 갈라져 최종적으로 세포 4개가 되고, 각 세포의 염색체 수는 절반(n)으로 끝난다.',
      draw: function () {
        var out = '';
        var xs = [78, 166, 254, 342];
        var colors = ['var(--bad)', 'var(--accent)', 'var(--bad)', 'var(--accent)'];
        for (var i = 0; i < 4; i++) {
          out += cellCircle(xs[i], 115, 44);
          out += chromatidV(xs[i], 115, colors[i], 1, 0.9);
        }
        out += '<text x="210" y="222" font-size="13" text-anchor="middle" fill="var(--text-soft)">정자·난자와 같은 생식 세포 4개 · 각 n = 2</text>';
        return out;
      }
    }
  ];

  function buildCellDivision(stage) {
    var mode = 'mitosis';
    var step = 0;
    var timer = null;

    var svgBox = h('div', {}, '');
    var desc = h('div', { class: 'viz-label', text: '' });
    desc.style.textAlign = 'center';
    desc.style.fontWeight = '600';

    function steps() { return mode === 'mitosis' ? MITOSIS_STEPS : MEIOSIS_STEPS; }

    function render() {
      var list = steps();
      if (step >= list.length) step = 0;
      svgBox.innerHTML = svgWrap(list[step].draw());
      desc.textContent = list[step].label + ' — ' + list[step].desc;
      stepBtns.forEach(function (b, i) {
        b.classList.toggle('is-active', i === step);
        b.disabled = false;
      });
      modeBtns.forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-mode') === mode);
      });
    }

    var stepBtns = [];
    var modeBtns = [
      btn('체세포 분열', '', function () { mode = 'mitosis'; step = 0; stop(); render(); }),
      btn('감수 분열 (생식 세포)', '', function () { mode = 'meiosis'; step = 0; stop(); render(); })
    ];
    modeBtns[0].setAttribute('data-mode', 'mitosis');
    modeBtns[1].setAttribute('data-mode', 'meiosis');

    var stepRow = h('div', { class: 'viz-controls' });
    function rebuildStepRow() {
      stepRow.innerHTML = '';
      stepBtns = [];
      steps().forEach(function (s, i) {
        var b = btn(s.label, '', function () { stop(); step = i; render(); });
        stepBtns.push(b);
        stepRow.appendChild(b);
      });
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      playBtn.textContent = '자동 재생';
    }

    var playBtn = btn('자동 재생', 'btn-primary', function () {
      if (timer) { stop(); return; }
      playBtn.textContent = '일시정지';
      timer = setInterval(function () {
        step = (step + 1) % steps().length;
        render();
      }, 1600);
    });

    stage.appendChild(controls(modeBtns.concat([playBtn])));
    stage.appendChild(stepRow);
    stage.appendChild(svgBox);
    stage.appendChild(desc);

    rebuildStepRow();
    render();

    return function () { stop(); };
  }

  /* ================================================================== */
  /* 2. 멘델 유전 모의실험                                               */
  /* ================================================================== */

  function buildMendel(stage) {
    var mom = 'Aa', dad = 'Aa';

    function select(id, label, value, onChange) {
      var wrap = h('label', { class: 'viz-label', text: label + ' ' });
      var sel = h('select', { id: id });
      ['AA', 'Aa', 'aa'].forEach(function (g) {
        var o = h('option', { value: g, text: g + (g === 'AA' ? ' (우성 고정)' : g === 'Aa' ? ' (이형접합)' : ' (열성 고정)') });
        if (g === value) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { onChange(sel.value); });
      wrap.appendChild(sel);
      wrap.style.fontWeight = '700';
      return wrap;
    }

    var gridBox = h('div', {}, '');
    var barsBox = h('div', {}, '');
    var resultBox = h('div', { class: 'viz-label', text: '실험을 실행하면 확률이 이론 비율에 가까워집니다.' });
    resultBox.style.textAlign = 'center';

    function gametes(g) { return g === 'AA' ? ['A', 'A'] : g === 'Aa' ? ['A', 'a'] : ['a', 'a']; }

    function phenotype(g) { return g.indexOf('A') !== -1 ? '우성' : '열성'; }

    function renderPunnett() {
      var gm = gametes(mom), gd = gametes(dad);
      var results = [];
      for (var i = 0; i < 2; i++) {
        for (var j = 0; j < 2; j++) {
          var g = (gm[i] + gd[j]).split('').sort().join('');
          results.push(g);
        }
      }
      var dom = results.filter(phenotype).length;
      gridBox.innerHTML =
        '<table class="viz-table">' +
        '<tr><th></th><th>정자 ' + esc(gd[0]) + '</th><th>정자 ' + esc(gd[1]) + '</th></tr>' +
        '<tr><th>난자 ' + esc(gm[0]) + '</th><td>' + esc(results[0]) + '</td><td>' + esc(results[1]) + '</td></tr>' +
        '<tr><th>난자 ' + esc(gm[1]) + '</th><td>' + esc(results[2]) + '</td><td>' + esc(results[3]) + '</td></tr>' +
        '</table>';
      var theoDom = (dom / 4) * 100;
      renderBars(theoDom, null);
      resultBox.textContent = '이론 비율 — 우성 ' + dom + ' : 열성 ' + (4 - dom) +
        ' (우성 ' + Math.round(theoDom) + '%)';
    }

    function renderBars(theo, obs) {
      var obsDom = obs ? obs.dom : null;
      function bar(label, pctVal, color, dashed) {
        return '<div class="unit-bar-row" style="grid-template-columns:90px 1fr 52px">' +
          '<div>' + esc(label) + '</div>' +
          '<div class="unit-bar-track"><div class="unit-bar-fill" style="width:' + pctVal +
          '%;background:' + color + (dashed ? ';opacity:.55' : '') + '"></div></div>' +
          '<div class="unit-bar-val">' + Math.round(pctVal) + '%</div></div>';
      }
      var html = bar('이론 우성', theo, 'var(--accent)', true);
      if (obsDom != null) html += bar('실험 우성', obsDom, 'var(--good)', false);
      barsBox.innerHTML = '<div class="unit-bars">' + html + '</div>';
    }

    function run(times) {
      var dom = 0;
      for (var i = 0; i < times; i++) {
        var gm = gametes(mom), gd = gametes(dad);
        var g = (gm[Math.floor(Math.random() * 2)] + gd[Math.floor(Math.random() * 2)]);
        if (g.indexOf('A') !== -1) dom++;
      }
      var theo = 0;
      var gm2 = gametes(mom), gd2 = gametes(dad);
      for (var a = 0; a < 2; a++) {
        for (var b = 0; b < 2; b++) {
          if ((gm2[a] + gd2[b]).indexOf('A') !== -1) theo++;
        }
      }
      renderBars((theo / 4) * 100, { dom: (dom / times) * 100 });
      resultBox.textContent = times + '회 실험 결과 — 우성 ' + dom + '회, 열성 ' +
        (times - dom) + '회 (우성 ' + Math.round((dom / times) * 100) + '%) · 이론 ' +
        Math.round((theo / 4) * 100) + '%';
    }

    stage.appendChild(controls([
      select('momG', '모', mom, function (v) { mom = v; renderPunnett(); }),
      select('dadG', '부', dad, function (v) { dad = v; renderPunnett(); })
    ]));
    stage.appendChild(gridBox);
    stage.appendChild(controls([
      btn('100회 실험', 'btn-primary', function () { run(100); }),
      btn('500회', '', function () { run(500); }),
      btn('1000회', '', function () { run(1000); })
    ]));
    stage.appendChild(barsBox);
    stage.appendChild(resultBox);

    renderPunnett();
    return function () {};
  }

  /* ================================================================== */
  /* 3. 역학적 에너지 전환과 보존                                         */
  /* ================================================================== */

  function buildEnergy(stage) {
    var G = 9.8;
    var height = 6, mass = 2;
    var t = 0, playing = false, raf = null, lastTs = 0;
    var duration = 3200;

    var svgBox = h('div', {}, '');
    var barsBox = h('div', {}, '');
    var ro = h('div', { class: 'viz-readout' });
    var ro2 = h('div', { class: 'viz-readout' });

    function slider(label, min, max, step, val, fmt, onInput) {
      var wrap = h('label', { class: 'viz-label' });
      wrap.innerHTML = esc(label) + ' <b data-v>' + fmt(val) + '</b>';
      var inp = h('input', { type: 'range', min: min, max: max, step: step });
      inp.value = val;
      inp.addEventListener('input', function () {
        onInput(Number(inp.value));
        wrap.querySelector('b').textContent = fmt(Number(inp.value));
        t = 0; stop(); render();
      });
      wrap.appendChild(inp);
      return wrap;
    }

    function energiesAt(progress) {
      var y = height * (1 - progress);
      var pe = mass * G * y;
      var total = mass * G * height;
      var ke = total - pe;
      var v = Math.sqrt((2 * ke) / mass);
      return { y: y, pe: pe, ke: ke, total: total, v: v };
    }

    function render() {
      var e = energiesAt(t);
      // 궤적: 왼쪽 높은 곳 → 오른쪽 바닥
      var x0 = 60, y0 = 45, x1 = 330, y1 = 185;
      var bx = x0 + (x1 - x0) * t;
      var by = y0 + (y1 - y0) * t;
      var svg =
        '<path d="M ' + x0 + ' ' + y0 + ' L ' + x1 + ' ' + y1 + ' L 390 185" fill="none" stroke="var(--text-soft)" stroke-width="6" stroke-linecap="round"></path>' +
        '<line x1="60" y1="185" x2="390" y2="185" stroke="var(--border)" stroke-width="2" stroke-dasharray="5 5"></line>' +
        '<line x1="60" y1="' + y0 + '" x2="60" y2="185" stroke="var(--accent)" stroke-width="2"></line>' +
        '<text x="46" y="' + ((y0 + 185) / 2) + '" font-size="12" fill="var(--accent)" text-anchor="end">h</text>' +
        '<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="14" fill="var(--accent)"></circle>' +
        '<text x="390" y="205" font-size="12" fill="var(--text-soft)" text-anchor="end">바닥 (기준면)</text>';
      svgBox.innerHTML = svgWrap(svg);

      var pePct = (e.pe / e.total) * 100;
      var kePct = (e.ke / e.total) * 100;
      barsBox.innerHTML =
        '<div class="unit-bars">' +
        '<div class="unit-bar-row" style="grid-template-columns:110px 1fr 78px"><div>위치 에너지</div><div class="unit-bar-track"><div class="unit-bar-fill" style="width:' + pePct + '%;background:var(--accent)"></div></div><div class="unit-bar-val">' + Math.round(e.pe) + ' J</div></div>' +
        '<div class="unit-bar-row" style="grid-template-columns:110px 1fr 78px"><div>운동 에너지</div><div class="unit-bar-track"><div class="unit-bar-fill" style="width:' + kePct + '%;background:var(--good)"></div></div><div class="unit-bar-val">' + Math.round(e.ke) + ' J</div></div>' +
        '<div class="unit-bar-row" style="grid-template-columns:110px 1fr 78px"><div><b>역학적 에너지</b></div><div class="unit-bar-track"><div class="unit-bar-fill" style="width:100%;background:var(--warn)"></div></div><div class="unit-bar-val">' + Math.round(e.total) + ' J</div></div>' +
        '</div>';
      ro.innerHTML = '현재 높이 <span class="val">' + e.y.toFixed(1) + ' m</span> · 속도 <span class="val">' +
        e.v.toFixed(1) + ' m/s</span>';
      ro2.innerHTML = '위치 + 운동 = <span class="val">' + Math.round(e.pe + e.ke) +
        ' J</span> (항상 일정)';
    }

    function tick(ts) {
      if (!playing) return;
      if (!lastTs) lastTs = ts;
      var dt = ts - lastTs;
      lastTs = ts;
      t = Math.min(1, t + dt / duration);
      render();
      if (t >= 1) { stop(); return; }
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      playing = false;
      lastTs = 0;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      playBtn.textContent = '떨어뜨리기';
    }

    var playBtn = btn('떨어뜨리기', 'btn-primary', function () {
      if (playing) { stop(); return; }
      if (t >= 1) t = 0;
      playing = true;
      playBtn.textContent = '일시정지';
      raf = requestAnimationFrame(tick);
    });

    var resetBtn = btn('처음 위치로', '', function () { stop(); t = 0; render(); });

    stage.appendChild(controls([
      slider('높이 h (m)', 2, 10, 0.5, height, function (v) { return v + ' m'; }, function (v) { height = v; }),
      slider('질량 m (kg)', 1, 6, 0.5, mass, function (v) { return v + ' kg'; }, function (v) { mass = v; })
    ]));
    stage.appendChild(controls([playBtn, resetBtn]));
    stage.appendChild(svgBox);
    stage.appendChild(barsBox);
    stage.appendChild(ro);
    stage.appendChild(ro2);

    render();
    return function () { stop(); };
  }

  /* ================================================================== */
  /* 4. 발전기 원리                                                      */
  /* ================================================================== */

  function buildGenerator(stage) {
    var angle = 0, playing = false, raf = null, speed = 1, lastTs = 0;

    var svgBox = h('div', {}, '');
    var ro = h('div', { class: 'viz-readout' });

    function render() {
      var s = Math.sin(angle);
      var cur = s;                       // 유도 전류(유사)
      var bright = Math.abs(s);          // 전구 밝기
      var dirRight = cur >= 0;
      var arrow = dirRight ? 'M 0 0 L 46 0 M 36 -8 L 46 0 L 36 8' : 'M 46 0 L 0 0 M 10 -8 L 0 0 L 10 8';

      var svg =
        '<defs><radialGradient id="bulbG"><stop offset="0%" stop-color="#fff59a" stop-opacity="' + (0.25 + bright * 0.75) + '"></stop><stop offset="100%" stop-color="#ffd54f" stop-opacity="0"></stop></radialGradient></defs>' +
        // 코일
        '<g stroke="var(--warn)" stroke-width="4" fill="none">' +
        '<path d="M 150 70 q 26 0 26 22 q 0 22 -26 22"></path>' +
        '<path d="M 162 70 q 26 0 26 22 q 0 22 -26 22"></path>' +
        '<path d="M 174 70 q 26 0 26 22 q 0 22 -26 22"></path>' +
        '</g>' +
        '<line x1="150" y1="92" x2="90" y2="92" stroke="var(--warn)" stroke-width="3"></line>' +
        '<line x1="196" y1="92" x2="300" y2="92" stroke="var(--warn)" stroke-width="3"></line>' +
        // 전류 방향 화살표
        '<g transform="translate(210,110)" stroke="var(--good)" stroke-width="3" fill="none"><path d="' + arrow + '"></path></g>' +
        '<text x="232" y="100" font-size="12" fill="var(--good)">전류</text>' +
        // 전구
        '<circle cx="330" cy="92" r="' + (20 + bright * 6) + '" fill="url(#bulbG)"></circle>' +
        '<circle cx="330" cy="92" r="17" fill="' + (bright > 0.35 ? '#ffe082' : 'var(--bg-elev)') + '" stroke="var(--text-soft)" stroke-width="2"></circle>' +
        '<text x="330" y="140" font-size="12" fill="var(--text-soft)" text-anchor="middle">전구</text>' +
        // 회전 자석
        '<g transform="translate(80,150) rotate(' + ((angle * 180) / Math.PI).toFixed(1) + ')">' +
        '<rect x="-46" y="-13" width="46" height="26" rx="6" fill="#e05a5a" stroke="var(--text)" stroke-width="1.5"></rect>' +
        '<rect x="0" y="-13" width="46" height="26" rx="6" fill="#5a8fe0" stroke="var(--text)" stroke-width="1.5"></rect>' +
        '<text x="-24" y="5" font-size="13" fill="#fff" text-anchor="middle" font-weight="700">N</text>' +
        '<text x="24" y="5" font-size="13" fill="#fff" text-anchor="middle" font-weight="700">S</text>' +
        '</g>' +
        '<text x="80" y="195" font-size="12" fill="var(--text-soft)" text-anchor="middle">회전하는 자석</text>' +
        // 화살표
        '<path d="M 112 150 L 138 120" stroke="var(--text-soft)" stroke-width="2" marker-end="none" stroke-dasharray="4 4"></path>' +
        '<text x="210" y="215" font-size="13" text-anchor="middle" fill="var(--text-soft)">운동 에너지 → 전기 에너지</text>';

      svgBox.innerHTML = svgWrap(svg);
      ro.innerHTML = '회전 각도 <span class="val">' + Math.round(((angle * 180) / Math.PI) % 360) +
        '°</span> · 상대 전류 <span class="val">' + cur.toFixed(2) +
        '</span> · 전구 밝기 <span class="val">' + Math.round(bright * 100) + '%</span>';
    }

    function tick(ts) {
      if (!playing) return;
      if (!lastTs) lastTs = ts;
      var dt = ts - lastTs;
      lastTs = ts;
      angle += (dt / 1000) * 2.4 * speed;
      render();
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      playing = false;
      lastTs = 0;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      playBtn.textContent = '회전 시작';
    }

    var playBtn = btn('회전 시작', 'btn-primary', function () {
      if (playing) { stop(); return; }
      playing = true;
      playBtn.textContent = '정지';
      raf = requestAnimationFrame(tick);
    });

    var speedLabel = h('label', { class: 'viz-label' });
    speedLabel.innerHTML = '회전 속도 <b>보통</b>';
    var speedInput = h('input', { type: 'range', min: '0.4', max: '3', step: '0.1' });
    speedInput.value = '1';
    speedInput.addEventListener('input', function () {
      speed = Number(speedInput.value);
      speedLabel.querySelector('b').textContent = speed < 1 ? '느림' : speed > 1.8 ? '빠름' : '보통';
    });
    speedLabel.appendChild(speedInput);

    stage.appendChild(controls([playBtn]));
    stage.appendChild(controls([speedLabel]));
    stage.appendChild(svgBox);
    stage.appendChild(ro);

    render();
    return function () { stop(); };
  }

  /* ================================================================== */
  /* 5. 별의 색과 표면 온도                                               */
  /* ================================================================== */

  function buildStarColor(stage) {
    var STEPS = [
      { name: '붉은색', color: '#e05545', temp: '가장 낮음', stars: '★☆☆☆☆',
        note: '차가운 별에 가깝다. 붉은색 계열의 별은 표면 온도가 가장 낮다.' },
      { name: '주황색', color: '#f0913a', temp: '낮음', stars: '★★☆☆☆',
        note: '붉은색보다는 높은 온도이다.' },
      { name: '노란색', color: '#f5d547', temp: '중간', stars: '★★★☆☆',
        note: '중간 정도의 표면 온도이다.' },
      { name: '흰색', color: '#f7f7f2', temp: '높음', stars: '★★★★☆',
        note: '높은 온도의 별은 흰색에 가깝게 보인다.' },
      { name: '푸른색', color: '#5a8fe8', temp: '가장 높음', stars: '★★★★★',
        note: '뜨거운 별일수록 푸른색 계열의 빛을 낸다.' }
    ];
    var idx = 3;

    var starBox = h('div', {}, '');
    var info = h('div', { class: 'viz-readout' });
    var note = h('div', { class: 'viz-label' });
    note.style.textAlign = 'center';

    function render() {
      var s = STEPS[idx];
      var spectrum = STEPS.map(function (x) { return x.color; }).join(',');
      starBox.innerHTML =
        '<svg viewBox="0 0 420 200" width="100%" style="max-width:560px">' +
        '<defs><radialGradient id="starG"><stop offset="55%" stop-color="' + s.color + '"></stop>' +
        '<stop offset="100%" stop-color="' + s.color + '" stop-opacity="0"></stop></radialGradient></defs>' +
        '<circle cx="210" cy="86" r="72" fill="url(#starG)" opacity="0.75"></circle>' +
        '<circle cx="210" cy="86" r="44" fill="' + s.color + '" stroke="rgba(0,0,0,.25)" stroke-width="2"></circle>' +
        '<rect x="60" y="168" width="300" height="16" rx="8" style="fill:url(#spec)"></rect>' +
        '<defs><linearGradient id="spec" x1="0" x2="1">' +
        STEPS.map(function (x, i) {
          return '<stop offset="' + (i / (STEPS.length - 1)) * 100 + '%" stop-color="' + x.color + '"></stop>';
        }).join('') + '</linearGradient></defs>' +
        '<circle cx="' + (60 + (idx / (STEPS.length - 1)) * 300) + '" cy="176" r="11" fill="var(--bg-elev)" stroke="var(--text)" stroke-width="3"></circle>' +
        '<text x="60" y="200" font-size="11" fill="var(--text-soft)">차가움</text>' +
        '<text x="360" y="200" font-size="11" fill="var(--text-soft)" text-anchor="end">뜨거움</text>' +
        '</svg>';
      info.innerHTML = '별의 색: <span class="val">' + esc(s.name) +
        '</span> · 표면 온도: <span class="val">' + esc(s.temp) + '</span> · 온도 등급 ' + s.stars;
      note.textContent = s.note;
    }

    var row = h('div', { class: 'viz-controls' });
    STEPS.forEach(function (s, i) {
      var b = btn(s.name, '', function () { idx = i; sync(); render(); });
      b.setAttribute('data-i', String(i));
      row.appendChild(b);
    });

    function sync() {
      Array.prototype.forEach.call(row.children, function (b, i) {
        b.classList.toggle('is-active', i === idx);
      });
    }

    var range = h('input', { type: 'range', min: '0', max: '4', step: '1' });
    range.value = String(idx);
    range.addEventListener('input', function () {
      idx = Number(range.value);
      range.value = String(idx);
      sync();
      render();
    });

    stage.appendChild(row);
    stage.appendChild(range);
    stage.appendChild(starBox);
    stage.appendChild(info);
    stage.appendChild(note);

    sync();
    render();
    return function () {};
  }

  /* ================================================================== */
  /* 6. 연주 시차 거리 측정                                               */
  /* ================================================================== */

  function buildParallax(stage) {
    var ratio = 30;   // 별까지 거리 = 궤도 반지름의 ratio 배
    var r = 60;

    var svgBox = h('div', {}, '');
    var ro = h('div', { class: 'viz-readout' });

    function render() {
      var d = r * ratio;
      var angleDeg = 2 * Math.atan(r / d) * (180 / Math.PI);
      var starX = 210, starY = 34;
      var gEarthY = 170;
      var e1x = starX - r, e2x = starX + r;
      // 시차 각도 표시용 호
      var arcR = 46;
      var p1 = angleFrom(starX, starY, e1x, gEarthY);
      var p2 = angleFrom(starX, starY, e2x, gEarthY);
      var arc = sampleArc(starX, starY, arcR, p2, p1);

      var svg =
        // 배경 별선
        '<line x1="30" y1="8" x2="390" y2="8" stroke="var(--border)" stroke-width="2"></line>' +
        '<circle cx="120" cy="8" r="4" fill="var(--text-soft)"></circle>' +
        '<circle cx="300" cy="8" r="4" fill="var(--text-soft)"></circle>' +
        // 시선
        '<line x1="' + e1x + '" y1="' + gEarthY + '" x2="' + starX + '" y2="' + starY + '" stroke="var(--accent)" stroke-width="2"></line>' +
        '<line x1="' + e2x + '" y1="' + gEarthY + '" x2="' + starX + '" y2="' + starY + '" stroke="var(--good)" stroke-width="2"></line>' +
        // 별
        '<g transform="translate(' + starX + ',' + starY + ')">' +
        '<path d="M0 -16 L4.5 -5 L16 -5 L7 2 L10 13 L0 6 L-10 13 L-7 2 L-16 -5 L-4.5 -5 Z" fill="var(--warn)"></path></g>' +
        '<text x="' + (starX + 26) + '" y="' + (starY + 4) + '" font-size="13" fill="var(--text)">별</text>' +
        // 각도
        '<path d="' + arc + '" fill="none" stroke="var(--bad)" stroke-width="2.5"></path>' +
        '<text x="' + (starX + 8) + '" y="' + (starY + 62) + '" font-size="12" fill="var(--bad)" text-anchor="middle">시차 ' +
        angleDeg.toFixed(4) + '°</text>' +
        // 지구 궤도
        '<ellipse cx="' + starX + '" cy="' + gEarthY + '" rx="' + r + '" ry="26" fill="none" stroke="var(--text-soft)" stroke-dasharray="5 5" stroke-width="2"></ellipse>' +
        '<circle cx="' + e1x + '" cy="' + gEarthY + '" r="9" fill="#4f8ef7"></circle>' +
        '<circle cx="' + e2x + '" cy="' + gEarthY + '" r="9" fill="#4f8ef7"></circle>' +
        '<text x="' + e1x + '" y="' + (gEarthY + 24) + '" font-size="11" fill="var(--text-soft)" text-anchor="middle">지구 (1월)</text>' +
        '<text x="' + e2x + '" y="' + (gEarthY + 24) + '" font-size="11" fill="var(--text-soft)" text-anchor="middle">지구 (7월)</text>' +
        '<text x="' + starX + '" y="' + (gEarthY + 52) + '" font-size="12" fill="var(--text-soft)" text-anchor="middle">공전 궤도 반지름 r</text>';

      svgBox.innerHTML = svgWrap(svg, '0 0 420 230');
      ro.innerHTML = '거리 <span class="val">r의 ' + ratio + '배</span> · 시차각 <span class="val">' +
        angleDeg.toFixed(4) + '°</span>';
      noteEl.innerHTML = ratio >= 25
        ? '<b>거리가 멀수록 시차각이 작다.</b> 시차가 작게 측정되면 그 별은 더 멀리 있다는 결론을 내릴 수 있다.'
        : '<b>거리가 가까울수록 시차각이 크다.</b> 가까운 별일수록 6개월 사이 위치 변화가 뚜렷하게 보인다.';
    }

    function angleFrom(cx, cy, x, y) {
      return Math.atan2(y - cy, x - cx) * (180 / Math.PI);
    }

    function polar(cx, cy, r, angle) {
      var a = angle * Math.PI / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }

    function sampleArc(cx, cy, r, startAngle, endAngle) {
      var pts = [];
      var steps = 12;
      for (var i = 0; i <= steps; i++) {
        var a = startAngle + ((endAngle - startAngle) * i) / steps;
        var p = polar(cx, cy, r, a);
        pts.push(p[0].toFixed(1) + ' ' + p[1].toFixed(1));
      }
      return 'M ' + pts.join(' L ');
    }

    var noteEl = h('div', { class: 'viz-label' });
    noteEl.style.textAlign = 'center';

    var wrap = h('label', { class: 'viz-label' });
    wrap.innerHTML = '별까지의 거리 (공전 궤도 반지름의 <b>30</b>배)';
    var range = h('input', { type: 'range', min: '5', max: '120', step: '1' });
    range.value = '30';
    range.addEventListener('input', function () {
      ratio = Number(range.value);
      wrap.querySelector('b').textContent = String(ratio);
      render();
    });
    wrap.appendChild(range);

    stage.appendChild(controls([wrap]));
    stage.appendChild(svgBox);
    stage.appendChild(ro);
    stage.appendChild(noteEl);

    render();
    return function () {};
  }

  /* ================================================================== */
  /* 7. 밝기를 이용한 거리 측정                                           */
  /* ================================================================== */

  function buildBrightness(stage) {
    var d1 = 2, d2 = 4;

    var svgBox = h('div', {}, '');
    var ro = h('div', { class: 'viz-readout' });
    var note = h('div', { class: 'viz-label' });
    note.style.textAlign = 'center';

    function render() {
      var b1 = 1 / (d1 * d1);
      var b2 = 1 / (d2 * d2);
      var ratio = b2 / b1;
      var glow1 = Math.min(1, b1);
      var glow2 = Math.min(1, b2);

      var svg =
        '<defs><radialGradient id="g1"><stop offset="0%" stop-color="#fff59a" stop-opacity="' + (0.2 + glow1 * 0.8) + '"></stop><stop offset="100%" stop-color="#ffd54f" stop-opacity="0"></stop></radialGradient>' +
        '<radialGradient id="g2"><stop offset="0%" stop-color="#fff59a" stop-opacity="' + (0.2 + glow2 * 0.8) + '"></stop><stop offset="100%" stop-color="#ffd54f" stop-opacity="0"></stop></radialGradient></defs>' +
        '<line x1="40" y1="185" x2="390" y2="185" stroke="var(--border)" stroke-width="2"></line>' +
        '<circle cx="140" cy="105" r="' + (58 * Math.sqrt(glow1) + 18) + '" fill="url(#g1)"></circle>' +
        '<circle cx="140" cy="105" r="17" fill="#ffe082" stroke="var(--text-soft)" stroke-width="2"></circle>' +
        '<circle cx="140" cy="185" r="5" fill="var(--text-soft)"></circle>' +
        '<text x="140" y="205" font-size="12" fill="var(--text-soft)" text-anchor="middle">전구 1 (거리 ' + d1 + ')</text>' +
        '<circle cx="320" cy="105" r="' + (58 * Math.sqrt(glow2) + 18) + '" fill="url(#g2)"></circle>' +
        '<circle cx="320" cy="105" r="17" fill="#ffe082" stroke="var(--text-soft)" stroke-width="2"></circle>' +
        '<circle cx="320" cy="185" r="5" fill="var(--text-soft)"></circle>' +
        '<text x="320" y="205" font-size="12" fill="var(--text-soft)" text-anchor="middle">전구 2 (거리 ' + d2 + ')</text>' +
        '<text x="230" y="40" font-size="13" text-anchor="middle" fill="var(--text-soft)">같은 전구를 다른 거리에 놓았을 때</text>';

      svgBox.innerHTML = svgWrap(svg, '0 0 420 225');

      var maxB = Math.max(b1, b2);
      ro.innerHTML =
        '<div class="unit-bars" style="width:100%">' +
        '<div class="unit-bar-row" style="grid-template-columns:100px 1fr 74px"><div>전구 1 밝기</div><div class="unit-bar-track"><div class="unit-bar-fill" style="width:' +
        ((b1 / maxB) * 100) + '%;background:var(--accent)"></div></div><div class="unit-bar-val">' + ((b1 / maxB) * 100).toFixed(1) + '%</div></div>' +
        '<div class="unit-bar-row" style="grid-template-columns:100px 1fr 74px"><div>전구 2 밝기</div><div class="unit-bar-track"><div class="unit-bar-fill" style="width:' +
        ((b2 / maxB) * 100) + '%;background:var(--good)"></div></div><div class="unit-bar-val">' + ((b2 / maxB) * 100).toFixed(1) + '%</div></div>' +
        '</div>' +
        '<div>밝기 비 <span class="val">1 : ' + (1 / ratio).toFixed(2) + '</span> · 거리 비 <span class="val">1 : ' + (d2 / d1) + '</span></div>';

      note.innerHTML = Math.abs(d2 - d1 * 2) < 0.01
        ? '<b>거리가 2배면 밝기는 약 1/4이 된다.</b> 실제로 별의 밝기와 거리를 비교하면 별까지의 거리를 구할 수 있다.'
        : (Math.abs(d2 - d1 * 4) < 0.01
          ? '<b>거리가 4배면 밝기는 약 1/16이 된다.</b> 겉보기 밝기는 거리의 제곱에 반비례한다.'
          : '<b>멀리 있는 전구일수록 어둡게 보인다.</b> 실제 밝기가 같아도 겉보기 밝기는 거리에 따라 달라진다.');
    }

    var wrap = h('label', { class: 'viz-label' });
    wrap.innerHTML = '전구 2의 거리 <b>4</b> (전구 1은 거리 2)';
    var range = h('input', { type: 'range', min: '1', max: '8', step: '1' });
    range.value = '4';
    range.addEventListener('input', function () {
      d2 = Number(range.value);
      wrap.querySelector('b').textContent = String(d2);
      render();
    });
    wrap.appendChild(range);

    stage.appendChild(controls([wrap]));
    stage.appendChild(svgBox);
    stage.appendChild(ro);
    stage.appendChild(note);

    render();
    return function () {};
  }

  /* ================================================================== */
  /* 레지스트리                                                          */
  /* ================================================================== */

  var items = [
    { id: 'cell', title: '세포 분열·감수 분열', desc: '체세포 분열 5단계와 생식 세포를 만드는 감수 분열을 단계별로 확인한다.', note: '핵심: 체세포 분열은 <b>염색체 수 유지</b>, 감수 분열은 <b>염색체 수 절반</b>.', build: buildCellDivision },
    { id: 'mendel', title: '멘델 유전 모의실험', desc: '부모 유전자형을 선택해 페닛트 사각형을 만들고, 무작위 실험으로 확률을 확인한다.', note: '핵심: Aa × Aa 를 여러 번 실험하면 표현형 비율이 <b>3 : 1</b>에 가까워진다.', build: buildMendel },
    { id: 'energy', title: '역학적 에너지 전환', desc: '물체를 떨어뜨리며 위치 에너지와 운동 에너지의 전환과 보존을 확인한다.', note: '핵심: 높이가 줄면 위치 에너지가 운동 에너지로 <b>전환</b>되고, 둘의 합은 <b>일정</b>하다.', build: buildEnergy },
    { id: 'generator', title: '발전기 원리', desc: '자석을 회전시켜 코일에 전류가 흐르고 전구가 켜지는 과정을 관찰한다.', note: '핵심: 발전기는 <b>운동 에너지를 전기 에너지로 전환</b>한다. 회전이 빠를수록 전류·밝기가 커진다.', build: buildGenerator },
    { id: 'star', title: '별의 색과 표면 온도', desc: '별의 색을 바꾸며 표면 온도와의 관계를 확인한다.', note: '핵심: 뜨거울수록 <b>파란색</b> 계열, 차가울수록 <b>붉은색</b> 계열.', build: buildStarColor },
    { id: 'parallax', title: '연주 시차 거리 측정', desc: '별까지의 거리를 바꾸어 6개월 사이의 시차각이 어떻게 변하는지 본다.', note: '핵심: 시차각이 <b>작을수록</b> 별은 <b>멀다</b>. 지구 공전 궤도 반지름과 시차각으로 거리를 구한다.', build: buildParallax },
    { id: 'bright', title: '밝기로 거리 측정', desc: '같은 전구를 다른 거리에 두어 겉보기 밝기의 변화를 확인한다.', note: '핵심: 실제 밝기가 같아도 멀수록 어둡게 보이며, <b>거리 2배 → 밝기 약 1/4</b>.', build: buildBrightness }
  ];

  var current = null;
  var cleanup = null;

  function select(id) {
    var item = null;
    for (var i = 0; i < items.length; i++) if (items[i].id === id) item = items[i];
    if (!item) return;
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }

    current = item.id;
    if (global.SCIENCE_VIZ) global.SCIENCE_VIZ.current = item.id;
    var stage = document.getElementById('vizStage');
    document.getElementById('vizTitle').textContent = item.title;
    document.getElementById('vizDesc').textContent = item.desc;
    document.getElementById('vizNote').innerHTML = item.note;
    stage.innerHTML = '';
    cleanup = item.build(stage) || null;
  }

  function refresh() {
    if (current) select(current);
  }

  global.SCIENCE_VIZ = { items: items, current: current, select: select, refresh: refresh };

})(typeof window !== 'undefined' ? window : globalThis);
