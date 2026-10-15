/* Mapas mentales / diagramas en Commander (estilo Claude).
 * Toma los bloques ```mermaid del markdown del asistente y los renderiza como diagrama,
 * con barra de herramientas: ampliar (modal con zoom) + exportar PNG/SVG.
 * Requiere mermaid (CDN) ya inicializado en commander.html. securityLevel:'strict'. */
(function () {
  let counter = 0;

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportSVG(svgEl) {
    const xml = new XMLSerializer().serializeToString(svgEl);
    downloadBlob(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }), 'ciphra-diagrama.svg');
  }

  function exportPNG(svgEl) {
    const xml = new XMLSerializer().serializeToString(svgEl);
    const rect = svgEl.getBoundingClientRect();
    let w = rect.width || 800, h = rect.height || 600;
    try { // preferir el viewBox para resolución nítida
      const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      if (vb && vb.width) { w = vb.width; h = vb.height; }
    } catch (e) {}
    const scale = 2;
    const img = new Image();
    const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0b0b0e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => b && downloadBlob(b, 'ciphra-diagrama.png'), 'image/png');
    };
    img.onerror = () => alert('No se pudo exportar a PNG. Probá SVG.');
    img.src = svg64;
  }

  // Modal de zoom (pan con drag, zoom con rueda)
  function openZoom(svgMarkup) {
    let modal = document.getElementById('diagram-zoom');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'diagram-zoom';
    modal.className = 'diagram-zoom';
    modal.innerHTML = `
      <button class="dz-close" aria-label="Cerrar"><i data-lucide="x"></i></button>
      <div class="dz-stage" id="dz-stage"><div class="dz-inner" id="dz-inner">${svgMarkup}</div></div>
      <div class="dz-hint">Rueda: zoom · Arrastrar: mover · Esc: cerrar</div>`;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();

    const inner = modal.querySelector('#dz-inner');
    let scale = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0;
    const apply = () => { inner.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
    const stage = modal.querySelector('#dz-stage');
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      scale = Math.min(5, Math.max(0.3, scale * (e.deltaY < 0 ? 1.12 : 0.89)));
      apply();
    }, { passive: false });
    stage.addEventListener('pointerdown', (e) => { dragging = true; sx = e.clientX - tx; sy = e.clientY - ty; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', (e) => { if (dragging) { tx = e.clientX - sx; ty = e.clientY - sy; apply(); } });
    stage.addEventListener('pointerup', () => dragging = false);

    const close = () => modal.remove();
    modal.querySelector('.dz-close').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  }

  function buildToolbar(getSvg) {
    const bar = document.createElement('div');
    bar.className = 'diagram-toolbar';
    bar.innerHTML = `
      <button class="dgm-btn" data-act="zoom" title="Ampliar"><i data-lucide="maximize-2"></i><span>Ampliar</span></button>
      <button class="dgm-btn" data-act="png" title="Descargar PNG"><i data-lucide="image"></i><span>PNG</span></button>
      <button class="dgm-btn" data-act="svg" title="Descargar SVG"><i data-lucide="download"></i><span>SVG</span></button>`;
    bar.querySelector('[data-act="zoom"]').onclick = () => { const s = getSvg(); if (s) openZoom(s.outerHTML); };
    bar.querySelector('[data-act="png"]').onclick = () => { const s = getSvg(); if (s) exportPNG(s); };
    bar.querySelector('[data-act="svg"]').onclick = () => { const s = getSvg(); if (s) exportSVG(s); };
    return bar;
  }

  // Punto de entrada: busca bloques mermaid dentro de `scope` y los renderiza.
  window.renderDiagrams = async function (scope) {
    if (!window.mermaid || !scope) return;
    const blocks = scope.querySelectorAll('code.language-mermaid, pre code.language-mermaid');
    for (const code of blocks) {
      const pre = code.closest('pre') || code;
      const src = code.textContent.trim();
      if (!src) continue;
      const host = document.createElement('div');
      host.className = 'diagram-block';
      try {
        const id = 'mmd-' + Date.now() + '-' + (counter++);
        const { svg } = await mermaid.render(id, src);
        const canvas = document.createElement('div');
        canvas.className = 'diagram-canvas';
        canvas.innerHTML = svg;
        const getSvg = () => canvas.querySelector('svg');
        host.appendChild(buildToolbar(getSvg));
        host.appendChild(canvas);
        pre.replaceWith(host);
        if (window.lucide) lucide.createIcons();
      } catch (e) {
        // Si el diagrama está mal formado, dejamos el código visible con un aviso.
        console.warn('Mermaid render error:', e);
        const note = document.createElement('div');
        note.className = 'diagram-error';
        note.textContent = 'No se pudo dibujar el diagrama (sintaxis inválida).';
        pre.parentNode && pre.parentNode.insertBefore(note, pre);
      }
    }
  };
})();
