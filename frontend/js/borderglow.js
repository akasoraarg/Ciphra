/* BorderGlow — port vanilla JS de reactbits.dev. Auto-aplica el efecto a cualquier
 * elemento con [data-border-glow]. Config por data-attributes:
 *   data-bg-glow="43 96 58"          HSL del glow exterior ("H S L")
 *   data-bg-colors="#FBBF24,#14B8A6,#F472B6"   3 colores del mesh-gradient
 *   data-bg-bg="#0B0B0D"             color de fondo del card (para el borde)
 *   data-bg-outer                    (presencia) habilita el glow exterior (overflow visible)
 *   data-bg-radius / data-bg-sensitivity / data-bg-cone / data-bg-intensity (opcionales)
 */
(function () {
  function parseHSL(str) {
    const m = (str || '').match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
    if (!m) return { h: 40, s: 80, l: 80 };
    return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
  }

  function buildGlowVars(el, glowColor, intensity) {
    const { h, s, l } = parseHSL(glowColor);
    const base = `${h}deg ${s}% ${l}%`;
    const opacities = [100, 60, 50, 40, 30, 20, 10];
    const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
    for (let i = 0; i < opacities.length; i++) {
      el.style.setProperty(`--glow-color${keys[i]}`, `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`);
    }
  }

  const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
  const GRADIENT_KEYS = ['--gradient-one', '--gradient-two', '--gradient-three', '--gradient-four', '--gradient-five', '--gradient-six', '--gradient-seven'];
  const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

  function buildGradientVars(el, colors) {
    for (let i = 0; i < 7; i++) {
      const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
      el.style.setProperty(GRADIENT_KEYS[i], `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`);
    }
    el.style.setProperty('--gradient-base', `linear-gradient(${colors[0]} 0 100%)`);
  }

  function getCenter(el) {
    const r = el.getBoundingClientRect();
    return [r.width / 2, r.height / 2];
  }
  function edgeProximity(el, x, y) {
    const [cx, cy] = getCenter(el);
    const dx = x - cx, dy = y - cy;
    let kx = Infinity, ky = Infinity;
    if (dx !== 0) kx = cx / Math.abs(dx);
    if (dy !== 0) ky = cy / Math.abs(dy);
    return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
  }
  function cursorAngle(el, x, y) {
    const [cx, cy] = getCenter(el);
    const dx = x - cx, dy = y - cy;
    if (dx === 0 && dy === 0) return 0;
    let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    return deg;
  }

  function enhance(el) {
    if (el.dataset.bgReady === '1') return;
    el.dataset.bgReady = '1';

    const colors = (el.dataset.bgColors || '#c084fc,#f472b6,#38bdf8').split(',').map(s => s.trim());
    const glow = el.dataset.bgGlow || '40 80 80';
    const intensity = parseFloat(el.dataset.bgIntensity || '1');
    const radius = el.dataset.bgRadius;
    const sensitivity = el.dataset.bgSensitivity || '30';
    const cone = el.dataset.bgCone || '25';
    const glowPad = el.dataset.bgGlowRadius || '40';
    const hasOuter = el.hasAttribute('data-bg-outer');

    el.classList.add('bg-host');
    if (hasOuter) el.classList.add('bg-outer');
    el.style.setProperty('--edge-sensitivity', sensitivity);
    el.style.setProperty('--cone-spread', cone);
    el.style.setProperty('--glow-padding', `${glowPad}px`);
    if (radius) el.style.setProperty('--border-radius', `${radius}px`);
    if (el.dataset.bgBg) el.style.setProperty('--card-bg', el.dataset.bgBg);
    buildGlowVars(el, glow, intensity);
    buildGradientVars(el, colors);

    // Inyectar las capas (no usamos ::before/::after del host para no chocar)
    const border = document.createElement('span'); border.className = 'bg-layer bg-border';
    const fill = document.createElement('span'); fill.className = 'bg-layer bg-fill';
    el.prepend(fill);
    el.prepend(border);
    if (hasOuter) {
      const edge = document.createElement('span'); edge.className = 'bg-layer bg-edge';
      el.prepend(edge);
    }

    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      el.style.setProperty('--edge-proximity', (edgeProximity(el, x, y) * 100).toFixed(3));
      el.style.setProperty('--cursor-angle', cursorAngle(el, x, y).toFixed(3) + 'deg');
    });
  }

  function initAll() {
    document.querySelectorAll('[data-border-glow]').forEach(enhance);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();
})();
