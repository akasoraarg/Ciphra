(async () => {
 const assert = (condition, message) => { if (!condition) throw new Error(message); };
 const host = document.createElement('section'); host.innerHTML = '<input value="retained">'; document.body.appendChild(host);
 const input = host.firstElementChild;
 const first = PageUI.begin(host, 'form'); const second = PageUI.begin(host, 'form');
 assert(host.getAttribute('aria-busy') === 'true' && input.inert, 'pending state/accessibility');
 assert(host.querySelectorAll('.ui-skeleton').length === 1, 'nested operations share one skeleton');
 first(); assert(host.classList.contains('ui-pending'), 'nested work stays pending');
 second(); second();
 assert(!host.hasAttribute('aria-busy') && !input.inert && input.value === 'retained', 'cleanup preserves inputs');
 let finish;
 const task = PageUI.run(host, 'panel', async () => {
   host.innerHTML = '<p>New content</p>';
   await new Promise(resolve => { finish = resolve; });
 });
 await Promise.resolve(); await Promise.resolve();
 assert(host.querySelector('.ui-skeleton'), 'skeleton survives async DOM replacement');
 finish(); await task;
 assert(!host.querySelector('.ui-skeleton') && host.textContent === 'New content', 'settled content revealed');
 try { await PageUI.run(host, 'list', async () => { throw new Error('synthetic failure'); }); } catch (_) {}
 assert(!host.hasAttribute('aria-busy'), 'failed tasks clear busy state');
 let retried = false; PageUI.error(host, () => { retried = true; }); host.querySelector('button').click();
 assert(retried, 'retry action stays usable'); host.remove();
 const scripts = [...document.scripts].map(s => s.src);
 assert(!scripts.some(url => /katex|mermaid|marked|three.min/.test(url)), 'login loads no heavy renderer');
 return 'PASS: nested skeletons, DOM replacement, failure cleanup, retry, preserved form, lazy initial assets';
})()
