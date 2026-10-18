/* Haptiq — helpers used on every page */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Count a number up (or down) from data-count-from to data-count-to */
  function countUp(el) {
    const from = parseFloat(el.dataset.countFrom || '0');
    const to = parseFloat(el.dataset.countTo || '0');
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const dur = 1600;
    const ring = el.hasAttribute('data-ring-value') ? document.querySelector('[data-ring]') : null;
    const paint = (v) => {
      el.textContent = v.toFixed(dec);
      if (ring) ring.setAttribute('stroke-dasharray', ((v / 10) * 351.9).toFixed(1) + ' 352');
    };
    if (reduceMotion) { paint(to); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      paint(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* Fade-up: add .in when an element scrolls into view; start count-ups inside it */
  function initReveal(root) {
    const els = (root || document).querySelectorAll('.fu');
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('in');
        el.querySelectorAll('[data-count-to]').forEach(countUp);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    els.forEach(el => io.observe(el));
  }

  /* Animated waveform bars */
  function fillWaves() {
    document.querySelectorAll('[data-wave]').forEach(box => {
      let html = '';
      for (let i = 0; i < 30; i++) {
        const h = Math.round(18 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.55)) * 82);
        html += '<span class="wb" style="height:' + h + '%;animation-delay:' + (-(i * 0.09)).toFixed(2) + 's"></span>';
      }
      box.innerHTML = html;
    });
  }

  /* Illustrated brain with glowing pathway (not a scan) */
  const BRAIN_SVG =
    '<svg viewBox="0 0 360 300" style="width:100%;height:100%;overflow:visible" aria-hidden="true">' +
    '<path d="M70 150 C60 92 112 48 176 50 C214 30 282 42 306 88 C340 108 344 162 314 188 C300 212 262 222 236 210 C214 226 176 230 150 218 C118 230 84 214 80 190 C64 182 66 164 70 150 Z" fill="#3B465E" fill-opacity=".75" stroke="#E8D7BC" stroke-opacity=".3" stroke-width="1.5"/>' +
    '<g fill="none" stroke="#E8D7BC" stroke-opacity=".14" stroke-width="1.5" stroke-linecap="round"><path d="M120 80 C140 100 130 130 150 150"/><path d="M180 60 C192 90 170 112 190 140"/><path d="M232 60 C222 92 248 110 236 140"/><path d="M284 92 C264 116 288 132 272 162"/><path d="M100 170 C136 158 170 180 204 166"/></g>' +
    '<path d="M222 204 C226 232 230 258 236 292 L260 292 C254 258 250 230 248 206 Z" fill="#3B465E" stroke="#E8D7BC" stroke-opacity=".25"/>' +
    '<ellipse cx="270" cy="206" rx="40" ry="22" fill="#3B465E" stroke="#E8D7BC" stroke-opacity=".25"/>' +
    '<path d="M326 292 C306 272 280 256 248 236 C222 220 192 192 162 162 C142 142 120 130 96 122" fill="none" stroke="#AE9E91" stroke-opacity=".28" stroke-width="12" stroke-linecap="round"/>' +
    '<path d="M326 292 C306 272 280 256 248 236 C222 220 192 192 162 162 C142 142 120 130 96 122" fill="none" stroke="#E8D7BC" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path class="bpulse" d="M326 292 C306 272 280 256 248 236 C222 220 192 192 162 162 C142 142 120 130 96 122" fill="none" stroke="#E8D7BC" stroke-width="7" stroke-linecap="round" stroke-dasharray="18 340"/>' +
    '<circle cx="326" cy="292" r="16" fill="none" stroke="#E8D7BC" stroke-opacity=".4" class="pulse"/><circle cx="326" cy="292" r="7" fill="#E8D7BC"/><circle cx="248" cy="236" r="5" fill="#E8D7BC"/>' +
    '</svg>';

  function fillBrains() {
    document.querySelectorAll('[data-brain]').forEach(box => { box.innerHTML = BRAIN_SVG; });
  }

  /* Escape text before putting it into innerHTML */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.Haptiq = { initReveal, countUp, fillWaves, fillBrains, esc, reduceMotion };

  document.addEventListener('DOMContentLoaded', () => {
    fillWaves();
    fillBrains();
    initReveal();
  });
})();
