/* Bubliny data-tip. Vyriznute z puvodniho gate.js, ktery uz neexistuje -
   prihlaseni resi server. Chovani je stejne: najetim po prodleve, focusem
   z klavesnice hned, flash() okamzite pro potvrzeni akce. */

/* ---------- sdílené bubliny (data-tip) ----------
 * Ikonová tlačítka nesou význam jen tvarem, popis proto ukazuje bublina.
 * Stačí atribut data-tip="Popis" na libovolném prvku (i doplněném později),
 * obsluha je delegovaná na dokumentu. Ukáže se po 0,5 s najetí nebo hned
 * při focusu z klávesnice; aria-label si prvek drží sám, bublina je jen
 * vizuální. window.draftTip.flash(prvek, text) ukáže bublinu okamžitě
 * (potvrzení akce, např. „Zkopírováno").
 */
(function () {
  'use strict';
  if (window.draftTip) return;

  var DELAY = 500;
  var CSS =
    '.wstip{position:fixed;top:0;left:0;z-index:2147483100;max-width:260px;padding:5px 8px;' +
    'background:#000;color:#fff;border-radius:0;' +
    'font-family:\'Urbanist\',\'Helvetica Neue\',Arial,sans-serif;font-size:12px;font-weight:600;' +
    'line-height:1.3;white-space:nowrap;pointer-events:none;visibility:hidden}' +
    '.wstip.on{visibility:visible}';

  var node = null;
  var timer = null;
  var armed = null;

  function ensure() {
    if (node) return node;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    node = document.createElement('div');
    node.className = 'wstip';
    node.setAttribute('aria-hidden', 'true');
    document.body.appendChild(node);
    return node;
  }

  /* nad prvkem, a když se tam nevejde, pod ním; vždy uvnitř okna */
  function place(el) {
    var r = el.getBoundingClientRect();
    var t = node.getBoundingClientRect();
    var maxLeft = Math.max(8, document.documentElement.clientWidth - t.width - 8);
    var left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), maxLeft);
    var top = r.top - t.height - 6;
    if (top < 8) top = r.bottom + 6;
    node.style.left = Math.round(left) + 'px';
    node.style.top = Math.round(top) + 'px';
  }

  function hide() {
    if (timer) { clearTimeout(timer); timer = null; }
    armed = null;
    if (node) node.classList.remove('on');
  }

  function show(el, text) {
    if (!text || !el.isConnected) return;
    ensure();
    node.textContent = text;
    node.classList.add('on');
    place(el);
  }

  function arm(el, delay) {
    if (el === armed) return;
    hide();
    if (!el) return;
    armed = el;
    timer = setTimeout(function () {
      timer = null;
      if (armed === el) show(el, el.getAttribute('data-tip'));
    }, delay);
  }

  function flash(el, text, ms) {
    if (!el) return;
    hide();
    armed = el;
    show(el, text);
    timer = setTimeout(hide, ms || 1500);
  }

  function tipOf(target) {
    return target && target.closest ? target.closest('[data-tip]') : null;
  }

  /* Rolování schová jen vykreslenou bublinu – rozečtený odpočet doběhne
     a napozicuje se až podle nové polohy prvku (jinak by se bublina po
     rolování pod kurzorem už neukázala). */
  function hideShown() {
    if (node && node.classList.contains('on')) hide();
  }

  document.addEventListener('mouseover', function (e) { arm(tipOf(e.target), DELAY); });
  document.addEventListener('focusin', function (e) { arm(tipOf(e.target), 0); });
  document.addEventListener('focusout', hide);
  document.addEventListener('mousedown', hide);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hideShown, true);
  window.addEventListener('resize', hide);

  window.draftTip = { flash: flash, hide: hide };
})();
