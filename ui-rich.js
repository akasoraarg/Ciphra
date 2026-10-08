/* Download markdown, math and diagram libraries only when a message needs them. */
let diagrams;
export async function render(el, text = '', { glossary = false } = {}) {
    await Promise.all([
        PageUI.asset('vendor/marked/marked.umd.js'),
        PageUI.asset('vendor/dompurify/purify.min.js')
    ]);
    // Tokenize math before Markdown can remove backslashes or interpret TeX
    // underscores/asterisks as emphasis. Code spans and fences remain code.
    const math = [];
    const token = (source, name, block = false) => {
        const match = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$((?:\\.|[^\\$\n])+?)\$(?!\d))/.exec(source);
        if (!match || (block && match[1] === undefined && match[2] === undefined)) return;
        if (block && !/^[ \t]*(?:\n|$)/.test(source.slice(match[0].length))) return;
        // Avoid interpreting prices such as "$5 and $10" as inline math.
        if (match[4] !== undefined && /^\s|\s$/.test(match[4])) return;
        const index = math.push({ raw: match[0], tex: match[1] ?? match[2] ?? match[3] ?? match[4], display: match[1] !== undefined || match[2] !== undefined }) - 1;
        return { type: name, raw: match[0], index };
    };
    const parser = new marked.Marked({ extensions: [
        { name: 'ciphraMathBlock', level: 'block', start: source => source.search(/^(?:\$\$|\\\[)/m),
            tokenizer(source) { return token(source, 'ciphraMathBlock', true); },
            renderer(value) { return `<span data-ciphra-math="${value.index}"></span>\n`; } },
        { name: 'ciphraMathInline', level: 'inline', start: source => source.search(/\$|\\\(|\\\[/),
            tokenizer(source) { return token(source, 'ciphraMathInline'); },
            renderer(value) { return `<span data-ciphra-math="${value.index}"></span>`; } }
    ] });
    let html = parser.parse(String(text));
    if (glossary) html = html.replace(/\[\[(.*?)\|(.*?)\]\]/g, (_, term, definition) =>
        `<span class="glossary-term">${term}<span class="tooltip-card">${definition}</span></span>`);
    el.innerHTML = DOMPurify.sanitize(html);
    el.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; img.decoding = 'async'; });
    const formulas = [...el.querySelectorAll('[data-ciphra-math]')].map(node => ({ node, source: math[Number(node.dataset.ciphraMath)] })).filter(item => item.source);
    formulas.forEach(({ node, source }) => { node.textContent = source.raw; node.removeAttribute('data-ciphra-math'); });
    if (formulas.length) {
        try {
            await Promise.all([
                PageUI.asset('vendor/katex/katex.min.css', true),
                PageUI.asset('vendor/katex/katex.min.js')
            ]);
            formulas.forEach(({ node, source }) => katex.render(source.tex, node, {
                displayMode: source.display, throwOnError: false, trust: false
            }));
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
