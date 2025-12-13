/* celebration.js — Updated: auto-open at/after target date, background image fallback,
   improved contrast, gentle confetti, safe for non-coders. */
(function () {
  'use strict';

  const ROOT_ID = 'celebration-widget-root';
  const BADGE_ID = 'cw-countdown-badge';

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  let badge = document.getElementById(BADGE_ID);
  // create badge if missing
  if (!badge) {
    badge = document.createElement('button');
    badge.id = BADGE_ID;
    badge.type = 'button';
    badge.className = 'cw-badge-auto';
    badge.setAttribute('aria-label', 'Open celebration');
    badge.innerHTML = `<span class="label">Countdown</span><span class="value" aria-hidden="true"></span>`;
    document.body.appendChild(badge);
  }

  const modal = root.querySelector('.cw-modal');
  const closeBtn = root.querySelector('#cw-close');
  const bigVal = root.querySelector('#cw-big-val');
  const meta = root.querySelector('#cw-meta');
  const bgEl = root.querySelector('#cw-bg');
  const cwBadge = root.querySelector('#cw-badge');
  const titleEl = root.querySelector('#cw-title');
  const subEl = root.querySelector('#cw-sub');
  const badgeValue = root.querySelector('.value') || root.querySelector('#cw-badge-value');

  const ds = root.dataset || {};

    // Respect explicit toggles:
  // - If body has data-celebration="on" -> force-enable widget.
  // - If body has data-celebration="off" or root.dataset.enabled === 'false' -> disable.
  const bodyToggle = document.body && document.body.dataset && document.body.dataset.celebration;

  if (String(bodyToggle).toLowerCase() === 'off' || ds.enabled === 'false') {
    root.style.display = 'none';
    badge.style.display = 'none';
    return;
  }

  // If body toggle explicitly "on", ensure badge/widget are visible regardless of other defaults
  if (String(bodyToggle).toLowerCase() === 'on') {
    try {
      root.style.display = '';
      root.classList.remove('hidden');
      if (badge) { badge.style.display = ''; badge.classList.remove('hidden'); }
    } catch (e) { /* silent */ }
  }


  // parse target date from data-target; fallback: next Jan 1
  function nextJanFirst() {
    const now = new Date();
    return new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0);
  }

  let targetDate = ds.target ? new Date(ds.target) : nextJanFirst();
  if (isNaN(targetDate.getTime())) targetDate = nextJanFirst();

  // config and defaults
  const cfg = {
    beforeBadge: ds.beforeBadge || 'Countdown',
    beforeTitle: ds.beforeTitle || 'Karunya welcomes the New Year',
    beforeSub: ds.beforeSub || 'Counting down…',
    beforeBg: ds.beforeBg || '',

    afterBadge: ds.afterBadge || 'Happy Day',
    afterTitle: ds.afterTitle || 'Happy Day',
    afterSub: ds.afterSub || 'Warm wishes from everyone',
    afterBg: ds.afterBg || ds.afterBg || 'images/banner.jpg',

    autoOpenThresholdMs: (ds.autoOpenMinutes ? Number(ds.autoOpenMinutes) : 10) * 60 * 1000,
    showModalBefore: ds.showModalBefore !== 'false'
  };

  // helpers
  function pad(n) { return String(n).padStart(2, '0'); }

  function formatCountdown(ms) {
    if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0 };
    const sec = Math.floor(ms / 1000);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return { d, h, m, s };
  }

  function renderCountdown(ms) {
    const t = formatCountdown(ms);
    if (bigVal) bigVal.textContent = `${pad(t.d)} : ${pad(t.h)} : ${pad(t.m)} : ${pad(t.s)}`;
    if (meta) meta.textContent = 'DD : HH : MM : SS';
    if (badgeValue) badgeValue.textContent = `${t.d}d ${pad(t.h)}h`;
    badge.setAttribute('aria-label', `Countdown: ${t.d} days ${t.h} hours`);
  }

  // swap content before/after
  function swapToBefore() {
    if (cwBadge) cwBadge.textContent = cfg.beforeBadge;
    if (titleEl) titleEl.textContent = cfg.beforeTitle;
    if (subEl) subEl.textContent = cfg.beforeSub;
    if (bgEl && cfg.beforeBg) bgEl.style.backgroundImage = `url('${cfg.beforeBg}')`;
    badge.querySelector('.label') && (badge.querySelector('.label').textContent = cfg.beforeBadge);
  }

  function swapToAfter() {
    if (cwBadge) cwBadge.textContent = cfg.afterBadge;
    if (titleEl) titleEl.textContent = cfg.afterTitle;
    if (subEl) subEl.textContent = cfg.afterSub;
    // use provided afterBg if present; else fallback to images/banner.jpg
    const afterBg = ds.afterBg || cfg.afterBg || 'images/banner.jpg';
    if (bgEl) bgEl.style.backgroundImage = `url('${afterBg}')`;
    badge.querySelector('.label') && (badge.querySelector('.label').textContent = cfg.afterBadge);
    openModal();
    startConfettiOnce();
  }

  // modal control
  function openModal() {
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    if (modal) modal.style.display = 'flex';
    // focus close button for accessibility
    closeBtn && closeBtn.focus && closeBtn.focus();
    if (Date.now() >= targetDate.getTime()) startConfettiOnce();
  }

  function closeModal() {
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    if (modal) modal.style.display = 'none';
    badge.focus && badge.focus();
  }

  function showBadge() { badge.classList.remove('hidden'); }
  function hideBadge() { badge.classList.add('hidden'); }

  // light confetti
  let confettiRunning = false;
  function startConfettiOnce() {
    if (confettiRunning) return;
    if (!modal) return;
    confettiRunning = true;

    const card = modal.querySelector('.cw-card') || modal;
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = 9999;
    card.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    function resize() {
      canvas.width = card.clientWidth * devicePixelRatio;
      canvas.height = card.clientHeight * devicePixelRatio;
      canvas.style.width = card.clientWidth + 'px';
      canvas.style.height = card.clientHeight + 'px';
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 80;
    const DURATION = 6000;
    const colors = ['#FF5E5E','#FFD166','#06D6A0','#4D96FF','#A28BFF','#FF7AA2'];

    const parts = Array.from({ length: COUNT }, () => ({
      x: Math.random() * card.clientWidth,
      y: Math.random() * -card.clientHeight,
      w: 6 + Math.random() * 10,
      h: 8 + Math.random() * 12,
      vx: -1 + Math.random() * 2,
      vy: 1 + Math.random() * 4,
      rot: Math.random()*Math.PI*2,
      vrot: -0.05 + Math.random()*0.1,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));

    const start = performance.now();

    function frame(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      parts.forEach(p => {
        p.vy += 0.03;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - (elapsed / DURATION));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });

      if (elapsed < DURATION) requestAnimationFrame(frame);
      else {
        try { card.removeChild(canvas); } catch (e) {}
        window.removeEventListener('resize', resize);
        confettiRunning = false;
      }
    }

    requestAnimationFrame(frame);
  }

  // main loop
  let celebrationTriggered = false;
  function startLoop() {
    renderCountdown(Math.max(0, targetDate - Date.now()));
    setInterval(() => {
      const now = Date.now();
      const diff = targetDate - now;
      if (diff <= 0) {
        renderCountdown(0);
        if (!celebrationTriggered) {
          celebrationTriggered = true;
          swapToAfter();
        }
      } else {
        renderCountdown(diff);
        if (cfg.showModalBefore && diff < cfg.autoOpenThresholdMs) {
          openModal();
        }
      }
    }, 1000);
  }

  // events
  badge.addEventListener('click', openModal);
  closeBtn && closeBtn.addEventListener('click', closeModal);
  modal?.querySelector('.cw-backdrop')?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // initialize state
  if (Date.now() >= targetDate.getTime()) {
    swapToAfter();
  } else {
    swapToBefore();
    showBadge();
  }
  renderCountdown(Math.max(0, targetDate - Date.now()));
  startLoop();

  // expose quick test helper
  try { root.celebrationTest = function(){ swapToAfter(); startConfettiOnce(); openModal(); }; } catch (e) {}

})();
