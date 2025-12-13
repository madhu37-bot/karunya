/* app.js — Final stable version
   Loads:
   - data/events.json
   - content/site-text.json
   Creates:
   - Hero slideshow
   - Daily Delight card
   - Projects streams (4 areas)
   - Activity grid
   - Splash water preloader
*/

/* ---------------------------------------------
   DOM SHORTCUTS
--------------------------------------------- */
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; }

function setImageSrc(img, src) {
  if (!img || !src) return;
  img.src = src;
  img.loading = "lazy";
  img.decoding = "async";
}

/* ---------------------------------------------
   FETCH HELPERS
--------------------------------------------- */
async function fetchWithTimeout(url, timeout = 3000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const r = await fetch(url, { cache: "no-cache", signal: controller.signal });
    clearTimeout(id);
    if (!r.ok) throw new Error("Fetch failed");
    return await r.json();
  } catch (e) {
    clearTimeout(id);
    console.warn("fetchWithTimeout failed:", url, e);
    return null;
  }
}

/* ---------------------------------------------
   APPLY LANGUAGE TEXT (site-text.json)
--------------------------------------------- */
function applySiteText(t) {
  if (!t) return;
  try {
    // prefer language from meta.langDefault ('ml' or 'en'), fallback to 'ml'
    const lang = (t.meta && t.meta.langDefault) ? String(t.meta.langDefault).toLowerCase() : 'ml';
    const pick = (obj, keyBase) => {
      if (!obj) return '';
      // keys like title_ml / title_en or subtitle_ml / subtitle_en
      const k = keyBase + '_' + (lang === 'en' ? 'en' : 'ml');
      return obj[k] ?? obj[keyBase + '_en'] ?? obj[keyBase + '_ml'] ?? '';
    };

    /* NAV */
    (t.nav || []).forEach(item => {
      const a = qs(`#${item.id}`);
      if (a) a.textContent = pick(item, 'label');
    });

    /* HERO TITLE */
    const h1 = qs(".top-hero .overlay h1");
    if (h1 && t.home?.hero) {
      h1.textContent = pick(t.home.hero, 'h1') || t.home.hero.h1_ml || t.home.hero.h1_en;
    }

    const hp = qs(".top-hero .overlay p");
    if (hp && t.home?.hero) {
      // prefer subtitle according to lang
      hp.textContent = pick(t.home.hero, 'subtitle') || t.home.hero.subtitle_en || t.home.hero.subtitle_ml;
    }

    /* DAILY DELIGHT */
    if (t.home?.dailyDelight) {
      const dd = t.home.dailyDelight;
      if (qs("#sneh-caption-ml") && qs("#sneh-caption")) {
        // if both lang-specific nodes exist, populate both
        if (dd.caption_ml) qs("#sneh-caption-ml").textContent = dd.caption_ml;
        if (dd.caption_en) qs("#sneh-caption").textContent = dd.caption_en;
      } else {
        // fallback: single caption node, choose based on lang
        const capNode = qs("#sneh-caption") || qs("#sneh-caption-ml");
        if (capNode) capNode.textContent = (lang === 'en') ? (dd.caption_en || dd.caption_ml) : (dd.caption_ml || dd.caption_en);
      }
      // title
      const titleNode = qs("#sneh-title");
      if (titleNode) titleNode.textContent = (lang === 'en') ? (dd.title_en || dd.title_ml) : (dd.title_ml || dd.title_en);
      if (dd.image) setImageSrc(qs("#sneh-img"), dd.image);
      if (dd.link) qs("#sneh-link").href = dd.link;
    }

    /* ADMISSIONS (existing logic will work; ensure steps array present) */
    if (t.home?.admissions?.steps) {
      const steps = t.home.admissions.steps;
      const container = qs(".admission-steps");
      if (container) {
        container.innerHTML = "";
        steps.forEach(s => {
          const step = el("div", "step card pad");
          step.innerHTML = `
            <div class="dot">${s.step}</div>
            <div>
              <h3 class="ml h3">${lang === 'en' ? (s.title_en || s.title_ml) : (s.title_ml || s.title_en)}</h3>
              <div class="bilingual">
                <p class="ml">${s.body_ml || ""}</p>
                <p class="en">${s.body_en || ""}</p>
              </div>
            </div>`;
          container.appendChild(step);
        });
      }
    }

    /* MEDICAL section (optional selectors) */
    const medTitle = qs("#medical-title");
    const medExcerpt = qs("#medical-excerpt");
    if (t.medical && (medTitle || medExcerpt)) {
      if (medTitle) medTitle.textContent = (lang === 'en') ? (t.medical.title_en || t.medical.title_ml) : (t.medical.title_ml || t.medical.title_en);
      if (medExcerpt) medExcerpt.textContent = (lang === 'en') ? (t.medical.excerpt_en || t.medical.excerpt_ml) : (t.medical.excerpt_ml || t.medical.excerpt_en);
    }

    /* FOOTER */
    if (t.footer) {
      const mlName = qs("footer .footer-left .ml");
      if (mlName && t.footer.org_name_ml) mlName.textContent = t.footer.org_name_ml;

      const contact = qs("footer .footer-contact");
      if (contact && Array.isArray(t.footer.contact)) {
        contact.innerHTML =
          `<div class="cap">Contact</div><div class="space-xs"></div>` +
          t.footer.contact.map(c => `<div class="cap">${c}</div>`).join("") +
          `<div class="cap">${t.footer.address || ""}</div>`;
      }

      const copyright = qs('footer .cap[style*="text-align:center"]');
      if (copyright && t.footer.copyright)
        copyright.textContent = t.footer.copyright;
    }

  } catch (e) {
    console.warn("applySiteText failed", e);
  }
}


/* ---------------------------------------------
   HERO SLIDESHOW
--------------------------------------------- */
const FIXED_HERO = [
  { src: "images/hero-fixed-1.jpg", alt: "Hero image 1" },
  { src: "images/hero-fixed-2.jpg", alt: "Hero image 2" },
  { src: "images/hero-fixed-3.jpg", alt: "Hero image 3" },
  { src: "images/hero-fixed-4.jpg", alt: "Hero image 4" }
];

function makeSlide(src, alt) {
  const slide = el("div", "slide play");
  const img = el("img");
  img.src = src;
  img.alt = alt || "";
  slide.appendChild(img);
  return slide;
}

async function buildTopHero(data, maxEventSlides = 3) {
  const wrap = qs("#top-hero-media");
  if (!wrap) return;

  wrap.innerHTML = "";  
  const slides = [];

  FIXED_HERO.forEach(f => slides.push(f));

  const events = (data.events || []).slice().sort((a, b) =>
    new Date(b.date) - new Date(a.date)
  );

  events.slice(0, maxEventSlides).forEach(ev => {
    const first = ev.cover?.[0] || ev.images?.[0] || "1";
    slides.push({
      src: `${data.imagesBase || "images"}/${ev.folder}/${first}.${data.imageExt || "jpg"}`,
      alt: ev.title || ""
    });
  });

  const per = 4; // seconds per slide
  const total = slides.length * per;

  slides.forEach((s, i) => {
    const sEl = makeSlide(s.src, s.alt);
    sEl.style.animationDuration = total + "s";
    sEl.style.animationDelay = (i * per) + "s";
    wrap.appendChild(sEl);
  });
}

/* ---------------------------------------------
   DAILY DELIGHT POPULATOR
--------------------------------------------- */
function populateDailyDelight(data) {
  try {
    const events = data.events || [];
    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = events[0];
    if (!latest) return;

    const pick = latest.cover?.[0] || latest.images?.[0] || "1";
    const url = `${data.imagesBase || "images"}/${latest.folder}/${pick}.${data.imageExt || "jpg"}`;

    setImageSrc(qs("#sneh-img"), url);
    qs("#sneh-title").textContent = latest.title || "";
    qs("#sneh-date").textContent = new Date(latest.date).toLocaleDateString();
    if (latest.excerpt) qs("#sneh-caption").textContent = latest.excerpt;
    qs("#sneh-link").href = latest.url || "activity.html";

  } catch (e) {
    console.error("populateDailyDelight error:", e);
  }
}

/* ---------------------------------------------
   PROJECT STREAMS
--------------------------------------------- */
function seedStream(imgSel, listSel, data, tags) {
  const img = qs(imgSel);
  const list = qs(listSel);
  if (list) list.innerHTML = "";

  const found = (data.events || []).filter(e =>
    (e.tags || []).some(t => tags.includes(t))
  ).slice(0, 2);

  if (found[0] && img) {
    const pick = found[0].cover?.[0] || found[0].images?.[0] || "1";
    setImageSrc(img,
      `${data.imagesBase}/${found[0].folder}/${pick}.${data.imageExt}`
    );
    img.alt = found[0].title || "";
  }

  if (list) {
    if (found.length === 0) {
      list.innerHTML = "<li>No recent items</li>";
      return;
    }

    found.forEach(e => {
      const li = el("li");
      li.innerHTML =
        `<span class="pill">${new Date(e.date).toLocaleDateString()}</span> ${e.title}`;
      list.appendChild(li);
    });
  }
}

/* ---------------------------------------------
   ASSETS / SPLASH PRELOADER
--------------------------------------------- */
function gatherAssetUrls(extra = []) {
  const urls = new Set();
  qsa("img").forEach(img => {
    const s = img.getAttribute("src");
    if (s) urls.add(s);
    const ds = img.dataset.src;
    if (ds) urls.add(ds);
  });
  extra.forEach(u => u && urls.add(u));
  return [...urls];
}

function setSplashProgress(p) {
  const bar = qs("#water-fill");
  const txt = qs("#water-percent");
  if (!bar || !txt) return;
  bar.style.width = Math.max(0, Math.min(100, p)) + "%";
  txt.textContent = Math.round(p) + "%";
}

function preloadImages(urls, { onProgress, timeout = 8000 }) {
  return new Promise(res => {
    if (!urls.length) { res(); return; }

    let loaded = 0;
    let finished = false;

    const done = () => {
      if (finished) return;
      finished = true;
      onProgress && onProgress(100);
      res();
    };

    const tick = () => {
      loaded++;
      onProgress && onProgress((loaded / urls.length) * 100);
      if (loaded >= urls.length) done();
    };

    urls.forEach(u => {
      const img = new Image();
      img.onload = img.onerror = tick;
      img.src = u;
    });

    setTimeout(done, timeout);
  });
}

function hideSplash() {
  const s = qs("#splash");
  if (!s) return;
  s.classList.add("hidden");
  setTimeout(() => s.remove(), 400);
}

/* ---------------------------------------------
   MAIN BOOT SEQUENCE
--------------------------------------------- */
async function boot() {
  const start = Date.now();
  const minShow = 600;

  /* Load events */
  let data = { events: [], imagesBase: "images", imageExt: "jpg" };
  try {
    const r = await fetch("data/events.json", { cache: "no-cache" });
    if (r.ok) data = await r.json();
  } catch (e) {
    console.warn("events.json failed:", e);
  }

  /* Load site text */
  const siteText = await fetchWithTimeout("content/site-text.json", 2500);
  if (siteText) applySiteText(siteText);

  /* Build hero */
  await buildTopHero(data, 3);

  /* Activity grid */
  const grid = qs("#act-grid");
  if (grid) {
    grid.innerHTML = "";
    data.events.slice(0, 6).forEach(e => {
      const first = e.cover?.[0] || e.images?.[0] || "1";
      const src = `${data.imagesBase}/${e.folder}/${first}.${data.imageExt}`;

      const art = el("article", "card pad");
      art.innerHTML = `
        <div class="activity-card">
          <img class="thumb" src="${src}" alt="${e.title}">
          <div class="activity-meta">
            <h4>${e.title}</h4>
            <div class="meta-row">
              <span class="cap">${new Date(e.date).toLocaleDateString()}</span>
            </div>
          </div>
        </div>`;
      grid.appendChild(art);
    });
  }

  /* Project groups */
  seedStream("#p-therapy-img", "#p-therapy-list", data, ["yoga", "wellness"]);
  seedStream("#p-med-img", "#p-med-list", data, ["health", "screening"]);
  seedStream("#p-comm-img", "#p-comm-list", data, ["community", "students"]);
  seedStream("#p-fest-img", "#p-fest-list", data, ["festival", "onam"]);

  /* Daily delight */
  populateDailyDelight(data);

  /* Preload images */
  const urls = gatherAssetUrls([
    qs("#sneh-img")?.src,
    "images/banner-small.jpg"
  ]);

  await preloadImages(urls, { onProgress: p => setSplashProgress(p) });

  const elapsed = Date.now() - start;
  if (elapsed < minShow) await new Promise(r => setTimeout(r, minShow - elapsed));

  hideSplash();
}

boot();

/* ---------- FORCE-OPEN CELEBRATION WIDGET (appended) ----------
   Ensures badge is visible and modal opens when <body data-celebration="on">
   Runs after window.load so splash and layout have settled.
-------------------------------------------------------------- */
(function(){
  'use strict';

  function safeEl(id){ try { return document.getElementById(id); } catch(e){ return null; } }

  function ensureBadgeVisible(badge){
    if(!badge) return;
    // if inline style was used to hide, remove it
    try { if (badge.style && badge.style.display === 'none') badge.style.display = ''; } catch(e){}
    // remove hidden class if any
    badge.classList && badge.classList.remove('hidden');
  }

  function openCelebrationModal(root, modal){
    if(!root || !modal) return;
    try {
      root.classList.add('open');
      root.setAttribute('aria-hidden','false');
      modal.style.display = 'flex';
      // prefer focusing close button when available
      const closeBtn = root.querySelector('#cw-close');
      if(closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
    } catch(e){ console.warn('openCelebrationModal failed', e); }
  }

  // Run after full load so splash and layout settled.
  window.addEventListener('load', function(){
    try {
      const bodyToggle = (document.body && document.body.dataset && document.body.dataset.celebration) || '';
      const shouldForceOpen = String(bodyToggle).toLowerCase() === 'on';

      const root = safeEl('celebration-widget-root');
      const modal = root && root.querySelector('.cw-modal');
      const badge = safeEl('cw-countdown-badge');

      // Always make badge visible if widget exists and toggle is on (or root already intends to show)
      if(badge) ensureBadgeVisible(badge);

      // If body explicitly requests on, open after a short tick (let splash hide)
      if(shouldForceOpen && root){
        // try to update background from data-after-bg if present (helps avoid white flash)
        try {
          const afterBg = root.dataset && (root.dataset.afterBg || root.getAttribute('data-after-bg'));
          const bgEl = safeEl('cw-bg');
          if(bgEl && afterBg) bgEl.style.backgroundImage = `url('${afterBg}')`;
        } catch(e){}

        // open slightly after load to avoid race with splash removal (60–120ms)
        setTimeout(() => {
          ensureBadgeVisible(badge);
          openCelebrationModal(root, modal);
        }, 90);
      }

      // Expose manual helper for debugging/test from console:
      try {
        window.openCelebration = function(){
          ensureBadgeVisible(safeEl('cw-countdown-badge'));
          openCelebrationModal(safeEl('celebration-widget-root'), safeEl('celebration-widget-root')?.querySelector('.cw-modal'));
          // try to start confetti if your celebration script exposes a function
          try { safeEl('celebration-widget-root')?.celebrationTest && safeEl('celebration-widget-root').celebrationTest(); } catch(e){}
        };
      } catch(e){}

    } catch (e) {
      console.warn('celebration force-open init failed', e);
    }
  }, { passive: true });
})();
