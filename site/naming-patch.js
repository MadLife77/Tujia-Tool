/* 作者水印: GitHub作者MadLife77
 * 打包结果命名规则 v2.5（HTML / EXE / APK 三端通用，无外部依赖）
 *  - 动态混淆(极速)      → 【图夹】_年月日时分.gif
 *  - 图夹PRO(防查)       → 【图夹PRO】_年月日时分.gif
 *  - 图夹PRO + 设置密码  → 【图夹PRO】_密码<密码>_年月日时分.gif
 *  - 同名文件递归追加 (1)(2)…
 * 实现方式：拦截 a.download 属性写入并重写文件名，不改动混淆主逻辑。 */
(function () {
  'use strict';
  var P_PRO = '【图夹PRO】_', P_FAST = '【图夹】_';
  var used = Object.create(null);   // 本会话已生成的完整文件名，用于同名去重
  var cachedPwd = '';               // 密码缓存，防止打包过程中输入框被重置

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp() {
    var d = new Date();
    return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
           pad(d.getHours()) + pad(d.getMinutes());
  }
  function safe(s) {
    return String(s).replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim();
  }
  function readPwd() {
    try {
      var el = document.getElementById('encryptPasswordText');
      if (el && el.value) { cachedPwd = safe(el.value); return cachedPwd; }
    } catch (e) {}
    return cachedPwd;
  }

  // 已是新格式则不再改写（防止 setter / setAttribute / Observer 重复处理）
  var NEW_RE = /^【图夹(?:PRO)?】_(?:密码[\s\S]*?_)?\d{12}(?:\(\d+\))?(\.[A-Za-z0-9]+)?$/;

  function rewrite(oldName) {
    if (typeof oldName !== 'string' || NEW_RE.test(oldName)) return null;
    var isPro = oldName.indexOf(P_PRO) === 0;
    var isFast = oldName.indexOf(P_FAST) === 0;
    if (!isPro && !isFast) return null;   // 解包结果 / 分享链接等保持原样

    var ext = '', m = oldName.match(/(\.[A-Za-z0-9]+)$/);
    if (m) ext = m[1];
    var head = isPro ? P_PRO : P_FAST;
    var mid = '';
    if (isPro) { var p = readPwd(); if (p) mid = '密码' + p + '_'; }

    var base = head + mid + stamp();
    var name = base + ext, i = 0;
    while (used[name]) { i++; name = base + '(' + i + ')' + ext; }
    used[name] = true;
    return name;
  }

  // 主拦截：页面实测使用 a.download = '【图夹PRO】_qdqqd_xxx.gif'
  try {
    var desc = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'download');
    if (desc && desc.get && desc.set) {
      Object.defineProperty(HTMLAnchorElement.prototype, 'download', {
        configurable: true, enumerable: desc.enumerable,
        get: function () { return desc.get.call(this); },
        set: function (v) {
          var nv = rewrite(v);
          return desc.set.call(this, nv === null ? v : nv);
        }
      });
    }
  } catch (e) {}

  // 兜底 1：setAttribute('download', ...)
  try {
    var origSet = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (k, v) {
      if (String(k).toLowerCase() === 'download' && this.tagName === 'A') {
        var nv = rewrite(v);
        if (nv !== null) v = nv;
      }
      return origSet.call(this, k, v);
    };
  } catch (e) {}

  // 兜底 2：MutationObserver，覆盖 innerHTML 拼接等未走 setter 的情况
  try {
    if (window.MutationObserver) {
      var fix = function (a) {
        if (a.__tjNamed) return;
        var nv = rewrite(a.getAttribute('download'));
        if (nv !== null) { a.__tjNamed = 1; a.setAttribute('download', nv); }
      };
      var ob = new MutationObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) {
          var r = recs[i];
          if (r.type === 'attributes') { if (r.target.tagName === 'A') fix(r.target); continue; }
          if (!r.addedNodes) continue;
          for (var j = 0; j < r.addedNodes.length; j++) {
            var n = r.addedNodes[j];
            if (n.nodeType !== 1) continue;
            if (n.tagName === 'A') fix(n);
            if (n.querySelectorAll) {
              var as = n.querySelectorAll('a[download]');
              for (var k = 0; k < as.length; k++) fix(as[k]);
            }
          }
        }
      });
      var start = function () {
        ob.observe(document.documentElement || document,
                   { childList: true, subtree: true, attributes: true, attributeFilter: ['download'] });
      };
      if (document.documentElement) start();
      else document.addEventListener('DOMContentLoaded', start);
    }
  } catch (e) {}

  // 缓存密码输入，避免打包过程中被清空
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'encryptPasswordText') cachedPwd = safe(e.target.value);
  }, true);
})();
