// /js/activity.js
(function () {
  "use strict";

  const FALLBACK = window.__ACTIVITY_FALLBACK || '/mnt/data/events.json';
  const VISIBLE_COUNT = 6;
  const activityRoot = document.getElementById('activity-logs');
  const outlineRoot = document.getElementById('outline-list');
  const searchInput = document.getElementById('filter-search');
  const clearBtn = document.getElementById('clear-search');
  const splash = document.getElementById('splash');
  const lightbox = document.getElementById('lightbox');

  // scroll-spy state
  let _observer = null;
  let _linkMap = new Map(); // maps cardId (without "log-") -> outline link element

  function el(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    for (const k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k === 'html') n.innerHTML = props[k];
      else n.setAttribute(k, props[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (!c) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function safeId(s){
    return 'h-' + String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g,'');
  }

  function formatDate(iso){
    try {
      return new Date(iso).toLocaleDateString('en-GB',{
        day:'2-digit',month:'short',year:'numeric'
      });
    } catch {
      return iso||'';
    }
  }

  /* ---------- lightbox ---------- */
  function openLightbox(src, alt, caption){
    if (!lightbox) return;
    const img = lightbox.querySelector('.lightbox-img');
    const cap = lightbox.querySelector('.lightbox-caption');
    if (img) {
      img.src = src;
      img.alt = alt || '';
    }
    if (cap) cap.textContent = caption || '';
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden','false');
  }

  function closeLightbox(){
    if (!lightbox) return;
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden','true');
    const img = lightbox.querySelector('.lightbox-img');
    if (img) img.src = '';
  }

  if (lightbox) {
    lightbox.addEventListener('click', (e)=> {
      if (e.target.closest('[data-action="close"]') || e.target === lightbox) {
        closeLightbox();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  /* ---------- images ---------- */
  function normalizeImages(ev){
    if (!ev) return [];
    if (Array.isArray(ev.images) && ev.images.length) return ev.images.slice();
    if (Number(ev.imageCount) > 0)
      return Array.from({length:Number(ev.imageCount)},(_,i)=>i+1);
    return [1,2,3];
  }

  function imgPath(folder,name){
    if (!name) return '';
    const s = String(name).trim();
    if (s.startsWith('http') || s.includes('/')) return s;
    const trimmedFolder = (folder||'').toString().trim();
    if (trimmedFolder)
      return `images/Events/${trimmedFolder}/${s}${/\.[a-z0-9]{1,6}$/i.test(s)?'':'.jpg'}`;
    return `images/${s}${/\.[a-z0-9]{1,6}$/i.test(s)?'':'.jpg'}`;
  }

  /* ---------- season helpers ---------- */
  function monthToSeason(monthIndex){
    if ([11,0,1].includes(monthIndex)) return 'winter';
    if ([2,3].includes(monthIndex)) return 'pre';
    if (monthIndex === 4) return 'hot';
    if ([5,6,7,8].includes(monthIndex)) return 'monsoon';
    if ([9,10].includes(monthIndex)) return 'postmon';
    return 'cool';
  }

  const SEASON_DOODLE = {
    winter: '❄️',
    pre:    '🌸',
    hot:    '☀️',
    monsoon:'🌧️',
    postmon:'🍂',
    cool:   '🌬️'
  };

  const SEASON_STRIP = {
    winter: 'linear-gradient(180deg, #6fb8ff 0%, #d7f0ff 50%, #ffffff 100%)',
    pre:    'linear-gradient(180deg, #ffd6f0 0%, #fff1fb 50%, #fff 100%)',
    hot:    'linear-gradient(180deg, #ffd89b 0%, #fff3e0 50%, #fff 100%)',
    monsoon:'linear-gradient(180deg, #a7f3d0 0%, #e6fbf2 50%, #ffffff 100%)',
    postmon:'linear-gradient(180deg, #eaffd9 0%, #f7fff0 50%, #ffffff 100%)',
    cool:   'linear-gradient(180deg, #dfe9ff 0%, #f7fbff 50%, #ffffff 100%)'
  };

  /* ---------- text helpers (dedupe) ---------- */
  function normalizeTextSimple(s){
    if (!s) return '';
    return String(s).toLowerCase().replace(/[^a-z0-9\u0d00-\u0d7f\s]/g,'').replace(/\s+/g,' ').trim();
  }
  function isEffectivelySame(a,b){
    const A = normalizeTextSimple(a);
    const B = normalizeTextSimple(b);
    if (!A || !B) return false;
    if (A === B) return true;
    if (A.includes(B) || B.includes(A)) return true;
    const at = A.split(' ').filter(Boolean);
    const bt = B.split(' ').filter(Boolean);
    const setB = new Set(bt);
    let common = 0; at.forEach(t=>{ if (setB.has(t)) common++; });
    const denom = Math.min(at.length || 1, bt.length || 1);
    return (common / denom) >= 0.6;
  }

  /* ---------- video helpers ----------
     robust YouTube id extraction and normalization.
  */
  function extractYouTubeId(s){
    if (!s) return null;
    const str = String(s).trim();
    // common patterns:
    // https://www.youtube.com/watch?v=VIDEOID
    // https://youtu.be/VIDEOID
    // https://www.youtube.com/embed/VIDEOID
    // VIDEOID (plain)
    const re = /(?:v=|\/embed\/|youtu\.be\/|\/v\/|\/watch\?v=)([A-Za-z0-9_-]{6,})/i;
    const m = (str.match(re) || [])[1];
    if (m) return m;
    // if the input is just an id-like string (11 chars common for YT ids)
    const plain = (str.match(/^[A-Za-z0-9_-]{6,}$/) || [])[0];
    return plain || null;
  }

  /* ---------- normalize videos ----------
     Accepts events that use:
       - videoId (string)
       - videoUrl (string)
       - videoLinks (array of strings or objects {id,url})
     Returns: array of normalized entries {id, url}
  */
  function normalizeVideoEntries(ev){
    const out = [];

    // helper to push a normalized entry
    function pushEntry(entry){
      if (!entry) return;
      if (typeof entry === 'string') {
        const s = entry.trim();
        const y = extractYouTubeId(s);
        if (y) {
          out.push({ id: y, url: `https://www.youtube.com/embed/${y}?rel=0` });
        } else {
          // not a YouTube id or url we understand; store raw url
          out.push({ id: null, url: s });
        }
        return;
      }
      if (typeof entry === 'object') {
        const id = entry.id ? String(entry.id).trim() : null;
        const url = entry.url ? String(entry.url).trim() : null;
        if (id) {
          // if id looks like a YT id, produce embed url
          const y = extractYouTubeId(id) || id;
          out.push({ id: y, url: url || `https://www.youtube.com/embed/${y}?rel=0` });
        } else if (url) {
          const y = extractYouTubeId(url);
          if (y) out.push({ id: y, url: `https://www.youtube.com/embed/${y}?rel=0` });
          else out.push({ id: null, url });
        }
      }
    }

    // if explicit videoLinks array present
    if (Array.isArray(ev.videoLinks) && ev.videoLinks.length) {
      ev.videoLinks.forEach(entry => pushEntry(entry));
    }

    // fallback: single videoId / videoUrl
    if (!out.length) {
      if (ev.videoId) pushEntry(ev.videoId);
      if (ev.videoUrl) pushEntry(ev.videoUrl);
    }

    // ensure unique by url if duplicates exist
    const seen = new Set();
    const uniq = [];
    out.forEach(o=>{
      const key = (o.url || '') + '|' + (o.id || '');
      if (!seen.has(key)) { seen.add(key); uniq.push(o); }
    });

    return uniq;
  }

  /* ---------- card (keep side-strip) ---------- */
  function createCard(ev, idx){
    const rawId = ev.id || `evt-${idx}`;
    const id = safeId(rawId);
    const card = el('article',{class:'card', id:`log-${id}`, role:'listitem'});

    /* deduce season from event date (for side-strip only) */
    let season = 'cool';
    try {
      const d = new Date(ev.date || '');
      if (!isNaN(d)) season = monthToSeason(d.getMonth());
    } catch (e) { /* ignore */ }

    if (SEASON_STRIP[season]) {
      card.style.setProperty('--side-grad', SEASON_STRIP[season]);
    }

    /* header */
    const header = el('div',{class:'card-header'});

    const iconName = (ev.icon || 'icon.jpg').toString().trim();
    const folderName = (ev.folder || '').toString().trim();
    const icon = el('img',{
      src: imgPath(folderName, iconName),
      alt: (ev.title || ev.title_ml || 'event') + ' icon',
      loading: 'lazy',
      width: 58,
      height: 58
    });
    icon.addEventListener('error', function onErr(){
      icon.removeEventListener('error', onErr);
      icon.src = 'images/fevicon-logo/Logo-Karunya.png';
    });

    header.appendChild(icon);

    const meta = el('div');

    meta.appendChild(el('div',{class:'card-title-ml', text: ev.title_ml || ''}));
    meta.appendChild(el('div',{class:'card-title-en', text: ev.title || ''}));

    const lines = [];
    const dateTxt = formatDate(ev.date);
    if (dateTxt) lines.push(dateTxt);

    const organizerMl = (ev.organizer_ml || '').toString().trim();
    const organizerEn = (ev.organizer || '').toString().trim();
    const titleMl = (ev.title_ml || '').toString().trim();
    const titleEn = (ev.title || '').toString().trim();

    function pushIfUnique(text){
      if (!text) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const last = lines.length ? lines[lines.length-1].trim() : '';
      if (trimmed === last) return;
      if (isEffectivelySame(trimmed, titleMl) || isEffectivelySame(trimmed, titleEn)) return;
      for (let l of lines) if (isEffectivelySame(trimmed, l)) return;
      lines.push(trimmed);
    }

    pushIfUnique(organizerMl);
    pushIfUnique(organizerEn);

    const subHtml = lines.map(l => `<div>${escapeHtml(l)}</div>`).join('');
    meta.appendChild(el('div',{class:'card-sub', html: subHtml}));

    header.appendChild(meta);
    card.appendChild(header);

    /* summary */
    const summary = el('div',{class:'card-summary'});
    if (ev.summary_ml) summary.appendChild(el('p',{class:'font-malayalam', text: ev.summary_ml}));
    if (ev.summary) summary.appendChild(el('p',{text: ev.summary}));
    card.appendChild(summary);

    /* gallery */
    const gallery = el('div',{class:'gallery'});
    const imgs = normalizeImages(ev);

    imgs.forEach((n,i)=>{
      const wrap = el('div', { class: i < VISIBLE_COUNT ? '' : 'extra', 'data-index': i });
      const img = el('img', {
        src: imgPath(ev.folder, n),
        alt: `${ev.title||ev.title_ml} ${i+1}`,
        loading:'lazy'
      });
      img.addEventListener('click', (e)=> {
        e.preventDefault();
        openLightbox(img.src, img.alt, img.alt);
      });
      wrap.appendChild(img);
      gallery.appendChild(wrap);
    });

    card.appendChild(gallery);

    /* show more toggle */
    if (imgs.length > VISIBLE_COUNT) {
      const toggle = el('button', {
        class:'show-toggle',
        type:'button',
        'aria-expanded':'false',
        text:'Show more'
      });

      toggle.addEventListener('click', ()=>{
        const expanded = gallery.classList.contains('expanded');

        if (expanded) {
          gallery.classList.remove('expanded');
          toggle.setAttribute('aria-expanded','false');
          toggle.textContent = 'Show more';
        } else {
          gallery.classList.add('expanded');
          toggle.setAttribute('aria-expanded','true');
          toggle.textContent = 'Show less';
        }
      });

      card.appendChild(toggle);
    }

    /* ---------- video: poster + lazy iframe; supports multiple videoLinks ---------- */
    (function attachVideoBlock(){
      const entries = normalizeVideoEntries(ev);
      if (!entries || !entries.length) return;

      // Use the first entry as the default video shown initially
      let currentIndex = 0;

      function makePosterForEntry(entry){
        // Use YouTube thumbnail if id present
        if (entry && entry.id) {
          return `https://i.ytimg.com/vi/${entry.id}/maxresdefault.jpg`;
        }
        return '';
      }

      function makeEmbedForEntry(entry){
        if (!entry) return '';
        // prefer explicit id -> embed
        if (entry.id) return `https://www.youtube.com/embed/${entry.id}?rel=0`;
        // try to extract id from url if possible
        const y = extractYouTubeId(entry.url);
        if (y) return `https://www.youtube.com/embed/${y}?rel=0`;
        // otherwise return the raw url (may be an embed already or external)
        return entry.url || '';
      }

      // Build video markup
      const vwrap = el('div',{class:'video-wrap', role:'region', 'aria-label':'Event video'});
      const aspect = el('div',{class:'video-aspect'});
      vwrap.appendChild(aspect);

      // poster element
      const firstEntry = entries[0];
      const posterUrl = makePosterForEntry(firstEntry) || '';
      const posterImg = el('img',{class:'video-poster', src: posterUrl || '', alt: ev.title || ev.title_ml || 'Event video poster', tabindex:0});
      if (!posterUrl) posterImg.setAttribute('src','');

      // play button (SVG)
      const play = el('button',{class:'video-play', type:'button', title:'Play video', 'aria-label':'Play video'});
      play.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';

      // caption (optional)
      const caption = el('div',{class:'video-caption', text: ev.organizer || ''});

      aspect.appendChild(posterImg);
      aspect.appendChild(play);
      vwrap.appendChild(caption);

      // If there are multiple videos, create a small controls bar
      let controlsBar = null;
      if (entries.length > 1) {
        controlsBar = el('div',{class:'video-controls', role:'tablist'});
        entries.forEach((entry, idx) => {
          const btn = el('button',{type:'button', class:'video-select', 'data-vid-index': idx, text: `Video ${idx+1}`});
          btn.addEventListener('click', (e)=>{
            e.preventDefault();
            if (currentIndex === idx) return;
            currentIndex = idx;
            // update poster and (if iframe already loaded) replace iframe
            const newEntry = entries[currentIndex];
            const newPoster = makePosterForEntry(newEntry);
            posterImg.src = newPoster || '';
            // if an iframe exists, replace with the new embed
            const existingIframe = aspect.querySelector('iframe.video-iframe');
            if (existingIframe) {
              const embed = makeEmbedForEntry(newEntry);
              if (embed) {
                existingIframe.src = embed + (embed.includes('?') ? '&autoplay=1' : '?autoplay=1');
              } else {
                existingIframe.src = newEntry.url || '';
              }
            }
            // update selected state on controls
            if (controlsBar) {
              Array.from(controlsBar.querySelectorAll('.video-select')).forEach(b=>{
                b.classList.remove('active');
                b.setAttribute('aria-pressed','false');
              });
              btn.classList.add('active');
              btn.setAttribute('aria-pressed','true');
            }
          });
          // mark first as active
          if (idx === 0) {
            btn.classList.add('active');
            btn.setAttribute('aria-pressed','true');
          } else {
            btn.setAttribute('aria-pressed','false');
          }
          controlsBar.appendChild(btn);
        });
        vwrap.appendChild(controlsBar);
      }

      // When clicked or activated, replace poster with iframe for currentIndex
      function loadIframe(){
        const entry = entries[currentIndex];
        if (!entry) return;
        const embedUrl = makeEmbedForEntry(entry) || entry.url || '';
        aspect.innerHTML = '';
        if (!embedUrl) {
          // fallback: if there's a raw url, place iframe with it
          const iframe = el('iframe',{class:'video-iframe', src: entry.url || '', frameborder:0, allow:'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture', allowfullscreen:true});
          aspect.appendChild(iframe);
          return;
        }
        const iframe = el('iframe',{
          class:'video-iframe',
          src: embedUrl + (embedUrl.includes('?') ? '&autoplay=1' : '?autoplay=1'),
          frameborder: '0',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: 'true'
        });
        aspect.appendChild(iframe);

        // also re-add the controls (if any) so user can switch while iframe is open
        if (controlsBar) vwrap.appendChild(controlsBar);
      }

      // click handlers
      play.addEventListener('click', (e)=> {
        e.preventDefault();
        loadIframe();
      });
      posterImg.addEventListener('click', (e)=> {
        e.preventDefault();
        loadIframe();
      });
      // keyboard activation for poster (Enter / Space)
      posterImg.addEventListener('keydown', (e)=> {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          loadIframe();
        }
      });

      // graceful fallback: if poster fails to load, try hqdefault
      posterImg.addEventListener('error', function onPosterErr(){
        posterImg.removeEventListener('error', onPosterErr);
        try {
          const entry = entries[currentIndex];
          if (entry && entry.id) {
            posterImg.src = `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
          } else {
            posterImg.src = '';
          }
        } catch (e) {
          posterImg.src = '';
        }
      });

      // append to card after gallery (so markup order is predictable)
      card.appendChild(vwrap);
    })();

    return card;
  }

  /* escape HTML to avoid injecting raw content into innerHTML */
  function escapeHtml(str){
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- scroll-spy (IntersectionObserver) ---------- */

  function initScrollSpy(){
    // clean previous observer if any
    if (_observer) {
      _observer.disconnect();
      _observer = null;
      _linkMap.clear();
    }

    // build map: cardId (without 'log-') -> outline-link
    document.querySelectorAll('.outline-link').forEach(link=>{
      const href = link.getAttribute('href') || '';
      // href like "#h-2025-11-24" or "#h-evt-1"
      const id = href.replace(/^#/, '');
      if (id) _linkMap.set(id, link);
    });

    // if no cards or no links, nothing to do
    const cards = Array.from(document.querySelectorAll('.card[id]'));
    if (!cards.length || !_linkMap.size) return;

    // IntersectionObserver options: focus on center of viewport
    const options = {
      root: null,
      rootMargin: '-40% 0% -40% 0%', // center region
      threshold: [0, 0.25, 0.5, 0.75, 1]
    };

    _observer = new IntersectionObserver(entries => {
      // find the entry with highest intersectionRatio that is intersecting
      let best = null;
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        if (!best || en.intersectionRatio > best.intersectionRatio) best = en;
      });

      if (best) {
        const elCard = best.target;
        // card id is like "log-h-2025-11-24"
        const cardId = elCard.id ? elCard.id.replace(/^log-/, '') : null;
        if (cardId) {
          setActiveLink(cardId);
        }
      } else {
        // when nothing intersects in this batch, attempt to pick the card closest to top
        // fallback: compute by bounding rects (choose card with smallest positive distance to top)
        let closest = null;
        let minDist = Infinity;
        cards.forEach(c => {
          const rect = c.getBoundingClientRect();
          const dist = Math.abs(rect.top - window.innerHeight * 0.25);
          if (dist < minDist) { minDist = dist; closest = c; }
        });
        if (closest) {
          const cid = closest.id ? closest.id.replace(/^log-/, '') : null;
          if (cid) setActiveLink(cid);
        }
      }
    }, options);

    // observe each card
    cards.forEach(c => _observer.observe(c));
  }

  function setActiveLink(cardId){
    // remove active from all
    document.querySelectorAll('.outline-link.active').forEach(x => x.classList.remove('active'));
    // find link in map
    const link = _linkMap.get(cardId);
    if (link) {
      link.classList.add('active');
      // also ensure the month group is visible in the outline (optional: this is just highlight)
      // if the outline has overflow, bring the active into view (scroll within outline)
      try {
        const outlineContainer = document.querySelector('.outline');
        if (outlineContainer) {
          const linkRect = link.getBoundingClientRect();
          const containerRect = outlineContainer.getBoundingClientRect();
          if (linkRect.top < containerRect.top || linkRect.bottom > containerRect.bottom) {
            // scroll the outline container so the active link is centered
            const offset = linkRect.top - containerRect.top - (containerRect.height / 2) + (linkRect.height / 2);
            outlineContainer.scrollBy({ top: offset, behavior: 'smooth' });
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  /* ---------- render / outline (add doodle to month block) ---------- */

  function renderAll(list){
    if (!activityRoot || !outlineRoot) return;
    activityRoot.innerHTML = '';
    outlineRoot.innerHTML = '';

    if (!Array.isArray(list) || !list.length) {
      activityRoot.appendChild(el('div',{class:'card', html:'<p>No events found.</p>'}));
      hideSplash();
      return;
    }

    list.forEach((ev,i)=> activityRoot.appendChild(createCard(ev,i)));

    const grouped = groupByMonth(list);

    grouped.forEach(mon => {
      const monthBlock = el('div',{class:'outline-item'});
      monthBlock.appendChild(el('div',{class:'outline-date', text: mon.label}));

      // determine season from month label (e.g. "November 2025")
      let monthName = '';
      const mMatch = (mon.label || '').match(/^(January|February|March|April|May|June|July|August|September|October|November|December)/i);
      if (mMatch) monthName = mMatch[1];
      const monthIndex = monthName ? ['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(
        monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase()
      ) : -1;
      const season = (monthIndex >= 0) ? monthToSeason(monthIndex) : 'cool';

      // add season class to month block for CSS hooks
      monthBlock.classList.add(`season-${season}`);

      // add timeline doodle element to the monthBlock (top-right decorative)
      const dood = el('span',{class:`timeline-doodle season-${season}`, text: SEASON_DOODLE[season] || ''});
      dood.setAttribute('aria-hidden','true');
      monthBlock.appendChild(dood);

      mon.dates.forEach(dobj=>{
        dobj.events.forEach(ev=>{
          const linkId = safeId(ev.id);
          const a = el('a',{class:'outline-link', href:`#${linkId}`});
          a.appendChild(el('div',{class:'outline-title-ml', text: ev.title_ml || ''}));
          a.appendChild(el('div',{class:'outline-title-en', text: ev.title || ''}));

          a.addEventListener('click',(e)=>{
            e.preventDefault();
            const target = document.getElementById(`log-${linkId}`);
            if (target) {
              // scroll to card; the scroll spy will update active class when intersection occurs
              target.scrollIntoView({behavior:'smooth', block:'start'});
              // also optimistically set the active link immediately for snappy feel
              document.querySelectorAll('.outline-link').forEach(x=>x.classList.remove('active'));
              a.classList.add('active');
            }
          });

          monthBlock.appendChild(a);
        });
      });

      outlineRoot.appendChild(monthBlock);
    });

    // after building outline, add month classes
    applyMonthClasses();

    // init scroll spy now that cards and links exist
    // small timeout to allow layout to stabilize
    setTimeout(()=> initScrollSpy(), 120);

    hideSplash();
  }

  function groupByMonth(list){
    const map = new Map();
    list.forEach(ev=>{
      const d = new Date(ev.date || '');
      const key = isNaN(d) ? 'unknown' :
        `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = isNaN(d) ? 'Unknown' :
        d.toLocaleString('en-GB',{month:'long',year:'numeric'});

      if (!map.has(key)) map.set(key,{label, dates:new Map()});
      const mm = map.get(key);
      const dateKey = ev.date || 'unknown';

      if (!mm.dates.has(dateKey)) mm.dates.set(dateKey, []);
      mm.dates.get(dateKey).push(ev);
    });

    return Array.from(map.entries())
      .sort((a,b)=>b[0].localeCompare(a[0]))
      .map(([k,v])=>({
        key:k, label:v.label,
        dates: Array.from(v.dates.entries())
                .sort((a,b)=>b[0].localeCompare(a[0]))
                .map(([d,evs])=>({date:d, events:evs}))
      }));
  }

  /* ---------- month classes for outline (Kerala seasonal palettes) ---------- */
  function applyMonthClasses(){
    const monthMap = {
      'January':   'month--winter',
      'February':  'month--winter',
      'March':     'month--pre',
      'April':     'month--pre',
      'May':       'month--hot',
      'June':      'month--monsoon',
      'July':      'month--monsoon',
      'August':    'month--monsoon',
      'September': 'month--monsoon',
      'October':   'month--postmon',
      'November':  'month--postmon',
      'December':  'month--cool'
    };

    const container = document.querySelector('.outline');
    if (!container) return;
    const dateNodes = Array.from(container.querySelectorAll('.outline-date'));
    dateNodes.forEach(node => {
      const text = (node.textContent || '').trim();
      const match = text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)/i);
      if (match) {
        const monthName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        const cls = monthMap[monthName];
        if (cls) {
          const wrapper = node.closest('.outline-item') || node;
          wrapper.classList.add(cls);
        }
      }
    });
  }

  /* ---------- fetch / boot ---------- */
  async function boot(){
    try {
      const r = await fetch(FALLBACK);
      if (!r.ok) throw new Error('fetch failed');

      const data = await r.json();
      const events = Array.isArray(data.events)
        ? data.events
        : (Array.isArray(data) ? data : []);

      const normalized = events.map((e,i)=>
        e.id ? e : Object.assign({id:`evt-${i}`}, e)
      );

      window._ACT_EVENTS = normalized;
      renderAll(normalized);

    } catch (e) {
      console.error('load failed', e);
      if (activityRoot) activityRoot.innerHTML = '<div class="card"><p>Unable to load events.</p></div>';
      hideSplash();
    }
  }

  function hideSplash(){
    if (splash) splash.style.display='none';
  }

  /* ---------- search ---------- */

  function applyFilter(){
    const q = (searchInput && searchInput.value || '')
                .trim().toLowerCase();
    const all = window._ACT_EVENTS || [];

    if (!q) {
      renderAll(all);
      return;
    }

    const filtered = all.filter(ev=>{
      const hay = `${ev.title||''} ${ev.title_ml||''}
                   ${ev.organizer||''} ${ev.organizer_ml||''}
                   ${ev.summary||''} ${ev.summary_ml||''}`
                   .toLowerCase();
      return hay.includes(q);
    });

    renderAll(filtered);
  }

  if (searchInput){
    searchInput.addEventListener('input', applyFilter);
  }
  if (clearBtn){
    clearBtn.addEventListener('click', ()=>{
      if (searchInput) searchInput.value='';
      applyFilter();
    });
  }

  document.addEventListener('DOMContentLoaded', boot);

})();
