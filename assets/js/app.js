/* ============================================================
 * 脱单堵点诊断 · 交互层
 * 屏幕路由 / 档案采集 / 30 题答题 / 报告渲染 / 六脉图 / 分享图
 * ============================================================ */
(function () {
  'use strict';

  var D = window.APP_DATA;
  var E = window.Engine;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var LS_KEY = 'tddz_state_v1';
  var state = {
    profile: { age: null, city: null, income: null, gender: null, single: null },
    answers: {},
    order: [],
    quizIdx: 0,
    result: null
  };

  /* ---------- 持久化（本地续测） ---------- */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        profile: state.profile, answers: state.answers, order: state.order, quizIdx: state.quizIdx
      }));
    } catch (e) { /* 隐私模式等场景下静默失败 */ }
  }
  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!s) return false;
      if (s.profile) Object.assign(state.profile, s.profile);
      if (s.answers) state.answers = s.answers;
      if (Array.isArray(s.order)) state.order = s.order;
      if (typeof s.quizIdx === 'number') state.quizIdx = s.quizIdx;
      return true;
    } catch (e) { return false; }
  }
  function clearSaved() { try { localStorage.removeItem(LS_KEY); } catch (e) {} }
  function answeredCount() {
    return D.questions.filter(function (q) { return state.answers[q.id] !== undefined; }).length;
  }
  function profileComplete() {
    return D.PROFILE_FIELDS.every(function (f) { return !!state.profile[f.key]; });
  }

  /* ---------- 屏幕切换 ---------- */
  function show(id) {
    $$('.screen').forEach(function (el) { el.classList.remove('active'); });
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  /* ---------- 落地页 ---------- */
  function renderSamples() {
    $('#samplesTrack').innerHTML = D.LANDING_SAMPLES.map(function (id) {
      var t = D.types.filter(function (x) { return x.id === id; })[0];
      return '<div class="sample">' +
        '<p class="sample-name">' + t.name + '</p>' +
        '<p class="sample-meme">「' + t.meme + '」</p>' +
        '</div>';
    }).join('');
  }

  /* ---------- 档案页 ---------- */
  function renderProfile() {
    $('#profileGroups').innerHTML = D.PROFILE_FIELDS.map(function (f, i) {
      return '<div class="pgroup" data-key="' + f.key + '">' +
        '<p class="pgroup-label"><span class="pgroup-no">' + (i + 1) + '</span>' + f.label + '</p>' +
        '<div class="chips">' +
        f.options.map(function (v) {
          return '<button type="button" class="chip' + (state.profile[f.key] === v ? ' on' : '') + '" data-v="' + v + '">' + v + '</button>';
        }).join('') +
        '</div></div>';
    }).join('');
    $$('.pgroup').forEach(function (g) {
      var key = g.dataset.key;
      $$('.chip', g).forEach(function (c) {
        c.addEventListener('click', function () {
          state.profile[key] = c.dataset.v;
          $$('.chip', g).forEach(function (x) { x.classList.toggle('on', x === c); });
          $('#btnToQuiz').disabled = !profileComplete();
          save();
        });
      });
    });
    $('#btnToQuiz').disabled = !profileComplete();
  }

  /* ---------- 答题页 ---------- */
  function firstUnansweredIdx() {
    for (var i = 0; i < D.questions.length; i++) {
      if (state.answers[D.questions[i].id] === undefined) return i;
    }
    return D.questions.length - 1;
  }

  function renderQuiz() {
    var q = D.questions[state.quizIdx];
    $('#quizNo').textContent = state.quizIdx + 1;
    $('#progressFill').style.width = (answeredCount() / D.questions.length * 100) + '%';
    $('#qIndex').textContent = 'Q' + q.id;
    $('#qText').textContent = q.text;
    $('#qOptions').innerHTML = q.options.map(function (o) {
      return '<button type="button" class="opt' + (state.answers[q.id] === o.value ? ' on' : '') + '" data-v="' + o.value + '">' +
        '<span class="opt-badge">' + o.label + '</span>' +
        '<span class="opt-text">' + o.text + '</span></button>';
    }).join('');
    $$('#qOptions .opt').forEach(function (b) {
      b.addEventListener('click', function () { choose(q.id, Number(b.dataset.v)); });
    });

    var answered = state.answers[q.id] !== undefined;
    var last = state.quizIdx === D.questions.length - 1;
    $('#btnFinish').hidden = !(answered && last);
    $('#quizHint').hidden = last && answered;

    var nextBtn = $('#btnNext');
    if (answered && !last) {
      if (!nextBtn) {
        nextBtn = document.createElement('button');
        nextBtn.id = 'btnNext';
        nextBtn.type = 'button';
        nextBtn.className = 'btn btn-ghost btn-block';
        nextBtn.textContent = '下一题 ›';
        nextBtn.addEventListener('click', function () {
          state.quizIdx++; save(); renderQuiz();
        });
        $('#quizHint').parentNode.insertBefore(nextBtn, $('#quizHint').nextSibling);
      }
      nextBtn.hidden = false;
    } else if (nextBtn) {
      nextBtn.hidden = true;
    }
  }

  function choose(qid, value) {
    var changed = state.answers[qid] !== value;
    var idxAtSchedule = state.quizIdx;
    state.answers[qid] = value;
    state.order = state.order.filter(function (id) { return id !== qid; });
    state.order.push(qid);
    save();
    renderQuiz();
    if (changed && state.quizIdx < D.questions.length - 1) {
      setTimeout(function () {
        // 只有用户没有离开当前题时才自动翻页（避免与“返回上一题”竞态）
        if (state.answers[qid] === value && state.quizIdx === idxAtSchedule) {
          state.quizIdx++; save(); renderQuiz();
        }
      }, 280);
    }
  }

  /* ---------- 结果生成 ---------- */
  function buildResult() {
    var axes = E.computeAxes(state.answers, state.order);
    var m = E.matchTypes(axes);
    var cd = E.computeCountdown(m.main, state.profile, axes, m.isHidden);
    return {
      axes: axes,
      main: m.main,
      secondary: m.secondary,
      isHidden: m.isHidden,
      mainDistance: m.mainDistance,
      countdown: cd,
      tips: E.adaptTips(m.main, state.profile),
      serial: E.makeSerial(state.answers)
    };
  }

  function startReport() {
    if (answeredCount() < D.questions.length) { toast('还有题目没答完'); return; }
    if (!profileComplete()) { toast('先完成上面的快速档案'); renderProfile(); show('screen-profile'); return; }
    state.result = buildResult();
    save();
    show('screen-loading');
    var msgs = ['正在接通你的脱单管道…', '正在给六轴称重…', '正在比对 16 个堵点型号…', '正在生成你的诊断书…'];
    var i = 0;
    $('#loadingText').textContent = msgs[0];
    var timer = setInterval(function () {
      i = (i + 1) % msgs.length;
      $('#loadingText').textContent = msgs[i];
    }, 520);
    setTimeout(function () {
      clearInterval(timer);
      show('screen-report');
      renderReport(state.result);
    }, 1700);
  }

  /* ---------- 报告渲染 ---------- */
  var observed = new Set();

  /* 翻面卡量高：双面绝对定位，必须在屏幕可见后测量
   * （display:none 下 offsetHeight 恒为 0，早年因此导致卡片高度 0、内容溢出盖住下一张卡） */
  function fitFlipHeight() {
    var flip = $('#flipCard');
    if (!flip) return;
    var cover = $('.flip-cover'), front = $('#flipFront');
    if (!cover || !front) return;
    var h = Math.max(cover.offsetHeight, front.offsetHeight);
    if (h > 0) flip.style.height = h + 'px';
  }

  /* 倒计时账单明细：型号基准 + 环境加减逐行拆解，最终月数 = 各行之和 */
  function renderBill(cd) {
    var box = $('#cdBill');
    if (!box) return;
    var rows = (cd.details || []).map(function (d) {
      var v = String(d.value);
      var isNum = /^[+-]?\d+$/.test(v);
      var cls = 'bill-val';
      if (d.kind === 'base') {
        cls += ' bill-val-base';
        v = isNum ? Math.abs(parseInt(v, 10)) + ' 个月' : v;   /* 基准行不带 + 号 */
      } else if (d.kind === 'hidden') {
        cls += ' bill-val-hidden';
      } else if (v === '0') {
        cls += ' bill-val-zero';
      } else if (v.charAt(0) === '+') {
        cls += ' bill-val-up';
        v += ' 个月';
      } else {
        cls += ' bill-val-down';
        v += ' 个月';
      }
      return '<li><span class="bill-label">' + d.label + '</span><span class="' + cls + '">' + v + '</span></li>';
    }).join('');
    box.innerHTML = '<p class="bill-title">📝 倒计时账单明细</p><ul class="bill-list">' + rows + '</ul>';
  }

  function renderReport(res) {
    observed.clear();
    var t = res.main;

    $('#reportSerial').textContent = '脱单堵点诊断书 No.' + res.serial;
    $('#coverNo').textContent = 'No.' + res.serial;
    $('#typeName').textContent = t.name;
    $('#typeMeme').textContent = '「' + t.meme + '」';
    $('#typeBadges').innerHTML = res.isHidden
      ? '<span class="tag tag-rare">🌟 隐藏款 · 稀有结果</span><span class="tag">六轴均衡</span>'
      : '<span class="tag">主型号</span>';

    /* 倒计时 */
    var cd = res.countdown;
    $('#cdNum').textContent = '0';
    $('#cdBarFill').style.width = '0%';
    renderBill(cd);

    /* 堵点分析 */
    $('#analysisAxis').textContent = '核心堵点轴：' + coreAxisLabel(res.axes);
    $('#typeAnalysis').textContent = t.analysis;

    /* 疏通建议 */
    $('#typeTips').innerHTML = res.tips.map(function (tip, i) {
      return '<li><span class="tip-no">' + (i + 1) + '</span><p>' + tip + '</p></li>';
    }).join('');

    /* 副堵点 */
    var s = res.secondary;
    $('#subName').textContent = s.name;
    $('#subMeme').textContent = '「' + s.meme + '」';
    $('#subAnalysis').textContent = firstSentence(s.analysis);

    /* 六脉图 + 合拍 + 分享图 */
    renderPulse(res.axes);
    renderMatch(t.match);
    drawShareCard(res);

    /* 翻面动画（屏幕已可见，同步量高；rAF 兜底防字体延迟重排） */
    var flip = $('#flipCard');
    flip.classList.remove('flipped');
    flip.style.height = '';
    fitFlipHeight();
    requestAnimationFrame(function () { requestAnimationFrame(fitFlipHeight); });
    setTimeout(function () { flip.classList.add('flipped'); }, 420);

    /* 进入视口时播放数字滚动与六脉图生长 */
    observeReveal($('#cardCountdown'), function () {
      animateNumber($('#cdNum'), cd.months, 900);
      $('#cdBarFill').style.width = Math.min(100, cd.months / 48 * 100) + '%';
    });
    observeReveal($('#pulseChart'), animatePulse);
  }

  function coreAxisLabel(axes) {
    return D.AXES.slice().sort(function (a, b) {
      return Math.abs(axes[b]) - Math.abs(axes[a]);
    }).slice(0, 2).map(function (k) {
      return D.AXIS_META[k].name;
    }).join(' · ');
  }

  function firstSentence(text) {
    var i = text.indexOf('。');
    return i > 0 ? text.slice(0, i + 1) : text;
  }

  function observeReveal(el, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !observed.has(el)) {
          observed.add(el);
          fn();
          io.disconnect();
        }
      });
    }, { threshold: 0.25 });
    io.observe(el);
  }

  function animateNumber(el, to, dur) {
    var t0 = performance.now();
    function frame(t) {
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e);
      if (p < 1) requestAnimationFrame(frame); else el.textContent = to;
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 六脉图（SVG 双向条形） ---------- */
  var pulseBars = [];
  function renderPulse(axes) {
    var W = 400, rowH = 54, padTop = 8;
    var H = padTop * 2 + rowH * 6;
    var cx = 198, half = 90;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pulse-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="六脉图">';
    s += '<line x1="' + cx + '" y1="2" x2="' + cx + '" y2="' + (H - 2) + '" class="p-center"/>';
    [-50, 50].forEach(function (tk) {
      var x = cx + tk / 100 * half;
      s += '<line x1="' + x + '" y1="2" x2="' + x + '" y2="' + (H - 2) + '" class="p-tick"/>';
    });
    D.AXES.forEach(function (k, i) {
      var meta = D.AXIS_META[k], v = axes[k];
      var cy = padTop + i * rowH + rowH / 2;
      var w = Math.abs(v) / 100 * half;
      var bx = v >= 0 ? cx : cx - w;
      var color = v >= 0 ? '#D9A25E' : '#96AC92';
      s += '<text x="' + (cx - half - 12) + '" y="' + (cy + 4) + '" text-anchor="end" class="p-axis">' + meta.name + '</text>';
      s += '<rect class="p-bar" x="' + cx + '" y="' + (cy - 9) + '" width="0" height="18" rx="9" fill="' + color + '" data-x="' + bx + '" data-w="' + w + '"/>';
      if (w >= 30) {
        var tx = v >= 0 ? cx + w - 8 : cx - w + 8;
        s += '<text x="' + tx + '" y="' + (cy + 4.5) + '" text-anchor="' + (v >= 0 ? 'end' : 'start') + '" class="p-val-in">' + (v > 0 ? '+' + v : v) + '</text>';
      } else {
        var tx2 = v >= 0 ? cx + w + 7 : cx - w - 7;
        s += '<text x="' + tx2 + '" y="' + (cy + 4.5) + '" text-anchor="' + (v >= 0 ? 'start' : 'end') + '" class="p-val">' + (v > 0 ? '+' + v : v) + '</text>';
      }
      s += '<text x="' + (W - 4) + '" y="' + (cy + 4) + '" text-anchor="end" class="p-tier">' + E.tierLabel(k, v) + '</text>';
    });
    s += '</svg>';
    $('#pulseChart').innerHTML = s;
    pulseBars = $$('#pulseChart .p-bar');
  }

  function animatePulse() {
    if (!pulseBars.length) return;
    var t0 = performance.now(), dur = 750;
    function frame(t) {
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      pulseBars.forEach(function (b) {
        var fx = Number(b.dataset.x), fw = Number(b.dataset.w);
        var w = fw * e;
        b.setAttribute('width', w);
        b.setAttribute('x', fx + (fw - w) * (fx < 198 ? 1 : 0));
      });
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 最合拍型号 ---------- */
  function renderMatch(text) {
    var html = text.replace(/【([^】]+)】/g, function (m, name) {
      var t = D.types.filter(function (x) { return x.name === name; })[0];
      return t
        ? '<button type="button" class="typechip" data-id="' + t.id + '">' + name + '</button>'
        : '<b>' + name + '</b>';
    });
    $('#matchText').innerHTML = html;
    $$('#matchText .typechip').forEach(function (c) {
      c.addEventListener('click', function () { openTypeModal(c.dataset.id); });
    });
    $('#matchChips').innerHTML = '点上面的型号名，可以看 TA 的堵点分析';
  }

  function openTypeModal(id) {
    var t = D.types.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    $('#modalName').textContent = t.name;
    $('#modalMeme').textContent = '「' + t.meme + '」';
    $('#modalAnalysis').textContent = t.analysis;
    $('#modalMask').hidden = false;
  }
  function closeTypeModal() { $('#modalMask').hidden = true; }

  /* ---------- 分享图（canvas 3:4） ---------- */
  function font(w, style) {
    return style + ' ' + w + 'px "PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif';
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapLines(ctx, text, maxW, maxLines) {
    var lines = [], line = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ctx.measureText(line + ch).width > maxW && line) {
        lines.push(line); line = ch;
        if (lines.length >= maxLines) break;
      } else {
        line += ch;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    return lines;
  }
  function wrapText(ctx, text, cx, y, maxW, lh, maxLines) {
    maxLines = maxLines || 3;
    var lines = wrapLines(ctx, text, maxW, maxLines);
    lines.forEach(function (l, i) { ctx.fillText(l, cx, y + i * lh); });
  }

  function drawShareCard(res) {
    var cv = $('#shareCanvas'), ctx = cv.getContext('2d');
    if (!ctx) return;
    var W = cv.width, H = cv.height;
    ctx.textAlign = 'center';

    /* 背景与装饰 */
    ctx.fillStyle = '#151820';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(217,162,94,0.10)';
    ctx.beginPath(); ctx.arc(668, 84, 230, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(150,172,146,0.10)';
    ctx.beginPath(); ctx.arc(64, 944, 215, 0, Math.PI * 2); ctx.fill();

    /* 顶部品牌 */
    ctx.fillStyle = '#EAE7DE';
    ctx.font = font(38, '800');
    ctx.fillText('我还要单多久', W / 2, 92);
    ctx.fillStyle = '#A8AEB9';
    ctx.font = font(25, '500');
    ctx.fillText('· 脱单堵点诊断 ·', W / 2, 136);
    ctx.fillStyle = '#7C8492';
    ctx.font = font(21, '400');
    ctx.fillText('脱单堵点诊断书 No.' + res.serial, W / 2, 180);

    /* 型号与自嘲梗：先量梗句行数，卡高随内容自适应，分隔线/倒计时均匀分布，消除中部空档 */
    var memeText = '「' + res.main.meme + '」';
    ctx.font = font(31, '600');
    var nLines = Math.max(wrapLines(ctx, memeText, W - 200, 3).length, 1);
    var g = 48 + (3 - nLines) * 14; /* 梗句越短，弹性内距越大，避免某一段单独空一大截 */
    var memeLast = 372 + (nLines - 1) * 46;
    var sepY = memeLast + g;
    var labelY = sepY + 52;
    var numY = labelY + g + 85;

    /* 诊断卡（高度自适应） */
    roundRect(ctx, 56, 216, W - 112, numY + 26 - 216, 30);
    ctx.fillStyle = '#1D222D';
    ctx.fill();
    ctx.strokeStyle = '#313847';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#D9A25E';
    ctx.font = font(58, '800');
    ctx.fillText(res.main.name, W / 2, 306);
    ctx.fillStyle = '#EAE7DE';
    ctx.font = font(31, '600');
    wrapText(ctx, memeText, W / 2, 372, W - 200, 46, 3);

    /* 分隔线 */
    ctx.strokeStyle = '#313847';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(130, sepY); ctx.lineTo(W - 130, sepY); ctx.stroke();

    /* 倒计时 */
    ctx.fillStyle = '#A8AEB9';
    ctx.font = font(26, '500');
    ctx.fillText('按现在的状态，预计还要', W / 2, labelY);
    var num = String(res.countdown.months);
    ctx.font = font(118, '800');
    var numW = ctx.measureText(num).width;
    ctx.font = font(36, '700');
    var unitW = ctx.measureText('个月').width;
    var sx = (W - numW - 14 - unitW) / 2;
    ctx.textAlign = 'left';
    ctx.font = font(118, '800');
    ctx.fillStyle = '#D9A25E';
    ctx.fillText(num, sx, numY);
    ctx.font = font(36, '700');
    ctx.fillStyle = '#EAE7DE';
    ctx.fillText('个月', sx + numW + 14, numY);
    ctx.textAlign = 'center';

    /* 卡内脚注 */
    ctx.fillStyle = '#7C8492';
    ctx.font = font(21, '400');
    ctx.fillText('不疏通堵点的算法 · ' + D.COMPLIANCE.shareWatermark, W / 2, 792);

    /* 副堵点与底部 */
    ctx.fillStyle = '#A8AEB9';
    ctx.font = font(25, '500');
    ctx.fillText('还有点「' + res.secondary.name + '」的影子', W / 2, 852);
    ctx.fillStyle = '#EAE7DE';
    ctx.font = font(27, '700');
    ctx.fillText('长按识别 · 测测你的堵点型号', W / 2, 922);
    ctx.fillStyle = '#7C8492';
    ctx.font = font(20, '400');
    ctx.fillText('我还要单多久 · 本测试仅供娱乐参考', W / 2, 958);
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    $('#lpCompliance').textContent = D.COMPLIANCE.landing;
    $('#privacyText').textContent = D.COMPLIANCE.privacy;
    $('#reportCompliance').textContent = D.COMPLIANCE.report;
    $('#cdBadge').textContent = D.COMPLIANCE.countdownBadge;

    $('#btnStart').addEventListener('click', function () {
      renderProfile();
      if (answeredCount() === D.questions.length && profileComplete()) {
        startReport();
      } else if (profileComplete() && answeredCount() > 0) {
        renderQuiz(); show('screen-quiz');
      } else {
        show('screen-profile');
      }
    });

    $('#btnProfileBack').addEventListener('click', function () { show('screen-landing'); });
    $('#btnToQuiz').addEventListener('click', function () {
      if (!profileComplete()) return;
      state.quizIdx = firstUnansweredIdx();
      save(); renderQuiz(); show('screen-quiz');
    });

    $('#btnQuizBack').addEventListener('click', function () {
      if (state.quizIdx > 0) { state.quizIdx--; save(); renderQuiz(); }
      else { renderProfile(); show('screen-profile'); }
    });
    $('#btnFinish').addEventListener('click', startReport);

    $('#btnRestart').addEventListener('click', function () {
      clearSaved();
      state.profile = { age: null, city: null, income: null, gender: null, single: null };
      state.answers = {}; state.order = []; state.quizIdx = 0; state.result = null;
      renderProfile(); show('screen-landing');
      toast('已清空，重新开始');
    });

    $('#btnSaveImg').addEventListener('click', function () {
      try {
        var a = document.createElement('a');
        a.download = '脱单堵点诊断书-' + (state.result ? state.result.serial : 'share') + '.png';
        a.href = $('#shareCanvas').toDataURL('image/png');
        document.body.appendChild(a); a.click(); a.remove();
        toast('图片已保存，去晒图吧');
      } catch (e) {
        toast('长按图片也可以保存');
      }
    });

    $('#btnCopyText').addEventListener('click', function () {
      var r = state.result;
      if (!r) return;
      var text = '我的脱单堵点型号是【' + r.main.name + '】——' + r.main.meme +
        '\n按现在的状态，预计还要 ' + r.countdown.months + ' 个月（娱乐测算，仅供参考）。' +
        '\n你也来测测你的堵点型号？';
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); toast('文案已复制'); }
        catch (e2) { toast('复制失败，请长按手动选择'); }
        ta.remove();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('文案已复制'); }, fallback);
      } else { fallback(); }
    });

    $('#modalClose').addEventListener('click', closeTypeModal);
    $('#modalMask').addEventListener('click', function (e) {
      if (e.target === this) closeTypeModal();
    });

    /* 窗口变化时重新量取翻面卡高度（横竖屏切换会改变文字换行） */
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      var report = $('#screen-report');
      if (!report || !report.classList.contains('active')) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitFlipHeight, 150);
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    renderSamples();
    bind();
    var had = restore();
    if (had && answeredCount() === D.questions.length && profileComplete()) {
      state.result = buildResult();
      show('screen-report');
      renderReport(state.result);
    } else if (had && (answeredCount() > 0 || profileComplete())) {
      renderProfile();
      if (!profileComplete()) { show('screen-profile'); return; }
      renderQuiz();
      show('screen-quiz');
    }
  }

  init();
})();
