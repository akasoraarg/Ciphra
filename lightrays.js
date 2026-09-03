/* LightRays — port vanilla de reactbits.dev a WebGL PURO (sin la dependencia `ogl`).
 * Mismo shader que el original. Se monta en #lightRays como fondo, detrás del ColorBends.
 * Config en CONFIG (abajo). Respeta prefers-reduced-motion y pausa con la pestaña oculta. */
(function () {
  const CONFIG = {
    raysOrigin: 'top-center',   // top-center|top-left|top-right|left|right|bottom-*
    raysColor: '#FBBF24',       // gold de Ciphra
    raysSpeed: 0.8,
    lightSpread: 0.9,
    rayLength: 1.3,
    pulsating: false,
    fadeDistance: 1.0,
    saturation: 0.7,
    followMouse: true,
    mouseInfluence: 0.12,
    noiseAmount: 0.08,
    distortion: 0.04,
  };

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
  }

  function getAnchorAndDir(origin, w, h) {
    const o = 0.2;
    switch (origin) {
      case 'top-left': return { anchor: [0, -o * h], dir: [0, 1] };
      case 'top-right': return { anchor: [w, -o * h], dir: [0, 1] };
      case 'left': return { anchor: [-o * w, 0.5 * h], dir: [1, 0] };
      case 'right': return { anchor: [(1 + o) * w, 0.5 * h], dir: [-1, 0] };
      case 'bottom-left': return { anchor: [0, (1 + o) * h], dir: [0, -1] };
      case 'bottom-center': return { anchor: [0.5 * w, (1 + o) * h], dir: [0, -1] };
      case 'bottom-right': return { anchor: [w, (1 + o) * h], dir: [0, -1] };
      default: return { anchor: [0.5 * w, -o * h], dir: [0, 1] }; // top-center
    }
  }

  const VERT = `
attribute vec2 position;
void main(){ gl_Position = vec4(position, 0.0, 1.0); }`;

  const FRAG = `precision highp float;
uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;

float noise(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed){
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);
  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));
  float distance = length(sourceToCoord);
  float maxDistance = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
  float fadeFalloff = clamp((iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance), 0.5, 1.0);
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;
  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)),
    0.0, 1.0);
  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
  vec2 finalRayDir = rayDir;
  if (mouseInfluence > 0.0){
    vec2 mouseScreenPos = mousePos * iResolution.xy;
    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
  }
  vec4 rays1 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
  vec4 rays2 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed);
  fragColor = rays1 * 0.5 + rays2 * 0.4;
  if (noiseAmount > 0.0){
    float n = noise(coord * 0.01 + iTime * 0.1);
    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
  }
  float brightness = 1.0 - (coord.y / iResolution.y);
  fragColor.x *= 0.1 + brightness * 0.8;
  fragColor.y *= 0.3 + brightness * 0.6;
  fragColor.z *= 0.5 + brightness * 0.5;
  if (saturation != 1.0){
    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
  }
  fragColor.rgb *= raysColor;
}

void main(){
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('LightRays shader error:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh); return null;
    }
    return sh;
  }

  function init() {
    const container = document.getElementById('lightRays');
    if (!container) return;
    if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches) return; // mobile: ahorrar GPU

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return; // sin WebGL: el fondo queda solo con ColorBends
    container.appendChild(canvas);

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('LightRays link error'); return; }
    gl.useProgram(prog);

    // Triángulo fullscreen
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const U = {};
    ['iTime','iResolution','rayPos','rayDir','raysColor','raysSpeed','lightSpread','rayLength',
     'pulsating','fadeDistance','saturation','mousePos','mouseInfluence','noiseAmount','distortion']
      .forEach(n => U[n] = gl.getUniformLocation(prog, n));

    // Uniforms estáticos
    gl.uniform3fv(U.raysColor, hexToRgb(CONFIG.raysColor));
    gl.uniform1f(U.raysSpeed, CONFIG.raysSpeed);
    gl.uniform1f(U.lightSpread, CONFIG.lightSpread);
    gl.uniform1f(U.rayLength, CONFIG.rayLength);
    gl.uniform1f(U.pulsating, CONFIG.pulsating ? 1 : 0);
    gl.uniform1f(U.fadeDistance, CONFIG.fadeDistance);
    gl.uniform1f(U.saturation, CONFIG.saturation);
    gl.uniform1f(U.mouseInfluence, CONFIG.mouseInfluence);
    gl.uniform1f(U.noiseAmount, CONFIG.noiseAmount);
    gl.uniform1f(U.distortion, CONFIG.distortion);

    let W = 1, H = 1;
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const r = dpr();
      const wCSS = container.clientWidth || window.innerWidth;
      const hCSS = container.clientHeight || window.innerHeight;
      W = Math.max(1, Math.floor(wCSS * r));
      H = Math.max(1, Math.floor(hCSS * r));
      canvas.width = W; canvas.height = H;
      gl.viewport(0, 0, W, H);
      gl.uniform2f(U.iResolution, W, H);
      const { anchor, dir } = getAnchorAndDir(CONFIG.raysOrigin, W, H);
      gl.uniform2f(U.rayPos, anchor[0], anchor[1]);
      gl.uniform2f(U.rayDir, dir[0], dir[1]);
    }
    resize();
    window.addEventListener('resize', resize);

    // Mouse (suavizado)
    const mouse = { x: 0.5, y: 0.5 }, smooth = { x: 0.5, y: 0.5 };
    if (CONFIG.followMouse) {
      window.addEventListener('mousemove', (e) => {
        const r = container.getBoundingClientRect();
        mouse.x = (e.clientX - r.left) / r.width;
        mouse.y = (e.clientY - r.top) / r.height;
      }, { passive: true });
    }

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = null, lastT = 0;
    const FRAME = 1000 / 30; // 30fps, suficiente para un fondo suave
    function loop(t) {
      raf = requestAnimationFrame(loop);
      if (t - lastT < FRAME) return;
      lastT = t;
      gl.uniform1f(U.iTime, reduce ? 0 : t * 0.001);
      if (CONFIG.followMouse && CONFIG.mouseInfluence > 0) {
        const s = 0.92;
        smooth.x = smooth.x * s + mouse.x * (1 - s);
        smooth.y = smooth.y * s + mouse.y * (1 - s);
        gl.uniform2f(U.mousePos, smooth.x, smooth.y);
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; } }
      else if (!raf) { raf = requestAnimationFrame(loop); }
    });
    raf = requestAnimationFrame(loop);
  }

  // Diferir hasta que el hilo esté libre (no traba la carga)
  function start() {
    if ('requestIdleCallback' in window) requestIdleCallback(init, { timeout: 1500 });
    else setTimeout(init, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
