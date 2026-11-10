/*
 * 作者水印: GitHub作者MadLife77
 * 本文件由 GitHub作者MadLife77 整合生成
 */
/*
 * 本地版兼容层
 * 首页已移除「分享提示」与「网络图片解密」模块。
 * 主脚本 index.js 在初始化时会直接对这些被删节点调用 addEventListener，
 * 缺少节点会抛错并中断初始化，导致「本地图片解密」和「图片打包」一起失效。
 * 这里为已删节点提供脱离文档的占位元素：不插入页面、不可见、不可点击，
 * 仅用于让初始化顺利完成，对应功能不再可用。
 */
(function () {
  'use strict';
  var removed = ['imageUrlInput', 'networkDecryptBtn', 'copyLinkBtn', 'downloadUrlBtn', 'generateSecretBtn'];
  var stubs = Object.create(null);
  var getById = document.getElementById.bind(document);
  var query = document.querySelector.bind(document);

  function stub(id) {
    if (!stubs[id]) {
      var el = document.createElement(/Input$/.test(id) ? 'input' : 'button');
      el.id = id;
      el.value = '';
      // 部分初始化代码会读写 parentNode.style 或向父节点插入按钮，
      // 给占位元素挂一个脱离文档的父容器，避免 parentNode 为 null 时报错。
      var host = document.createElement('div');
      if (host.appendChild) host.appendChild(el);
      stubs[id] = el;
    }
    return stubs[id];
  }

  document.getElementById = function (id) {
    return getById(id) || (removed.indexOf(id) >= 0 ? stub(id) : null);
  };

  document.querySelector = function (sel) {
    if (typeof sel === 'string' && sel.charAt(0) === '#') {
      var id = sel.slice(1);
      if (removed.indexOf(id) >= 0) return stub(id);
    }
    return query(sel);
  };

  // 线上版支持 ?url= 自动触发网络解密；本地版已移除该功能，抹掉该参数避免误触发。
  var u = new URL(window.location.href);
  if (u.searchParams.has('url')) {
    u.searchParams.delete('url');
    window.history.replaceState(null, '', u.pathname + u.search + u.hash);
  }

  // 主脚本会在表图加载后动态写入「GIF格式 - 适用贴吧」，统一去掉该后缀。
  document.addEventListener('DOMContentLoaded', function () {
    var label = document.getElementById('coverFormatInfo');
    if (!label) return;
    var clean = function () {
      var text = label.textContent || '';
      var next = text.replace(/\s*[-–—]\s*适用贴吧\s*/g, '');
      if (next !== text) label.textContent = next;
    };
    clean();
    if (window.MutationObserver) {
      new MutationObserver(clean).observe(label, { childList: true, characterData: true, subtree: true });
    }
  });

  // 自定义上传区域右上角「返回」：回到上一级的随机表图界面。
  document.addEventListener('DOMContentLoaded', function () {
    var backBtn = document.getElementById('backToRandomBtn');
    if (!backBtn) return;

    // 主脚本进入自定义模式时会清掉 .format-btn.active，提前记住当前格式。
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('#customCoverBtn')) {
        var active = document.querySelector('.format-btn.active');
        if (active) window.__lastCoverFormat = active.dataset.format;
      }
    }, true);

    backBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var fmt = window.__lastCoverFormat || 'gif';
      var formatBtns = document.querySelectorAll('.format-btn');
      formatBtns.forEach(function (b) {
        b.classList.toggle('active', b.dataset.format === fmt);
      });
      if (typeof window.switchToRandomMode === 'function') {
        window.switchToRandomMode();
      } else {
        var cover = document.querySelector('.cover-selection-area');
        var custom = document.querySelector('.custom-upload-area');
        var customBtn = document.getElementById('customCoverBtn');
        if (cover) cover.style.display = 'block';
        if (custom) custom.style.display = 'none';
        if (customBtn) customBtn.classList.remove('active');
        formatBtns.forEach(function (b) {
          b.disabled = false;
          b.style.pointerEvents = 'auto';
        });
        window.currentMode = 'random';
      }
    });
  });

  // 表图信息卡片右侧「刷新」：随机换一张表图。
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('refreshCoverBtn');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.remove('spinning');
      void btn.offsetWidth;
      btn.classList.add('spinning');
      setTimeout(function () { btn.classList.remove('spinning'); }, 650);
      if (typeof window.refreshRandomCover === 'function') {
        window.refreshRandomCover();
      } else {
        var active = document.querySelector('.format-btn.active');
        if (active) active.click();
      }
    });
  });
})();
