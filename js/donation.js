// /js/donation.js
// Simple slideshow: rotates images in #donate-hero .dslide

(function(){
  const slides = Array.from(document.querySelectorAll('#donate-hero .dslide'));
  if(!slides.length) return;

  let idx = 0;
  let timer = null;
  const show = i => {
    slides.forEach((s, j) => s.classList.toggle('show', j === i));
  };

  const start = () => {
    show(idx);
    timer = setInterval(() => {
      idx = (idx + 1) % slides.length;
      show(idx);
    }, 4500);
  };

  // Pause on hover, resume on leave
  const hero = document.getElementById('donate-hero');
  hero.addEventListener('mouseenter', () => { if(timer) clearInterval(timer); });
  hero.addEventListener('mouseleave', () => { start(); });

  // init
  start();

  // accessibility: ensure all imgs have alt
  slides.forEach(s => {
    const img = s.querySelector('img');
    if(img && !img.alt) img.alt = 'Karunya';
  });
})();
