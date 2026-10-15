/* Ciphra — banner de cookies (Aceptar / Rechazar). Se autoinyecta y recuerda la elección.
 * Depende de i18n.js para los textos (con fallback en español si no está cargado). */
(function () {
  const KEY = "ciphra_cookies"; // "accepted" | "rejected"
  if (localStorage.getItem(KEY)) return; // ya decidió: no mostrar

  const T = (k, fb) => (window.I18N && I18N.t(k)) || fb;

  function build() {
    if (document.getElementById("ci-cookie-banner")) return;
    const bar = document.createElement("div");
    bar.id = "ci-cookie-banner";
    bar.innerHTML = `
      <span class="ci-ck-text">${T("cookie.text", "Usamos cookies para mantener tu sesión activa y mejorar tu experiencia. Podés aceptar o rechazar las cookies no esenciales.")}
        <a href="privacidad.html" class="ci-ck-link">${T("cookie.more", "Saber más")}</a></span>
      <span class="ci-ck-actions">
        <button class="ci-ck-btn ghost" id="ci-ck-reject">${T("cookie.reject", "Rechazar")}</button>
        <button class="ci-ck-btn primary" id="ci-ck-accept">${T("cookie.accept", "Aceptar")}</button>
      </span>`;
    document.body.appendChild(bar);
    const close = (v) => { localStorage.setItem(KEY, v); bar.classList.add("hide");
      setTimeout(() => bar.remove(), 300); };
    document.getElementById("ci-ck-accept").onclick = () => close("accepted");
    document.getElementById("ci-ck-reject").onclick = () => close("rejected");
    requestAnimationFrame(() => bar.classList.add("show"));
  }

  // Re-render del texto si cambia el idioma mientras el banner está visible.
  window.addEventListener("i18n:change", () => {
    const b = document.getElementById("ci-cookie-banner");
    if (b) { b.remove(); build(); }
  });

  const css = document.createElement("style");
  css.textContent = `
    #ci-cookie-banner{position:fixed;left:50%;bottom:18px;transform:translateX(-50%) translateY(140%);
      z-index:9999;display:flex;align-items:center;gap:18px;flex-wrap:wrap;justify-content:center;
      max-width:min(720px,calc(100vw - 32px));background:#141418;color:#f1f1f1;
      border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:14px 18px;
      box-shadow:0 20px 50px -15px rgba(0,0,0,0.7);font-family:'Inter',system-ui,sans-serif;
      font-size:0.82rem;line-height:1.5;opacity:0;transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .35s;}
    #ci-cookie-banner.show{transform:translateX(-50%) translateY(0);opacity:1;}
    #ci-cookie-banner.hide{transform:translateX(-50%) translateY(140%);opacity:0;}
    #ci-cookie-banner .ci-ck-text{flex:1;min-width:240px;color:rgba(255,255,255,0.7);}
    #ci-cookie-banner .ci-ck-link{color:#FBBF24;text-decoration:none;font-weight:600;white-space:nowrap;}
    #ci-cookie-banner .ci-ck-link:hover{text-decoration:underline;}
    #ci-cookie-banner .ci-ck-actions{display:flex;gap:8px;flex-shrink:0;}
    #ci-cookie-banner .ci-ck-btn{font-family:'League Spartan','Inter',sans-serif;font-weight:800;
      font-size:0.8rem;letter-spacing:0.02em;padding:9px 18px;border-radius:100px;cursor:pointer;
      border:1px solid transparent;transition:all .15s ease;}
    #ci-cookie-banner .ci-ck-btn.primary{background:#FBBF24;color:#000;}
    #ci-cookie-banner .ci-ck-btn.primary:hover{background:#F59E0B;transform:translateY(-1px);}
    #ci-cookie-banner .ci-ck-btn.ghost{background:transparent;color:rgba(255,255,255,0.6);border-color:rgba(255,255,255,0.15);}
    #ci-cookie-banner .ci-ck-btn.ghost:hover{color:#fff;border-color:rgba(255,255,255,0.3);}
    @media (prefers-reduced-motion: reduce){#ci-cookie-banner{transition:opacity .2s;}}
  `;
  document.head.appendChild(css);

  // Esperar a que i18n resuelva el idioma para mostrar el texto correcto (pero no más de 600ms).
  function start() {
    if (window.I18N && I18N.lang) return build();
    let waited = 0;
    const iv = setInterval(() => {
      waited += 100;
      if ((window.I18N && I18N.lang) || waited >= 600) { clearInterval(iv); build(); }
    }, 100);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
