/*!
 * portfolio / nav-spy.js
 * ---------------------------------------------------------------------------
 * 顶部导航选中态：滚动时高亮当前所处章节对应的 nav 链接。
 * 判定线取视口 35% 处（与参考实现一致）；触底时强制高亮最后一项，
 * 避免末尾 footer 因页面到底而无法越过判定线。
 * 无跨模块依赖，直接以 <script> 引入即可。
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  const links = Array.prototype.slice.call(
    document.querySelectorAll('.nav-links a[href^="#"]')
  );
  if (!links.length) return;

  const sections = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);
  if (!sections.length) return;

  let ticking = false;
  let lastActive = null;

  // 窄屏时 .nav-links 是横向滚动容器：把当前章节的胶囊滚回可视区。
  // 只改容器自身的 scrollLeft，不触发页面纵向跳动。
  function reveal(a) {
    const box = a.parentNode;
    if (!box || box.scrollWidth <= box.clientWidth + 1) return;
    const b = box.getBoundingClientRect();
    const r = a.getBoundingClientRect();
    const pad = 8;
    if (r.left < b.left + pad) {
      box.scrollLeft -= (b.left + pad - r.left);
    } else if (r.right > b.right - pad) {
      box.scrollLeft += (r.right - b.right + pad);
    }
  }

  function update() {
    const line = window.innerHeight * 0.35;
    let current = sections[0];

    for (let i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= line) current = sections[i];
    }
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      current = sections[sections.length - 1];
    }

    const activeHash = '#' + current.id;
    let activeLink = null;
    links.forEach(function (a) {
      const on = a.getAttribute('href') === activeHash;
      a.classList.toggle('active', on);
      if (on) activeLink = a;
    });
    if (activeLink && activeLink !== lastActive) reveal(activeLink);
    lastActive = activeLink;
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
