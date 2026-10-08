/* Small shared shell. Heavy renderers and view components are separate modules. */
(() => {
    const pending = new WeakMap();
    const assets = new Map();
    const block = (name = '') => `<span class="ui-skeleton-block ${name}"></span>`;
    const row = () => `<span class="ui-skeleton-row">${block('avatar')}<span class="ui-skeleton-stack">${block()}${block('short')}</span></span>`;
    const resolve = target => typeof target === 'string' ? document.querySelector(target) : target;
    const PageUI = window.PageUI = {
        ready: document.readyState === 'loading' ? new Promise(resolveReady => document.addEventListener('DOMContentLoaded', resolveReady, { once: true })) : Promise.resolve(),
        skeleton(kind = 'panel') {
            const layouts = {
                compact: block(), profile: row(), list: row().repeat(4), chat: row().repeat(3),
                form: block('title') + block('field').repeat(3),
                quiz: `<span class="ui-skeleton-stack">${block('title')}${block('card')}${block('card')}</span><span class="ui-skeleton-stack">${block('title')}${block('field').repeat(4)}${block('short')}</span>`,
                panel: block('title') + `<span class="ui-skeleton-grid">${block('card').repeat(2)}</span>` + block() + block('short')
            };
            const node = document.createElement('div');
            node.className = `ui-skeleton ui-skeleton--${kind}`;
            node.setAttribute('role', 'status');
            node.innerHTML = '<span class="ui-sr-only">Cargando contenido</span>' + (layouts[kind] || layouts.panel);
            return node;
        },
        begin(target, kind = 'panel') {
            const el = resolve(target);
            if (!el) return () => {};
            let state = pending.get(el);
            if (!state) {
                const overlay = PageUI.skeleton(kind);
                const children = [...el.children].map(child => [child, child.inert]);
                state = { count: 0, overlay, children, busy: el.getAttribute('aria-busy'), position: el.style.position, minHeight: el.style.minHeight };
                pending.set(el, state);
                const minimum = { compact: 24, profile: 42, list: 180, chat: 220, form: 260, quiz: 400, panel: 220 }[kind] || 180;
                el.style.minHeight = `${Math.max(el.getBoundingClientRect().height, minimum)}px`;
                if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
                el.setAttribute('aria-busy', 'true');
                children.forEach(([child]) => { child.inert = true; });
                el.classList.add('ui-pending');
                el.appendChild(overlay);
                // Renderers may replace children before awaiting fonts/math/other assets.
                // Keep the placeholder until the whole async operation has settled.
                state.observer = new MutationObserver(() => {
                    if (state.count > 0 && overlay.parentNode !== el) el.appendChild(overlay);
                });
                state.observer.observe(el, { childList: true });
            }
            state.count++;
            let finished = false;
            return () => {
                if (finished) return;
                finished = true;
                if (--state.count) return;
                state.observer.disconnect();
                state.overlay.remove();
                state.children.forEach(([child, inert]) => { child.inert = inert; });
                el.classList.remove('ui-pending');
                if (state.busy === null) el.removeAttribute('aria-busy'); else el.setAttribute('aria-busy', state.busy);
                el.style.position = state.position;
                el.style.minHeight = state.minHeight;
                pending.delete(el);
            };
        },
        beginAll(selector) {
            const finish = [...document.querySelectorAll(selector)].map(el => PageUI.begin(el, el.dataset.skeleton || 'profile'));
            return () => finish.forEach(done => done());
        },
        async run(target, kind, task) {
            const done = PageUI.begin(target, kind);
            try { return await task(); } finally { done(); }
        },
        wrap(fn, target, kind = 'panel', { once = false } = {}) {
            let complete = false;
            return async function (...args) {
                if (once && complete) return fn.apply(this, args);
                return PageUI.run(target, kind, async () => {
                    const result = await fn.apply(this, args);
                    complete = true;
                    return result;
                });
            };
        },
        error(target, retry, message = 'No se pudo cargar el contenido.') {
            const el = resolve(target);
            if (!el) return;
            const notice = document.createElement('div');
            notice.className = 'ui-load-error';
            notice.setAttribute('role', 'alert');
            const text = document.createElement('p');
            text.textContent = message;
            notice.appendChild(text);
            if (retry) {
                const button = document.createElement('button');
                button.type = 'button'; button.textContent = 'Reintentar';
                button.onclick = retry;
                notice.appendChild(button);
            }
            el.replaceChildren(notice);
        },
        asset(url, css = false) {
            if (assets.has(url)) return assets.get(url);
            const promise = new Promise((resolveAsset, reject) => {
                const el = document.createElement(css ? 'link' : 'script');
                if (css) { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; el.async = true; }
                const timer = setTimeout(() => fail(), 15000);
                const fail = () => { clearTimeout(timer); el.remove(); assets.delete(url); reject(new Error('No se pudo cargar el componente.')); };
                el.onload = () => { clearTimeout(timer); resolveAsset(); };
                el.onerror = fail;
                document.head.appendChild(el);
            });
            assets.set(url, promise);
            return promise;
        },
        idle(task) {
            const run = () => Promise.resolve().then(task).catch(error => console.warn('Optional component:', error.message));
            if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2500 });
            else setTimeout(run, 100);
        },
        visible(target, task) {
            const el = resolve(target);
            if (!el) return;
            if (!('IntersectionObserver' in window)) { PageUI.idle(task); return; }
            const observer = new IntersectionObserver(entries => {
                if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); PageUI.idle(task); }
            }, { rootMargin: '120px' });
            observer.observe(el);
        },
        async rich(target, text, options) {
            const el = resolve(target);
            return PageUI.run(el, 'chat', async () => {
                try { await (await import('./ui-rich.js')).render(el, text, options); }
                catch (_) { el.textContent = text || ''; } // Plain text remains readable when a CDN is unavailable.
            });
        },
        async history(target, messages, render) {
            return (await import('./ui-history.js')).mount(resolve(target), messages, render);
        },
        async component(target, load) {
            try { await PageUI.run(target, 'panel', load); return true; }
            catch (_) { PageUI.error(target, () => location.reload()); return false; }
        }
    };
})();
