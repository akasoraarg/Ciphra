/* Download markdown, math and diagram libraries only when a message needs them. */
let diagrams;
export async function render(el, text = '', { glossary = false } = {}) {
    await Promise.all([
        PageUI.asset('https://cdn.jsdelivr.net/npm/marked/marked.min.js'),
        PageUI.asset('https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js')
    ]);
    let html = marked.parse(String(text));
    if (glossary) html = html.replace(/\[\[(.*?)\|(.*?)\]\]/g, (_, term, definition) =>
        `<span class="glossary-term">${term}<span class="tooltip-card">${definition}</span></span>`);
    el.innerHTML = DOMPurify.sanitize(html);
    el.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; img.decoding = 'async'; });
    if (/\$|\\\(|\\\[/.test(text)) {
        try {
            await Promise.all([
                PageUI.asset('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css', true),
                PageUI.asset('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js')
            ]);
            await PageUI.asset('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js');
            renderMathInElement(el, { throwOnError: false, delimiters: [
                { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }
            ] });
        } catch (_) { /* Keep readable source math on network failure. */ }
    }
    if (el.querySelector('code.language-mermaid')) {
        try {
            if (!diagrams) diagrams = (async () => {
                await Promise.all([PageUI.asset('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'), PageUI.asset('diagrams.css', true)]);
                mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' });
                await PageUI.asset('diagrams.js');
            })().catch(error => { diagrams = null; throw error; });
            await diagrams;
            await window.renderDiagrams(el);
        } catch (_) { /* Keep the code block if the diagram renderer cannot load. */ }
    }
}
