/* CardNav — port vanilla JS del componente de reactbits.dev (originalmente React + GSAP).
 * Mantiene la misma animación: el nav se expande en alto y las cards entran con stagger.
 * Requiere GSAP (cargado por CDN antes de este script). Degrada con un fallback CSS si no está.
 *
 * Estructura esperada en el HTML:
 *   #nav.card-nav-container > nav.card-nav > .card-nav-top (.hamburger-menu#cn-hamburger)
 *                                          > .card-nav-content > .nav-card[]
 */
(function () {
  function initCardNav() {
    const navEl = document.getElementById('cardNav');
    const hamburger = document.getElementById('cn-hamburger');
    if (!navEl || !hamburger) return;

    const cards = Array.from(navEl.querySelectorAll('.nav-card'));
    const content = navEl.querySelector('.card-nav-content');
    const ease = 'power3.out';
    let isExpanded = false;
    let tl = null;
    const hasGsap = typeof window.gsap !== 'undefined';

    // Alto objetivo: en desktop fijo (260), en mobile se mide el contenido real.
    function calculateHeight() {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (isMobile && content) {
        // Medir el contenido haciéndolo visible temporalmente (sin que se vea el salto).
        const prev = {
          v: content.style.visibility, p: content.style.pointerEvents,
          pos: content.style.position, h: content.style.height,
        };
        content.style.visibility = 'visible';
        content.style.pointerEvents = 'auto';
        content.style.position = 'static';
        content.style.height = 'auto';
        void content.offsetHeight; // forzar reflow
        const total = 60 + content.scrollHeight + 16; // topbar + contenido + padding
        content.style.visibility = prev.v;
        content.style.pointerEvents = prev.p;
        content.style.position = prev.pos;
        content.style.height = prev.h;
        return total;
      }
      return 260;
    }

    function buildTimeline() {
      if (!hasGsap) return null;
      gsap.set(navEl, { height: 60, overflow: 'hidden' });
      gsap.set(cards, { y: 50, opacity: 0 });
      const t = gsap.timeline({ paused: true });
      t.to(navEl, { height: calculateHeight, duration: 0.4, ease });
      t.to(cards, { y: 0, opacity: 1, duration: 0.4, ease, stagger: 0.08 }, '-=0.1');
      return t;
    }

    tl = buildTimeline();
    // Colapsado: overflow visible para que el dropdown del user-pill NO se recorte.
    // (Las cards igual quedan ocultas por visibility:hidden de .card-nav-content.)
    navEl.style.overflow = 'visible';

    function open() {
      isExpanded = true;
      hamburger.classList.add('open');
      navEl.classList.add('open');
      navEl.style.overflow = 'hidden'; // durante la expansión, recortar
      hamburger.setAttribute('aria-expanded', 'true');
      hamburger.setAttribute('aria-label', 'Cerrar menú');
      if (tl) { tl.play(0); }
    }

    function close() {
      isExpanded = false;
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', 'Abrir menú');
      if (tl) {
        tl.eventCallback('onReverseComplete', () => {
          navEl.classList.remove('open');
          navEl.style.overflow = 'visible'; // re-permitir el dropdown
        });
        tl.reverse();
      } else {
        navEl.classList.remove('open');
        navEl.style.overflow = 'visible';
      }
    }

    function toggle() { isExpanded ? close() : open(); }

    hamburger.addEventListener('click', toggle);
    hamburger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });

    // Cerrar al elegir un link dentro de las cards.
    navEl.querySelectorAll('.nav-card-link').forEach((a) => {
      a.addEventListener('click', () => { if (isExpanded) close(); });
    });

    // Cerrar al click fuera del nav.
    document.addEventListener('click', (e) => {
      if (isExpanded && !navEl.contains(e.target)) close();
    });

    // Recalcular en resize (rehace la timeline manteniendo el estado).
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (!hasGsap) return;
        const wasOpen = isExpanded;
        if (tl) tl.kill();
        tl = buildTimeline();
        if (tl && wasOpen) { tl.progress(1); navEl.style.overflow = 'hidden'; }
        else { navEl.style.overflow = 'visible'; }
      }, 150);
    });

    if (window.lucide) lucide.createIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCardNav);
  } else {
    initCardNav();
  }
})();
