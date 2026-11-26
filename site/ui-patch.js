/* 作者水印: GitHub作者MadLife77 — v2.4.3 功能补丁（三端通用）
 * 1) 公告「不再提醒」：APK 端改用原生 SharedPreferences 持久化（本地服务随机端口导致
 *    WebView localStorage 按 origin 隔离，每次启动都换端口 → 状态永远读不到）。
 *    HTML / EXE 端无原生桥，保持原有 localStorage 行为不变。
 * 2) 表图默认选项改为 PNG。
 * 3) 自定义表图「最近选择」：缓存最近 5 张，点击缩略图等价于重新选中该文件。
 * 4) 预览图尺寸由补丁 CSS 统一放大 20%（删除按钮保持 17px）。
 * 5) 算法选「图夹PRO(防查)」且自定义表图为 JPG/JPEG/WebP 时自动转 PNG，
 *    提示「表图正在转化」→「转化已完成」，并把转化结果缓存进「最近选择」。
 * 6) 「最近选择」每张缩略图下方以小字显示真实文件后缀（.jpg/.png/.gif 等），
 *    统一小写带点，便于在启用 PRO 前直观判断格式。
 * 7) v2.4.3 图片解包结果多选：「加载完成」旁加「全选 / 反选」，每个结果的
 *    操作区由「下载 / 预览」两等分改为「下载 / 预览 / 选择」三等分，第三格为
 *    圆形多选按钮；选中后圆形变浅绿底白色对勾，选择按钮与整张灰色圆角卡片
 *    同步显示淡蓝底 + 向外扩散亮蓝边框/光晕，hover 时淡蓝加深；
 *    「反选」右侧提示框实时显示「已选择{number}个文件」；
 *    按钮组新增「下载」：批量下载已选文件（未选中时下载全部）。
 * 8) 大图包性能：postMessage 走 transfer、超大文件抽样 hash、阶段进度提示。
 * 9) 拖放解析（仅 HTML / EXE）：拖入图夹/图包显示「用 Tu Jia Tool 打开」，
 *    松开后复用现有 #localDecryptInput 解包链路，不重复实现解析与结果处理。 */
(function () {
  'use strict';
  /* 桥对象按次动态取，避免 addJavascriptInterface 注入时序差异 */
  function bridge() { return window.TujiaNative; }
  /* APK 独有特征：本地 HTTP 服务(http://127.0.0.1:port) 或存在原生持久化桥。
     HTML / EXE 为 file:// 且无桥，公告修复不介入，保持原有 localStorage 行为。
     端口全被占用时 APK 会回退 file://，此时靠桥判定仍可生效。 */
  function isApkEnv() {
    if (location.protocol === 'http:' || location.protocol === 'https:') return true;
    try { var n = bridge(); return !!(n && typeof n.getPref === 'function'); }
    catch (e) { return false; }
  }

  /* ========== 1. 公告「不再提醒」状态持久化 ========== */
  var K_SHOW = 'showAnnouncement', K_VER = 'announcementVersion';
  function nativeGet(k) {
    try {
      var n = bridge();
      if (n && typeof n.getPref === 'function') {
        var v = n.getPref(k);
        return (v === null || v === undefined || v === '') ? null : String(v);
      }
    } catch (e) {}
    return null;
  }
  function nativeSet(k, v) {
    try { var n = bridge(); if (n && typeof n.setPref === 'function') n.setPref(k, String(v)); } catch (e) {}
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  /* cookie 按 host 隔离、不区分端口，作为随机端口场景的第二重保险 */
  function ckGet(k) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + k + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function ckSet(k, v) {
    try { document.cookie = k + '=' + encodeURIComponent(String(v)) + '; path=/; max-age=31536000'; } catch (e) {}
  }

  /* 启动时把原生/cookie 持久值回填 localStorage，供页面原有公告脚本读取
     （本脚本注入在 head 末尾，DOMContentLoaded 监听先于 body 末尾的原公告脚本） */
  function bootAnnouncement() {
    if (!isApkEnv()) return;
    [K_SHOW, K_VER].forEach(function (k) {
      var v = nativeGet(k) || ckGet(k);
      if (v !== null) lsSet(k, v);
    });
  }
  document.addEventListener('click', function (e) {
    if (!isApkEnv()) return;
    var t = e.target;
    while (t && t !== document && t.id !== 'dontShowAgainBtn') t = t.parentNode;
    if (!t || t === document) return;
    nativeSet(K_SHOW, 'false');
    ckSet(K_SHOW, 'false');
    setTimeout(function () {
      var v = lsGet(K_VER) || nativeGet(K_VER) || ckGet(K_VER);
      if (v) { nativeSet(K_VER, v); ckSet(K_VER, v); }
    }, 0);
  }, true);

  /* ========== 2. 表图默认 PNG ==========
     HTML 初始选中态已改为 PNG。若混淆 JS 初始化后仍把内部格式当作 GIF，
     则补触发一次 PNG 按钮点击以同步内部状态；用户已手动切换时不再干预。 */
  var userPickedFormat = false;
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.classList && t.classList.contains('format-btn')) { userPickedFormat = true; return; }
      t = t.parentNode;
    }
  }, true);
  function ensurePngDefault() {
    if (userPickedFormat) return;
    try {
      var png = document.querySelector('.format-btn[data-format="png"]');
      /* 无条件触发一次：确保混淆 JS 内部的 currentFormat 变量与随机表图
         都同步到 PNG，避免只改了 HTML 外观而打包仍沿用 GIF。 */
      if (png) png.click();
    } catch (e) {}
  }

  /* ========== 3. 最近选择（最多 5 张） ========== */
  var MAX = 5, DB = 'tujia_recent_covers', STORE = 'blobs', META_KEY = 'tujia_recent_meta';
  var suppress = false, liveUrls = [];

  function openDB(cb) {
    try {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { try { req.result.createObjectStore(STORE); } catch (e) {} };
      req.onsuccess = function () { cb(req.result); };
      req.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function readMeta() {
    try { var a = JSON.parse(localStorage.getItem(META_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function writeMeta(a) { try { localStorage.setItem(META_KEY, JSON.stringify(a)); } catch (e) {} }
  function putBlob(id, blob) {
    openDB(function (db) { if (!db) return; try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, id); } catch (e) {} });
  }
  function delBlob(id) {
    openDB(function (db) { if (!db) return; try { db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id); } catch (e) {} });
  }
  function getBlob(id, cb) {
    openDB(function (db) {
      if (!db) return cb(null);
      try {
        var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        r.onsuccess = function () { cb(r.result || null); };
        r.onerror = function () { cb(null); };
      } catch (e) { cb(null); }
    });
  }
  function recentHost() {
    var el = document.getElementById('recentCovers');
    if (el) return el;
    var container = document.querySelector('.custom-upload-area .file-input-container');
    if (!container || !container.parentNode) return null;
    el = document.createElement('div');
    el.id = 'recentCovers';
    el.className = 'recent-covers';
    el.innerHTML = '<div class="recent-covers-title">最近选择</div>' +
                   '<div id="recentCoversList" class="preview-container recent-covers-list"></div>';
    container.parentNode.insertBefore(el, container.nextSibling);
    return el;
  }
  /* 后缀标签：优先取真实文件名扩展名，缺失时按 MIME 兜底；统一小写 + 前导点 */
  function extLabel(m) {
    var n = String((m && m.name) || '');
    var hit = n.match(/\.([A-Za-z0-9]+)\s*$/);
    if (hit) return '.' + hit[1].toLowerCase();
    var t = String((m && m.type) || '').toLowerCase();
    var map = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
                'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp',
                'video/mp4': '.mp4', 'video/webm': '.webm' };
    if (map[t]) return map[t];
    if (t.indexOf('/') > 0) return '.' + t.split('/')[1].replace('jpeg', 'jpg');
    return '.png';
  }
  function renderRecent() {
    var host = recentHost(); if (!host) return;
    var list = document.getElementById('recentCoversList'); if (!list) return;
    liveUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    liveUrls = [];
    list.innerHTML = '';
    var meta = readMeta();
    host.style.display = meta.length ? '' : 'none';
    meta.forEach(function (m) {
      var cell = document.createElement('div');
      cell.className = 'recent-cover-cell';
      var item = document.createElement('div');
      item.className = 'preview-item';
      item.title = m.name || '自定义表图';
      var isVideo = m.type && m.type.indexOf('video') === 0;
      var media = document.createElement(isVideo ? 'video' : 'img');
      media.className = 'recent-thumb';
      if (isVideo) { media.muted = true; media.playsInline = true; }
      item.appendChild(media);
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'delete-btn';
      del.title = '删除此缓存'; del.textContent = '×';
      item.appendChild(del);
      cell.appendChild(item);
      var ext = document.createElement('div');
      ext.className = 'recent-ext';
      ext.textContent = extLabel(m);   /* 与实际缓存文件一致的小字后缀 */
      cell.appendChild(ext);
      list.appendChild(cell);
      getBlob(m.id, function (blob) {
        if (!blob || !item.isConnected) return;
        var u = URL.createObjectURL(blob);
        liveUrls.push(u); media.src = u;
      });
      /* 事件绑定在容器上：点缩略图或后缀都能选中，删除按钮仍 stopPropagation 只删缓存 */
      cell.addEventListener('click', function () { selectRecent(m); });
      del.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        removeRecent(m.id);
      });
    });
  }
  /* 点击缩略图 = 重新把该文件塞进 #coverFile 并触发 change，完全复用原有选中逻辑 */
  function selectRecent(m) {
    getBlob(m.id, function (blob) {
      if (!blob) return;
      var input = document.getElementById('coverFile');
      if (!input) return;
      try {
        var ext = (m.type === 'image/gif') ? '.gif' : ((m.type && m.type.indexOf('video') === 0) ? '.mp4' : '.png');
        var f = new File([blob], m.name || ('recent' + ext), { type: m.type || 'image/png' });
        var dt = new DataTransfer();
        dt.items.add(f);
        suppress = true;
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
      setTimeout(function () { suppress = false; }, 0);
    });
  }
  function removeRecent(id) {
    writeMeta(readMeta().filter(function (x) { return x.id !== id; }));
    delBlob(id);
    renderRecent();
  }
  function addRecent(file) {
    if (!file) return;
    var id = 'r' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var m = { id: id, name: file.name || '自定义表图', type: file.type || 'image/png',
              size: file.size || 0, ts: Date.now() };
    var a = readMeta().filter(function (x) { return !(x.name === m.name && x.size === m.size); });
    a.unshift(m);
    if (a.length > MAX) {
      a.slice(MAX).forEach(function (x) { delBlob(x.id); });
      a = a.slice(0, MAX);
    }
    writeMeta(a);
    putBlob(id, file);
    renderRecent();
  }
  /* ========== 5. PRO 算法下 JPG/JPEG/WebP 自定义表图自动转 PNG ==========
     WebChromeClient 未实现 onJsAlert，alert() 在 APK 里不会显示，故使用纯 DOM 浮层。 */
  var convertingLock = false;
  function isStegano() {
    var r = document.querySelector('input[name="algorithm"]:checked');
    return !!(r && r.value === 'stegano');
  }
  function isConvertible(file) {
    var n = String((file && file.name) || '').toLowerCase();
    var t = String((file && file.type) || '').toLowerCase();
    return /\.(jpe?g|webp)$/.test(n) || /image\/(jpe?g|webp)/.test(t);
  }
  var convertBox = null, convertTimer = null;
  function showConvertNotice(text, autoHideMs) {
    try {
      if (!convertBox) {
        convertBox = document.createElement('div');
        convertBox.id = 'tjConvertNotice';
        convertBox.setAttribute('role', 'status');
        convertBox.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
          'z-index:2147483000;min-width:190px;max-width:80vw;padding:18px 28px;border-radius:14px;' +
          'background:rgba(38,42,62,.95);color:#fff;font-size:1rem;font-weight:600;text-align:center;' +
          'box-shadow:0 12px 40px rgba(0,0,0,.32);line-height:1.6;display:none;pointer-events:none;';
        (document.body || document.documentElement).appendChild(convertBox);
      }
      convertBox.textContent = text;
      convertBox.style.display = 'block';
      if (convertTimer) { clearTimeout(convertTimer); convertTimer = null; }
      if (autoHideMs) {
        convertTimer = setTimeout(function () {
          convertBox.style.display = 'none'; convertTimer = null;
        }, autoHideMs);
      }
    } catch (e) {}
  }
  function fileToPng(file, cb) {
    var url;
    try { url = URL.createObjectURL(file); } catch (e) { return cb(null); }
    var img = new Image();
    var finished = false;
    function done(blob) {
      if (finished) return; finished = true;
      try { URL.revokeObjectURL(url); } catch (e) {}
      if (!blob) return cb(null);
      try {
        var name = String(file.name || 'cover').replace(/\.(jpe?g|webp)$/i, '') + '.png';
        cb(new File([blob], name, { type: 'image/png' }));
      } catch (e) { cb(null); }
    }
    img.onload = function () {
      try {
        var cv = document.createElement('canvas');
        cv.width = img.naturalWidth || img.width;
        cv.height = img.naturalHeight || img.height;
        cv.getContext('2d').drawImage(img, 0, 0);
        if (cv.toBlob) cv.toBlob(done, 'image/png');
        else {
          var d = cv.toDataURL('image/png'), raw = atob(d.split(',')[1]);
          var u = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
          done(new Blob([u], { type: 'image/png' }));
        }
      } catch (e) { done(null); }
    };
    img.onerror = function () { done(null); };
    img.src = url;
  }
  /* 把转化结果写回 #coverFile 并触发原有选中逻辑（suppress 避免二次转化/重复缓存） */
  function applyCoverFile(input, file) {
    try {
      var dt = new DataTransfer(); dt.items.add(file);
      suppress = true;
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
    setTimeout(function () { suppress = false; }, 0);
  }
  function runConvert(input, file) {
    if (convertingLock || !input || !file) return;
    convertingLock = true;
    var MIN_SHOW = 600, t0 = Date.now();
    showConvertNotice('表图正在转化');
    fileToPng(file, function (png) {
      /* 保证「表图正在转化」至少可见 MIN_SHOW 毫秒，避免极快转化时一闪而过 */
      var wait = Math.max(0, MIN_SHOW - (Date.now() - t0));
      setTimeout(function () {
        convertingLock = false;
        if (!png) {
          /* 转化失败：隐藏提示并回退原文件，保证表图不丢失 */
          if (convertTimer) { clearTimeout(convertTimer); convertTimer = null; }
          if (convertBox) convertBox.style.display = 'none';
          applyCoverFile(input, file);
          return;
        }
        showConvertNotice('转化已完成', 1500);
        addRecent(png);            /* 自动缓存进「最近选择」 */
        applyCoverFile(input, png);/* 让原有逻辑使用 PNG 表图 */
      }, wait);
    });
  }
  document.addEventListener('change', function (e) {
    /* 算法切到 PRO 时，若当前自定义表图仍是 JPG/JPEG/WebP，也补做一次转化 */
    if (e.target && e.target.name === 'algorithm') {
      if (isStegano()) {
        var cur = document.getElementById('coverFile');
        var cf = cur && cur.files && cur.files[0];
        if (cf && isConvertible(cf)) runConvert(cur, cf);
      }
      return;
    }
    if (suppress || convertingLock) return;
    if (e.target && e.target.id === 'coverFile') {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (isStegano() && isConvertible(f)) {
        /* 拦下原始格式，转化完成后再放行 PNG，避免主逻辑拿到 JPG */
        try { e.stopImmediatePropagation(); e.preventDefault(); } catch (err) {}
        runConvert(e.target, f);
        return;
      }
      addRecent(f);
    }
  }, true);

  /* ========== 7. 图片解包结果多选（v2.4.3，仅新增节点，不改原有下载/预览） ========== */
  var TJ_SEL = 'data-tj-selected';

  function tjClosest(node, cls) {
    while (node && node !== document) {
      if (node.classList && node.classList.contains(cls)) return node;
      node = node.parentNode;
    }
    return null;
  }
  function tjSetSelected(btn, on) {
    btn.setAttribute(TJ_SEL, on ? '1' : '0');
    if (on) btn.classList.add('is-selected');
    else btn.classList.remove('is-selected');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    /* 选中态同步作用于红框整张灰色圆角卡片；用 class 而非 :has，兼容老内核 */
    var card = btn;
    while (card && !(card.classList && card.classList.contains('decrypted-file-item')))
      card = card.parentNode;
    if (card && card.classList) {
      if (on) card.classList.add('tj-item-selected');
      else card.classList.remove('tj-item-selected');
    }
  }
  function tjBulkButtons(info) {
    if (!info || info.querySelector('.tj-bulk-bar')) return;
    var bar = document.createElement('span');
    bar.className = 'tj-bulk-bar';
    bar.innerHTML = '<button type="button" class="tj-bulk-btn" data-tj-act="all">全选</button>' +
                    '<button type="button" class="tj-bulk-btn" data-tj-act="invert">反选</button>' +
                    '<button type="button" class="tj-bulk-btn" data-tj-act="download">下载</button>' +
                    '<span class="tj-sel-count" id="tjSelectedCount">已选择0个文件</span>';
    var t = info.querySelector('.loading-text');
    if (t && t.nextSibling) info.insertBefore(bar, t.nextSibling);
    else info.appendChild(bar);
  }
  function tjDownloadSelected() {
    var root = document.getElementById('unpackResult');
    if (!root) return;
    var items = root.querySelectorAll('.decrypted-file-item');
    var i, btn, a, n = 0, links = [];
    /* 第一轮统计选中数：有选中只下选中项，一项未选则下全部 */
    for (i = 0; i < items.length; i++) {
      btn = items[i].querySelector('.tj-select-btn');
      if (btn && btn.getAttribute(TJ_SEL) === '1') n++;
    }
    for (i = 0; i < items.length; i++) {
      btn = items[i].querySelector('.tj-select-btn');
      a = items[i].querySelector('.button-container a[download]');
      if (!a) continue;
      if (n === 0 || (btn && btn.getAttribute(TJ_SEL) === '1')) links.push(a);
    }
    /* 错开触发，避免浏览器 / 原生桥并发处理多个 blob 下载时互相覆盖 */
    for (i = 0; i < links.length; i++) {
      (function (link, delay) {
        setTimeout(function () { try { link.click(); } catch (e) {} }, delay);
      })(links[i], i * 320);
    }
  }
  function tjUpdateCount() {
    var root = document.getElementById('unpackResult');
    var box = document.getElementById('tjSelectedCount');
    if (!box) return;
    var n = 0;
    if (root) {
      var btns = root.querySelectorAll('.tj-select-btn');
      for (var i = 0; i < btns.length; i++) if (btns[i].getAttribute(TJ_SEL) === '1') n++;
    }
    var txt = '已选择' + n + '个文件';
    /* 仅在文本变化时写入：本函数由 MutationObserver 驱动，无条件赋值会替换
       文本节点并再次触发 observer，造成无限循环卡死主线程 */
    if (box.textContent !== txt) box.textContent = txt;
  }
  function tjSelectButton(item) {
    var bc = item && item.querySelector('.button-container');
    if (!bc || bc.querySelector('.tj-select-btn')) return;
    var ref = bc.querySelector('.action-btn');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tj-select-btn';
    btn.setAttribute(TJ_SEL, '0');
    btn.setAttribute('aria-pressed', 'false');
    if (ref && ref.getAttribute('style')) btn.setAttribute('style', ref.getAttribute('style'));
    btn.innerHTML = '<span class="tj-check-circle"></span><span class="tj-select-label">选择</span>';
    bc.appendChild(btn);
  }
  function tjSyncUnpack() {
    var root = document.getElementById('unpackResult');
    if (!root) return;
    /* 标记最外层灰色圆角容器，供 CSS 锁定其原样，避免选中态波及 */
    var sec = root.parentElement;
    while (sec && sec !== document.body && !(sec.classList && sec.classList.contains('result-section')))
      sec = sec.parentElement;
    if (sec && sec.classList && !sec.classList.contains('tj-unpack-section'))
      sec.classList.add('tj-unpack-section');
    tjBulkButtons(root.querySelector('.progress-info'));
    var items = root.querySelectorAll('.decrypted-file-item');
    for (var i = 0; i < items.length; i++) tjSelectButton(items[i]);
    tjUpdateCount();   /* 结果生成 / 清空后同步提示框数量 */
  }

  document.addEventListener('click', function (e) {
    var bulk = tjClosest(e.target, 'tj-bulk-btn');
    if (bulk) {
      var root = document.getElementById('unpackResult');
      if (!root) return;
      if (bulk.getAttribute('data-tj-act') === 'download') {
        tjDownloadSelected();
        try { bulk.blur(); } catch (err) {}
        return;
      }
      var items = root.querySelectorAll('.decrypted-file-item');
      var isAll = bulk.getAttribute('data-tj-act') === 'all';
      for (var i = 0; i < items.length; i++) {
        var btn = items[i].querySelector('.tj-select-btn');
        if (!btn) continue;
        var cur = btn.getAttribute(TJ_SEL) === '1';
        tjSetSelected(btn, isAll ? true : !cur);
      }
      /* 立即失焦：避免 :focus-within / 浏览器焦点环 / 触屏点击高亮波及外层灰色卡片 */
      try { bulk.blur(); } catch (err) {}
      tjUpdateCount();
      return;
    }
    var sel = tjClosest(e.target, 'tj-select-btn');
    if (sel) {
      tjSetSelected(sel, sel.getAttribute(TJ_SEL) !== '1');
      try { sel.blur(); } catch (err) {}
      tjUpdateCount();
    }
  }, false);

  /* 只读接口：供后续版本做批量下载，本次不改动下载逻辑 */
  window.TujiaUnpack = {
    getSelected: function () {
      var root = document.getElementById('unpackResult');
      if (!root) return [];
      var out = [], items = root.querySelectorAll('.decrypted-file-item');
      for (var i = 0; i < items.length; i++) {
        var btn = items[i].querySelector('.tj-select-btn');
        if (!btn || btn.getAttribute(TJ_SEL) !== '1') continue;
        var a = items[i].querySelector('.button-container a[download]');
        var nm = items[i].querySelector('.file-name');
        out.push({
          name: a ? a.getAttribute('download') : (nm ? nm.textContent : ''),
          href: a ? a.getAttribute('href') : ''
        });
      }
      return out;
    }
  };

  function initUnpackMulti() {
    var target = document.getElementById('unpackResult') || document.body;
    if (!target) return;
    new MutationObserver(function () { tjSyncUnpack(); })
      .observe(target, { childList: true, subtree: true });
    tjSyncUnpack();
  }

  /* ========== 8. 大图包解包性能补丁（三端） ==========
     ① 96MB ArrayBuffer 走 transfer，避免结构化克隆双份内存；
     ② 超大文件改用抽样 hash（头尾各 64KB + 长度），跳过整包 SHA-256；
     ④ digest / 传输阶段更新进度文案，消除"假死"观感。 */
  function initPerfPatch() {
    try {
      var W = window.Worker;
      if (W && W.prototype) {
        var origPost = W.prototype.postMessage;
        W.prototype.postMessage = function (message, transfer) {
          try {
            var p = message && message.payload;
            if (p && p.encryptedData instanceof ArrayBuffer &&
                p.encryptedData.byteLength > 8 * 1024 * 1024 &&
                !(transfer && transfer.length)) {
              var copy = p.encryptedData.slice(0);
              var np = {};
              for (var k in p) np[k] = p[k];
              np.encryptedData = copy;
              setUnpackStage('正在传输图包数据…', 35);
              return origPost.call(this, { taskId: message.taskId, action: message.action, payload: np }, [copy]);
            }
          } catch (e) {}
          return origPost.apply(this, arguments);
        };
      }
    } catch (e) {}

    try {
      var origHash = window.calculateFileHash;
      if (typeof origHash === 'function' && !origHash.__tjPatched) {
        var patched = function (buf) {
          if (buf && buf.byteLength > 64 * 1024 * 1024) {
            try {
              var head = new Uint8Array(buf, 0, 65536);
              var tail = new Uint8Array(buf, buf.byteLength - 65536, 65536);
              var sample = new Uint8Array(8 + head.length + tail.length);
              new DataView(sample.buffer).setUint32(0, buf.byteLength, true);
              sample.set(head, 8);
              sample.set(tail, 8 + head.length);
              return crypto.subtle.digest('SHA-256', sample).then(function (d) {
                var out = [], b = new Uint8Array(d);
                for (var i = 0; i < b.length; i++) out.push(('0' + b[i].toString(16)).slice(-2));
                return out.join('');
              });
            } catch (e) {}
          }
          return origHash(buf);
        };
        patched.__tjPatched = true;
        window.calculateFileHash = patched;
      }
    } catch (e) {}

    try {
      var origDigest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = function (alg, data) {
        if (data && data.byteLength > 8 * 1024 * 1024) setUnpackStage('正在校验文件…', 12);
        return origDigest(alg, data).then(function (r) {
          setUnpackStage('正在解析图包…', 30);
          return r;
        });
      };
    } catch (e) {}
  }
  function setUnpackStage(text, pct) {
    try {
      var c = document.getElementById('unpackResult_progressContainer');
      if (!c || c.style.display === 'none') return;
      var t = c.querySelector('.loading-text');
      if (t) t.textContent = text;
      var f = document.getElementById('unpackResult_progressFill');
      if (f && pct != null) f.style.width = pct + '%';
    } catch (e) {}
  }

  /* ========== 9. 拖放解析（仅 HTML / EXE） ==========
     只做"校验文件类型 + 喂给现有解包入口"，解析与结果处理完全复用原代码。 */
  function initDragDrop() {
    if (isApkEnv()) return;
    var overlay = null, depth = 0;
    function ensureOverlay() {
      if (overlay) return overlay;
      overlay = document.createElement('div');
      overlay.className = 'tj-drop-overlay';
      overlay.innerHTML = '<div class="tj-drop-box">' +
        '<div class="tj-drop-icon">📂</div>' +
        '<div class="tj-drop-title">用 Tu Jia Tool 打开</div>' +
        '<div class="tj-drop-sub">松开鼠标，自动解析图夹 / 图包</div></div>';
      document.body.appendChild(overlay);
      return overlay;
    }
    function hasFiles(e) {
      try {
        return !!(e.dataTransfer && e.dataTransfer.types &&
          Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0);
      } catch (err) { return false; }
    }
    document.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth++;
      ensureOverlay().classList.add('show');
    }, true);
    document.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'copy'; } catch (err) {}
      ensureOverlay().classList.add('show');
    }, true);
    document.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      depth--;
      if (depth <= 0) { depth = 0; if (overlay) overlay.classList.remove('show'); }
    }, true);
    document.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0;
      if (overlay) overlay.classList.remove('show');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      var ext = (f.name || '').split('.').pop().toLowerCase();
      if (!/^(png|gif|jpg|jpeg|webp|bmp)$/.test(ext) && !/^image\//.test(f.type || '')) {
        tjNotice('请选择有效的图夹或图包图片（PNG / GIF）');
        return;
      }
      var input = document.getElementById('localDecryptInput');
      if (!input) { tjNotice('未找到解包入口，请手动选择文件'); return; }
      try {
        var dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) { tjNotice('拖放解析失败：' + err.message); return; }
      try {
        var cards = document.querySelectorAll('.collapsible-card');
        for (var i = 0; i < cards.length; i++) {
          if (/图片解包/.test(cards[i].textContent || '')) {
            if (cards[i].classList.contains('collapsed')) {
              var tg = cards[i].querySelector('.collapsible-toggle');
              if (tg) tg.click();
            }
            setTimeout(function (c) { c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120, cards[i]);
            break;
          }
        }
      } catch (err) {}
    }, true);
  }
  function tjNotice(msg) {
    try {
      if (typeof noty === 'function') {
        noty({ text: msg, type: 'warning', timeout: 3000, layout: 'topCenter' });
        return;
      }
    } catch (e) {}
    var el = document.createElement('div');
    el.className = 'tj-notice';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { try { el.parentNode.removeChild(el); } catch (e) {} }, 3000);
  }

  /* ========== 启动 ========== */
  function boot() {
    bootAnnouncement();
    renderRecent();
    initUnpackMulti();
    initPerfPatch();
    initDragDrop();
    setTimeout(ensurePngDefault, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, false);
  else boot();
})();
