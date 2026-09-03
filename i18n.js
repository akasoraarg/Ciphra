/* Ciphra i18n — motor liviano de traducción + switcher de idioma (en/es/pt).
 *
 * Cómo se usa en el HTML:
 *   <h1 data-i18n="hero.title">Texto en español (fuente)</h1>
 *   <input data-i18n-ph="login.email" placeholder="Correo">
 *   <span data-i18n-html="foot.note">... con <b>html</b> ...</span>
 *   <div data-lang-switcher></div>   ← acá se monta el selector EN/ES/PT
 *
 * El ESPAÑOL es el texto fuente que ya está en el HTML: NO hace falta cargarlo en el dict.
 * Solo definimos en/pt (y opcionalmente overrides es). Si falta una clave, se deja el texto
 * original — así nunca se rompe nada.
 *
 * Región: int (default inglés) / latam (default español), por subdominio o ?region=.
 */
(function () {
  const DICT = {
    es: {
      // Claves que se renderizan por JS (banner de cookies, páginas legales): necesitan ES explícito.
      "foot.terms": "Términos", "foot.privacy": "Privacidad",
      "cookie.text": "Usamos cookies para mantener tu sesión activa y mejorar tu experiencia. Podés aceptar o rechazar las cookies no esenciales.",
      "cookie.accept": "Aceptar", "cookie.reject": "Rechazar", "cookie.more": "Saber más",
      "legal.back": "Volver al inicio", "legal.updated": "Última actualización: junio de 2026",
      "legal.terms.title": "Términos y Condiciones", "legal.privacy.title": "Política de Privacidad",
      "legal.prevail": "",
    },
    en: {
      // nav
      "nav.modulos": "Modules", "nav.descargas": "Downloads", "nav.planes": "Plans",
      "nav.login": "Sign In", "nav.logout": "Sign Out", "nav.openapp": "Open App →", "nav.language": "Language",
      "cn.explore": "Explore", "cn.modules": "Modules", "cn.resources": "Resources",
      // hero
      "hero.eyebrow": "The Engineering of Learning", "hero.t1": "Think", "hero.t2": "without limits",
      "hero.sub": "Four modules in a single platform: engineering chat, exam generation, math solving and document visualization. Built for <b>engineers, mathematicians and builders</b>.",
      "hero.cta1": "Start Free", "hero.cta2": "See the Modules",
      // modules
      "mod.kick": "— The modules", "mod.h2": "Four tools.<br>One platform.",
      "mod.intro": "Each module is calibrated for a different way of thinking. Swipe to explore →",
      "cmd.desc": "AI engineering chat. Three reasoning engines, vision, production code and deep analysis in one conversation.",
      "cmd.f1": "Production code", "cmd.f2": "Image vision", "cmd.f3": "Deep reasoning", "cmd.open": "Open Commander",
      "mind.desc": "Generate exams and quizzes from your PDFs, images and notes. Choose question type, difficulty and timed exam mode.",
      "mind.f1": "From PDFs and images", "mind.f2": "Multiple choice and T/F", "mind.f3": "Exam mode", "mind.open": "Open Mindshift",
      "quan.desc": "Solve math problems step by step with the Socratic method. It guides you to discover the solution with high-definition LaTeX notation.",
      "quan.f1": "Step by step", "quan.f2": "Socratic method", "quan.f3": "LaTeX notation", "quan.open": "Open Quantum",
      // downloads
      "dl.kick": "— Native macOS app", "dl.totallbl": "Total downloads", "dl.h2": "Ciphra on your Desktop",
      "dl.p": "All the power of the modules in a native app. No browser, no distractions.",
      "dl.btn": "Download for macOS", "dl.meta": "v1.2.0 · macOS 10.15+ · Windows and Linux coming soon",
      "dl.machint": "Scroll to rotate",
      // pricing
      "pricing.kick": "— Plans", "pricing.h2": "Choose your <span class=\"gold\">Potential.</span>",
      "free.tier": "Standard Plan", "free.per": "/ forever",
      "free.f1": "Access to Commander, Mindshift and Quantum", "free.f2": "Test generation with Mindshift",
      "free.f3": "7 Vision attachments per week", "free.f4": "Deep reasoning (Ethos)", "free.btn": "Start Free",
      "pro.rec": "RECOMMENDED", "pro.tier": "Full Plan", "pro.per": "/ month",
      "pro.f1": "Unlimited use of all 3 modules", "pro.f2": "Deep reasoning (Ethos)",
      "pro.f3": "Unlimited Ciphra Vision", "pro.f4": "Files up to 20MB", "pro.btn": "Get PRO",
      // cta + footer
      "cta.p": "Start operating with Ciphra today. Free.", "cta.btn": "Open the App",
      "foot.cp": "© 2026 Ciphra Technologies. All rights reserved.",
      "foot.contact": "Contact", "foot.home": "Home", "foot.app": "App",
      "foot.terms": "Terms", "foot.privacy": "Privacy",
      // cookies
      "cookie.text": "We use cookies to keep your session active and improve your experience. You can accept or reject non-essential cookies.",
      "cookie.accept": "Accept", "cookie.reject": "Reject", "cookie.more": "Learn more",
      // legal pages chrome
      "legal.back": "Back to home", "legal.updated": "Last updated: June 2026",
      "legal.terms.title": "Terms & Conditions", "legal.privacy.title": "Privacy Policy",
      "legal.prevail": "This is a courtesy translation. Ciphra operates under Argentine law; in case of discrepancy, the Spanish version prevails.",
    },
    pt: {
      "nav.modulos": "Módulos", "nav.descargas": "Downloads", "nav.planes": "Planos",
      "nav.login": "Entrar", "nav.logout": "Sair", "nav.openapp": "Abrir App →", "nav.language": "Idioma",
      "cn.explore": "Explorar", "cn.modules": "Módulos", "cn.resources": "Recursos",
      "hero.eyebrow": "A Engenharia do Aprendizado", "hero.t1": "Pense", "hero.t2": "sem limites",
      "hero.sub": "Quatro módulos em uma só plataforma: chat de engenharia, geração de provas, resolução de matemática e visualização de documentos. Feito para <b>engenheiros, matemáticos e builders</b>.",
      "hero.cta1": "Começar Grátis", "hero.cta2": "Ver os Módulos",
      "mod.kick": "— Os módulos", "mod.h2": "Quatro ferramentas.<br>Uma plataforma.",
      "mod.intro": "Cada módulo é calibrado para uma forma diferente de pensar. Deslize para conhecê-los →",
      "cmd.desc": "Chat de engenharia com IA. Três motores de raciocínio, visão, código de produção e análise profunda em uma conversa.",
      "cmd.f1": "Código de produção", "cmd.f2": "Visão de imagens", "cmd.f3": "Raciocínio profundo", "cmd.open": "Abrir Commander",
      "mind.desc": "Gere provas e testes a partir dos seus PDFs, imagens e anotações. Escolha o tipo de pergunta, dificuldade e modo prova com tempo limite.",
      "mind.f1": "A partir de PDFs e imagens", "mind.f2": "Múltipla escolha e V/F", "mind.f3": "Modo prova", "mind.open": "Abrir Mindshift",
      "quan.desc": "Resolva problemas de matemática passo a passo com o método socrático. Ele te guia para descobrir a solução com notação LaTeX em alta definição.",
      "quan.f1": "Passo a passo", "quan.f2": "Método socrático", "quan.f3": "Notação LaTeX", "quan.open": "Abrir Quantum",
      "dl.kick": "— App nativo macOS", "dl.totallbl": "Downloads totais", "dl.h2": "Ciphra no seu Desktop",
      "dl.p": "Todo o poder dos módulos em um app nativo. Sem navegador, sem distrações.",
      "dl.btn": "Baixar para macOS", "dl.meta": "v1.2.0 · macOS 10.15+ · Windows e Linux em breve",
      "dl.machint": "Role para girar",
      "pricing.kick": "— Planos", "pricing.h2": "Escolha seu <span class=\"gold\">Potencial.</span>",
      "free.tier": "Plano Standard", "free.per": "/ para sempre",
      "free.f1": "Acesso a Commander, Mindshift e Quantum", "free.f2": "Geração de testes com Mindshift",
      "free.f3": "7 anexos de Visão por semana", "free.f4": "Raciocínio profundo (Ethos)", "free.btn": "Começar Grátis",
      "pro.rec": "RECOMENDADO", "pro.tier": "Plano Completo", "pro.per": "/ mês",
      "pro.f1": "Uso ilimitado dos 3 módulos", "pro.f2": "Raciocínio profundo (Ethos)",
      "pro.f3": "Ciphra Vision ilimitado", "pro.f4": "Arquivos de até 20MB", "pro.btn": "Obter PRO",
      "cta.p": "Comece a operar com Ciphra hoje. Grátis.", "cta.btn": "Abrir o App",
      "foot.cp": "© 2026 Ciphra Technologies. Todos os direitos reservados.",
      "foot.contact": "Contato", "foot.home": "Início", "foot.app": "App",
      "foot.terms": "Termos", "foot.privacy": "Privacidade",
      "cookie.text": "Usamos cookies para manter sua sessão ativa e melhorar sua experiência. Você pode aceitar ou recusar os cookies não essenciais.",
      "cookie.accept": "Aceitar", "cookie.reject": "Recusar", "cookie.more": "Saiba mais",
      "legal.back": "Voltar ao início", "legal.updated": "Última atualização: junho de 2026",
      "legal.terms.title": "Termos e Condições", "legal.privacy.title": "Política de Privacidade",
      "legal.prevail": "Esta é uma tradução de cortesia. A Ciphra opera sob a lei argentina; em caso de divergência, prevalece a versão em espanhol.",
    },
  };
  const LANG_NAMES = { en: "EN", es: "ES", pt: "PT" };

  const I18N = {
    dict: DICT,
    lang: "es",
    region: null,
    langs: ["es", "pt", "en"],

    _detectRegionLocal() {
      const q = new URLSearchParams(location.search).get("region");
      if (q === "int" || q === "latam") return q;
      const h = location.hostname.toLowerCase();
      if (h.startsWith("int.")) return "int";
      if (h.startsWith("latam.")) return "latam";
      return null;
    },

    async init() {
      this.region = this._detectRegionLocal();
      let def = this.region === "int" ? "en" : "es";
      try {
        const d = await (await fetch("/api/region" + location.search)).json();
        this.region = d.region || this.region;
        this.langs = d.langs || this.langs;
        def = d.default_lang || def;
      } catch (e) {
        this.langs = this.region === "int" ? ["en", "es", "pt"] : ["es", "pt", "en"];
      }
      const saved = localStorage.getItem("ciphra_lang");
      this.lang = saved && this.langs.includes(saved) ? saved : def;
      this.apply();
      this.mountSwitchers();
    },

    t(key) {
      if (this.lang === "es") {
        const d = this.dict.es || {};
        return key in d ? d[key] : null; // español = fuente del HTML, salvo override
      }
      const d = this.dict[this.lang] || {};
      if (key in d) return d[key];
      const en = this.dict.en || {};
      return key in en ? en[key] : null;
    },

    apply() {
      document.documentElement.lang = this.lang;
      const set = (sel, fn) => document.querySelectorAll(sel).forEach((el) => {
        const v = this.t(el.getAttribute(sel.match(/\[(.+?)\]/)[1]));
        if (v != null) fn(el, v);
      });
      set("[data-i18n]", (el, v) => (el.textContent = v));
      set("[data-i18n-html]", (el, v) => (el.innerHTML = v));
      set("[data-i18n-ph]", (el, v) => el.setAttribute("placeholder", v));
      set("[data-i18n-title]", (el, v) => el.setAttribute("title", v));
      set("[data-i18n-aria]", (el, v) => el.setAttribute("aria-label", v));
    },

    setLang(l) {
      this.lang = l;
      localStorage.setItem("ciphra_lang", l);
      this.apply();
      this.mountSwitchers();
      window.dispatchEvent(new CustomEvent("i18n:change", { detail: { lang: l } }));
    },

    mountSwitchers() {
      document.querySelectorAll("[data-lang-switcher]").forEach((host) => {
        host.classList.add("ci-lang-switch");
        host.innerHTML = this.langs
          .map((l) => `<button type="button" class="ci-lang-btn${l === this.lang ? " active" : ""}" onclick="I18N.setLang('${l}')">${LANG_NAMES[l] || l.toUpperCase()}</button>`)
          .join("");
      });
    },
  };

  window.I18N = I18N;

  const css = document.createElement("style");
  css.textContent = `
    .ci-lang-switch{display:inline-flex;gap:2px;align-items:center;background:rgba(255,255,255,0.05);
      border:1px solid rgba(255,255,255,0.12);border-radius:100px;padding:3px;}
    .ci-lang-btn{background:transparent;border:none;color:rgba(255,255,255,0.5);font:inherit;
      font-size:0.72rem;font-weight:700;letter-spacing:0.04em;padding:4px 9px;border-radius:100px;
      cursor:pointer;transition:all .15s ease;line-height:1;}
    .ci-lang-btn:hover{color:#fff;}
    .ci-lang-btn.active{background:var(--gold,#FBBF24);color:#000;}
  `;
  document.head.appendChild(css);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => I18N.init());
  } else {
    I18N.init();
  }
})();
