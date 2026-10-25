/* ============================================================
 * 脱单堵点诊断 · 计分引擎（纯函数，浏览器/node 双端可测）
 * 六轴计分：跨轴微分(±1) + 归一化(/15*100) + 破零保底(±8)
 * 匹配：欧氏距离；隐藏款规则：六轴 |分| 全部 < 30 直接命中
 * 倒计时：型号基准 + 城市 + 年龄 + 单身时长（加法算式，clamp 3~48）
 * ============================================================ */
(function (root, factory) {
  var Engine = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = Engine; }
  root.Engine = Engine;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function data() {
    return (typeof APP_DATA !== 'undefined' && APP_DATA) ? APP_DATA : globalThis.APP_DATA;
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ---------- 六轴计分 ----------
   * answers: { 题id: 分值 }；order: 作答顺序（题id 数组，越后越晚，用于破零保底取“最后作答一题”）
   */
  function computeAxes(answers, order) {
    var D = data();
    var totals = {}, lastVal = {}, lastPos = {};
    D.AXES.forEach(function (k) { totals[k] = 0; lastVal[k] = 0; lastPos[k] = -1; });

    var pos = {};
    (order || []).forEach(function (qid, i) { pos[qid] = i; });

    D.questions.forEach(function (q) {
      var v = answers[q.id];
      if (v === undefined || v === null) return;
      totals[q.axis] += v;                                   // 主轴计入
      var p = pos[q.id] !== undefined ? pos[q.id] : q.id;    // 无顺序信息时退回题号
      if (p >= lastPos[q.axis]) { lastPos[q.axis] = p; lastVal[q.axis] = v; }
      var cx = D.CROSS[q.axis];                              // 跨轴微分 ±1（与主轴同向）
      if (cx) totals[cx] += (v > 0 ? 1 : -1);
    });

    var axes = {};
    D.AXES.forEach(function (k) {
      var s = Math.round(totals[k] / 15 * 100);              // 归一化
      s = clamp(s, -100, 100);
      if (s === 0 && lastVal[k] !== 0) {                     // 破零保底 ±8
        s = lastVal[k] > 0 ? 8 : -8;
      }
      axes[k] = s;
    });
    return axes;
  }

  /* ---------- 欧氏距离 ---------- */
  function distArr(av, coords) {
    var s = 0;
    for (var i = 0; i < av.length; i++) {
      var d = av[i] - coords[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }
  function distance(axes, coords) {
    var D = data();
    return distArr(D.AXES.map(function (k) { return axes[k]; }), coords);
  }

  /* ---------- 型号匹配 ---------- */
  function matchTypes(axes) {
    var D = data();
    var normal = D.types.filter(function (t) { return !t.hidden; });
    var hidden = D.types.filter(function (t) { return t.hidden; })[0];
    var av = D.AXES.map(function (k) { return axes[k]; });

    // 隐藏款特殊规则：六轴全部 |分| < 30 时直接命中，跳过距离计算
    var balanced = D.AXES.every(function (k) { return Math.abs(axes[k]) < 30; });
    if (balanced && hidden) {
      var near = nearest(av, normal, 1)[0];
      return { main: hidden, secondary: near.type, isHidden: true, mainDistance: 0 };
    }
    var ranked = nearest(av, normal, 2);
    return { main: ranked[0].type, secondary: ranked[1].type, isHidden: false, mainDistance: ranked[0].d };
  }

  function nearest(av, list, n) {
    return list.map(function (t) {
      return { id: t.id, name: t.name, type: t, d: distArr(av, t.coords) };
    }).sort(function (a, b) { return a.d - b.d; }).slice(0, n);
  }

  /* ---------- 脱单倒计时（加法算式） ----------
   * finalMonths = 型号基准 + 城市修正 + 年龄修正 + 单身时长修正
   * 边界保护：先 Math.max(3, Math.min(48, raw))，再 Math.round 取整
   * 隐藏款（六轴 |分| 全部 < 30）：无视一切修正，固定 3 个月
   * 返回 details[] 拆解明细（label/value），供前端渲染「倒计时账单」
   */
  function signed(n) { return n > 0 ? '+' + n : (n < 0 ? String(n) : '0'); }

  function isHiddenAxes(axes) {
    if (!axes) return false;
    var D = data();
    return D.AXES.every(function (k) { return Math.abs(axes[k]) < 30; });
  }

  function pickVal(map, key) {
    var v = map[key];
    return v === undefined ? 0 : v;
  }

  function computeCountdown(type, profile, axes, isHidden) {
    var D = data(), cfg = D.COUNTDOWN_CFG;
    var hidden = isHidden !== undefined ? !!isHidden : isHiddenAxes(axes);
    var base = type.baseMonths;
    var details = [{ kind: 'base', label: '原生型号（' + type.name + '）', value: signed(base) }];

    /* 隐藏款特殊通道：环境加减全部无视，固定月数 */
    if (hidden) {
      details.push({
        kind: 'hidden',
        label: '隐藏款特殊通道 · 六轴均衡，环境加减全部无视',
        value: '固定 ' + cfg.hiddenFixed + ' 个月'
      });
      return {
        months: cfg.hiddenFixed, finalMonths: cfg.hiddenFixed,
        baseMonths: base, isHidden: true, details: details
      };
    }

    var city = pickVal(cfg.city, profile.city);
    var age = pickVal(cfg.age, profile.age);
    var single = pickVal(cfg.single, profile.single);

    var raw = base + city + age + single;
    var finalMonths = Math.round(clamp(raw, cfg.clamp[0], cfg.clamp[1]));

    details.push({ kind: 'mod', label: cfg.cityCopy[profile.city] || (profile.city + '生活'), value: signed(city) });
    details.push({ kind: 'mod', label: cfg.ageCopy[profile.age] || (profile.age + ' 岁'), value: signed(age) });
    details.push({ kind: 'mod', label: cfg.singleCopy[profile.single] || ('单身 ' + profile.single), value: signed(single) });

    return {
      months: finalMonths, finalMonths: finalMonths,
      baseMonths: base, isHidden: false,
      city: city, age: age, single: single,
      details: details
    };
  }

  /* ---------- 诊断书编号（同答案恒定） ---------- */
  function makeSerial(answers) {
    var D = data(), h = 7;
    D.questions.forEach(function (q, i) {
      var v = answers[q.id] || 0;
      h = (h * 131 + (i + 1) * 17 + (v + 3) * 29) % 99991;
    });
    return String(1000 + (h % 9000));
  }

  /* ---------- 建议条件适配 ---------- */
  var COND_EVAL = {
    '三线及以下城市': function (p) { return p.city === '二线' || p.city === '三线及以下·县城'; },
    '一线/新一线': function (p) { return p.city === '一线' || p.city === '新一线'; },
    '单身 3 年以上': function (p) { return p.single === '3-5 年' || p.single === '5 年以上'; },
    '单身 5 年以上': function (p) { return p.single === '5 年以上'; }
  };

  function adaptTips(type, profile) {
    var D = data();
    return type.tips.map(function (tip, i) {
      var rule = D.TIP_RULES[type.id + ':' + i];
      if (rule && COND_EVAL[rule.tag] && !COND_EVAL[rule.tag](profile)) {
        return rule.alt;                                     // 整条条件不满足 → 替代文案
      }
      var out = adaptInline(tip, profile);
      // 收入适配：5k 以下不为高客单活动加码
      if (i === 0 && profile.income === '5k 以下' && /(局|课|活动|展|沙龙)/.test(out)) {
        out += '——预算有限也完全没关系，先从免费、低成本的场景开始，走出去本身就是解药。';
      }
      // 年龄适配：35+ 去掉“年轻人”腔调
      if (profile.age === '35+') { out = out.replace(/年轻人/g, '这个年纪'); }
      return out;
    });
  }

  function adaptInline(tip, profile) {
    var out = tip.replace(/【([^】]+)】[^；。]*/g, function (clause, tag) {
      var fn = COND_EVAL[tag];
      if (!fn) return clause;                                // 未知标签原样保留
      return fn(profile) ? clause.replace(/^【[^】]+】/, '') : '';
    });
    return tidy(out);
  }

  function tidy(s) {
    return s
      .replace(/[，,；;]{2,}/g, '，')
      .replace(/[，,；;\s]+([。！？!?])/g, '$1')
      .replace(/[，,；;\s]+$/g, '')
      .replace(/^[，,\s]+/g, '')
      .trim();
  }

  /* ---------- 分档气质标签 ---------- */
  function tierLabel(axis, score) {
    var D = data(), tiers = D.TIERS[axis] || [];
    for (var i = 0; i < tiers.length; i++) {
      if (score >= tiers[i][0]) return tiers[i][1];
    }
    return tiers.length ? tiers[tiers.length - 1][1] : '';
  }

  return {
    computeAxes: computeAxes,
    matchTypes: matchTypes,
    computeCountdown: computeCountdown,
    makeSerial: makeSerial,
    adaptTips: adaptTips,
    tierLabel: tierLabel,
    distance: distance
  };
});
