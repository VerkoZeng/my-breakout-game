/*!
 * 轻量 Font Awesome 垫片 v1.0
 * ------------------------------------------------------------
 * 替代 Font Awesome Free 5.13.1 的 all.min.js（1.18 MB）。
 * 只包含本页实际用到的 8 个图标，体积约 8 KB。
 *
 * 行为与 all.min.js 一致：把 <i class="fas fa-xxx"></i> 替换为等价的内联 SVG，
 * 并通过 MutationObserver 对运行时动态插入的节点持续生效。
 * 路径数据取自 FA 官方 API（FontAwesome.icon()），与 all.min.js 渲染结果逐字节一致。
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* name: [prefix, viewBox, widthClass, pathData] */
  var ICONS = {
    "check-square":   ["fas", "0 0 448 512", "fa-w-14",
      "M400 480H48c-26.51 0-48-21.49-48-48V80c0-26.51 21.49-48 48-48h352c26.51 0 48 21.49 48 48v352c0 26.51-21.49 48-48 48zm-204.686-98.059l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.248-16.379-6.249-22.628 0L184 302.745l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.25 16.379 6.25 22.628.001z"],
    "cocktail":       ["fas", "0 0 576 512", "fa-w-18",
      "M296 464h-56V338.78l168.74-168.73c15.52-15.52 4.53-42.05-17.42-42.05H24.68c-21.95 0-32.94 26.53-17.42 42.05L176 338.78V464h-56c-22.09 0-40 17.91-40 40 0 4.42 3.58 8 8 8h240c4.42 0 8-3.58 8-8 0-22.09-17.91-40-40-40zM432 0c-62.61 0-115.35 40.2-135.18 96h52.54c16.65-28.55 47.27-48 82.64-48 52.93 0 96 43.06 96 96s-43.07 96-96 96c-14.04 0-27.29-3.2-39.32-8.64l-35.26 35.26C379.23 279.92 404.59 288 432 288c79.53 0 144-64.47 144-144S511.53 0 432 0z"],
    "fire":           ["fas", "0 0 384 512", "fa-w-12",
      "M216 23.86c0-23.8-30.65-32.77-44.15-13.04C48 191.85 224 200 224 288c0 35.63-29.11 64.46-64.85 63.99-35.17-.45-63.15-29.77-63.15-64.94v-85.51c0-21.7-26.47-32.23-41.43-16.5C27.8 213.16 0 261.33 0 320c0 105.87 86.13 192 192 192s192-86.13 192-192c0-170.29-168-193-168-296.14z"],
    "plus-square":    ["far", "0 0 448 512", "fa-w-14",
      "M352 240v32c0 6.6-5.4 12-12 12h-88v88c0 6.6-5.4 12-12 12h-32c-6.6 0-12-5.4-12-12v-88h-88c-6.6 0-12-5.4-12-12v-32c0-6.6 5.4-12 12-12h88v-88c0-6.6 5.4-12 12-12h32c6.6 0 12 5.4 12 12v88h88c6.6 0 12 5.4 12 12zm96-160v352c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V80c0-26.5 21.5-48 48-48h352c26.5 0 48 21.5 48 48zm-48 346V86c0-3.3-2.7-6-6-6H54c-3.3 0-6 2.7-6 6v340c0 3.3 2.7 6 6 6h340c3.3 0 6-2.7 6-6z"],
    "question-circle":["far", "0 0 512 512", "fa-w-16",
      "M256 8C119.043 8 8 119.083 8 256c0 136.997 111.043 248 248 248s248-111.003 248-248C504 119.083 392.957 8 256 8zm0 448c-110.532 0-200-89.431-200-200 0-110.495 89.472-200 200-200 110.491 0 200 89.471 200 200 0 110.53-89.431 200-200 200zm107.244-255.2c0 67.052-72.421 68.084-72.421 92.863V300c0 6.627-5.373 12-12 12h-45.647c-6.627 0-12-5.373-12-12v-8.659c0-35.745 27.1-50.034 47.579-61.516 17.561-9.845 28.324-16.541 28.324-29.579 0-17.246-21.999-28.693-39.784-28.693-23.189 0-33.894 10.977-48.942 29.969-4.057 5.12-11.46 6.071-16.666 2.124l-27.824-21.098c-5.107-3.872-6.251-11.066-2.644-16.363C184.846 131.491 214.94 112 261.794 112c49.071 0 101.45 38.304 101.45 88.8zM298 368c0 23.159-18.841 42-42 42s-42-18.841-42-42 18.841-42 42-42 42 18.841 42 42z"],
    "square-root-alt":["fas", "0 0 576 512", "fa-w-18",
      "M571.31 251.31l-22.62-22.62c-6.25-6.25-16.38-6.25-22.63 0L480 274.75l-46.06-46.06c-6.25-6.25-16.38-6.25-22.63 0l-22.62 22.62c-6.25 6.25-6.25 16.38 0 22.63L434.75 320l-46.06 46.06c-6.25 6.25-6.25 16.38 0 22.63l22.62 22.62c6.25 6.25 16.38 6.25 22.63 0L480 365.25l46.06 46.06c6.25 6.25 16.38 6.25 22.63 0l22.62-22.62c6.25-6.25 6.25-16.38 0-22.63L525.25 320l46.06-46.06c6.25-6.25 6.25-16.38 0-22.63zM552 0H307.65c-14.54 0-27.26 9.8-30.95 23.87l-84.79 322.8-58.41-106.1A32.008 32.008 0 0 0 105.47 224H24c-13.25 0-24 10.74-24 24v48c0 13.25 10.75 24 24 24h43.62l88.88 163.73C168.99 503.5 186.3 512 204.94 512c17.27 0 44.44-9 54.28-41.48L357.03 96H552c13.25 0 24-10.75 24-24V24c0-13.26-10.75-24-24-24z"],
    "times-circle":   ["fas", "0 0 512 512", "fa-w-16",
      "M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm121.6 313.1c4.7 4.7 4.7 12.3 0 17L338 377.6c-4.7 4.7-12.3 4.7-17 0L256 312l-65.1 65.6c-4.7 4.7-12.3 4.7-17 0L134.4 338c-4.7-4.7-4.7-12.3 0-17l65.6-65-65.6-65.1c-4.7-4.7-4.7-12.3 0-17l39.6-39.6c4.7-4.7 12.3-4.7 17 0l65 65.7 65.1-65.6c4.7-4.7 12.3-4.7 17 0l39.6 39.6c4.7 4.7 4.7 12.3 0 17L312 256l65.6 65.1z"],
    "trash-alt":      ["fas", "0 0 448 512", "fa-w-14",
      "M32 464a48 48 0 0 0 48 48h288a48 48 0 0 0 48-48V128H32zm272-256a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zm-96 0a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zm-96 0a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zM432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16z"]
  };

  function toSvg(el) {
    var raw = (el.getAttribute('class') || '').split(/\s+/);
    var name = null, extra = [], i, c, n;
    for (i = 0; i < raw.length; i++) {
      c = raw[i];
      if (!c) continue;
      /* 前缀标记（fas/far/fab）只用于识别，不落到 SVG 上 */
      if (c === 'fas' || c === 'far' || c === 'fab' || c === 'fal' || c === 'fad') continue;
      if (c.indexOf('fa-') === 0) {
        n = c.slice(3);
        if (ICONS[n]) { if (name === null) { name = n; continue; } }
      }
      extra.push(c);
    }
    if (name === null) return null;

    var d = ICONS[name];
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('data-prefix', d[0]);
    svg.setAttribute('data-icon', name);
    svg.setAttribute('role', 'img');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('viewBox', d[1]);
    svg.setAttribute('class', 'svg-inline--fa fa-' + name + ' ' + d[2] +
      (extra.length ? ' ' + extra.join(' ') : ''));

    var p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('d', d[3]);
    svg.appendChild(p);

    /* 继承原元素上的其它属性（data-toggle / title / aria-* 等），class 除外 */
    for (i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name !== 'class') svg.setAttribute(a.name, a.value);
    }
    return svg;
  }

  function isIcon(el) {
    return el.nodeType === 1 && el.tagName === 'I' &&
      /(^|\s)fa[sbr](\s|$)/.test(el.getAttribute('class') || '');
  }

  /* 自身是 <i> 或子树里含 <i> 都处理；先快照再替换，避免遍历活集合时漏项 */
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    var list = [], i;
    if (isIcon(root)) list.push(root);
    var kids = root.getElementsByTagName('i');
    for (i = 0; i < kids.length; i++) if (isIcon(kids[i])) list.push(kids[i]);
    for (i = 0; i < list.length; i++) {
      var svg = toSvg(list[i]);
      if (svg && list[i].parentNode) list[i].parentNode.replaceChild(svg, list[i]);
    }
  }

  var busy = false;
  function sweep(records) {
    if (busy) return;
    busy = true;
    try {
      for (var r = 0; r < records.length; r++) {
        var added = records[r].addedNodes;
        for (var a = 0; a < added.length; a++) scan(added[a]);
      }
    } catch (e) { /* 单次失败不应影响后续替换 */ }
    busy = false;
  }

  function boot() {
    scan(document.body || document.documentElement);
    if (typeof MutationObserver === 'function') {
      new MutationObserver(sweep).observe(
        document.documentElement || document.body,
        { childList: true, subtree: true }
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
