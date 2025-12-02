/* Simplified js/about.js
   - Language toggle removed
   - Malayalam shown first, English shown below
   - Trustees alternate layout using .alt class
   - Safe: works even if #official-contact link is removed
*/

(function(){
  const JSON_PATH = 'about.json';
  const esc = s => String(s||'').replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // DOM references
  const orgSub = document.getElementById('org-sub');
  const orgDesc = document.getElementById('org-desc');
  const historyEl = document.getElementById('history-content');
  const infraEl = document.getElementById('infra-content');
  const govEl = document.getElementById('gov-info');
  const trusteesList = document.getElementById('trustees-list');
  const staffBubbles = document.getElementById('staff-bubbles');
  const contactList = document.getElementById('contact-list');
  const contactDesc = document.getElementById('contact-desc');
  const officialContact = document.getElementById('official-contact'); // may be null now
  const mapFrame = document.getElementById('map');
  const footerBrand = document.querySelector('.footer-left .brand-small');

  // Intersection observer for trustee animations
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      const el = e.target;
      if(e.isIntersecting){
        el.classList.add('in-view');
        el.classList.remove('off-left','off-right','off');
      } else {
        const r = el.getBoundingClientRect();
        if(r.top < 0) { el.classList.add('off-left'); el.classList.remove('off-right'); }
        else { el.classList.add('off-right'); el.classList.remove('off-left'); }
        el.classList.remove('in-view');
      }
    });
  }, {threshold: 0.24});

  fetch(JSON_PATH, {cache:'no-cache'})
  .then(r => r.json())
  .then(data=>{
    const org = data.organization || {};
    const contact = data.contact || {};
    const trustees = data.trustees || [];
    const staff = data.staff || [];
    const infra = data.history_and_affiliations || {};

    /* INTRO SECTION */
    orgSub.innerHTML = `
      <div>${esc(org.description_ml)}</div>
      <div style="margin-top:6px">${esc(org.description_en)}</div>
    `;

    orgDesc.innerHTML = `
      <div><strong>Mission:</strong> ${esc(org.mission_ml)}</div>
      <div>${esc(org.mission_en)}</div>
      <div style="margin-top:8px"><strong>Vision:</strong> ${esc(org.vision_ml)}</div>
      <div>${esc(org.vision_en)}</div>
    `;

    /* HISTORY */
    historyEl.innerHTML = `
      <div>${esc(org.origin_story_ml)}</div>
      <div style="margin-top:10px">${esc(org.origin_story_en)}</div>
    `;

    /* INFRA */
    infraEl.innerHTML = `
      <div>${esc(infra.infrastructure_ml)}</div>
      <div style="margin-top:12px">${esc(infra.infrastructure_en)}</div>
    `;

    /* GOV INFO */
    govEl.innerHTML = `
      <div>${esc(infra.government_approvals_ml)}</div>
      <div style="margin-top:10px">${esc(infra.government_approvals_en)}</div>
    `;

    /* TRUSTEES */
    const tintColors = [
      'var(--trustee-overlay-0)',
      'var(--trustee-overlay-1)',
      'var(--trustee-overlay-2)',
      'var(--trustee-overlay-3)',
      'var(--trustee-overlay-4)'
    ];

    trusteesList.innerHTML = '';

    trustees.forEach((t, idx)=>{
      const section = document.createElement('div');
      section.className = 'trustee-section off';

      if (idx % 2 === 1) section.classList.add('alt');

      const wall = document.createElement('div');
      wall.className = 'trustee-wall';
      wall.style.backgroundImage =
        `url("${t.photo || `https://picsum.photos/seed/trustee${idx}/900/1400`}")`;
      wall.style.setProperty('--trustee-overlay', tintColors[idx % tintColors.length]);

      const content = document.createElement('div');
      content.className = 'trustee-content';
      content.innerHTML = `
        <h3>${esc(t.name)}</h3>
        <div class="role">${esc(t.role)}</div>
        <div class="details">
          ${t.phone ? `<div><strong>Phone:</strong> ${esc(t.phone)}</div>` : ''}
          ${t.address ? `<div>${esc(t.address)}</div>` : ''}
          ${t.bio ? `<div style="margin-top:10px;color:var(--muted);font-size:15px">${esc(t.bio)}</div>` : ''}
        </div>
      `;

      section.appendChild(wall);
      section.appendChild(content);
      trusteesList.appendChild(section);

      io.observe(section);
    });

    /* STAFF */
    staffBubbles.innerHTML = '';
    staff.forEach((s,i)=>{
      const bub = document.createElement('div');
      bub.className = 'bubble';

      const imgDiv = document.createElement('div');
      imgDiv.className = 'bubble-img';
      imgDiv.style.backgroundImage =
        `url("https://picsum.photos/seed/staff${i}/300/300")`;

      const txt = document.createElement('div');
      txt.className = 'bubble-text';
      txt.innerHTML = `
        <div class="name">${esc(s.name)}</div>
        <div class="role">${esc(s.role)}</div>
      `;

      bub.appendChild(imgDiv);
      bub.appendChild(txt);
      staffBubbles.appendChild(bub);
    });

    /* CONTACT */
    contactList.innerHTML = '';
    if(contact.address) contactList.appendChild(li(`<strong>Address:</strong> ${esc(contact.address)}`));
    if(contact.email) contactList.appendChild(li(`<strong>Email:</strong> ${esc(contact.email)}`));
    if(contact.phone_primary) contactList.appendChild(li(`<strong>Phone (primary):</strong> ${esc(contact.phone_primary)}`));
    if(contact.phone_alt) contactList.appendChild(li(`<strong>Alternate:</strong> ${esc(contact.phone_alt)}`));
    if(contact.landline) contactList.appendChild(li(`<strong>Landline:</strong> ${esc(contact.landline)}`));
    if(contact.visiting_hours) contactList.appendChild(li(`<strong>Visiting hours:</strong> ${esc(contact.visiting_hours)}`));

    contactDesc.innerHTML = `
      <div>${esc(contact.note_ml)}</div>
      <div style="margin-top:6px">${esc(contact.note_en)}</div>
    `;

    /* SAFE FIX — this element may be removed */
    if (officialContact) {
      officialContact.href = contact.official_page || 'https://www.karunyagcc.in/contact-us';
    }

    /* MAP ALWAYS WORKS */
    if(contact.google_maps_embed){
      mapFrame.src = contact.google_maps_embed;
    }

    footerBrand.textContent = org.trust_name || org.name_en || org.name_ml;
  })
  .catch(err=>{
    console.error('Failed to load about.json', err);
  });

  function li(inner){
    const li=document.createElement('li');
    li.innerHTML = inner;
    return li;
  }

})();
