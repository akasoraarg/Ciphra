/* Run on login.html: coderabbit-agent-browser eval --stdin < tests/rich.browser.js */
(async () => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const host = document.createElement('section');
    document.body.appendChild(host);
    try {
        await PageUI.rich(host, '**Bold reply** with a list:\n\n- first\n- second');
        assert(host.querySelector('strong')?.textContent === 'Bold reply', 'Markdown bold');
        assert(host.querySelectorAll('li').length === 2, 'Markdown list');
        assert(!document.querySelector('script[src*="vendor/katex"]'), 'math stays lazy for ordinary Markdown');

        await PageUI.rich(host, String.raw`**Math answer**: \(a_b + c^{2}\), $x^2$.

\[\frac{1}{2} + \sqrt{x}\]

$$\begin{aligned}a &= b \\ c &= d\end{aligned}$$

Inline code: \`\(literal\)\`.
` .replace(/\\`/g, '`'));
        assert(host.querySelector('strong')?.textContent === 'Math answer', 'bold survives math rendering');
        assert(host.querySelectorAll('.katex').length === 4, 'all four math delimiters');
        assert(host.querySelectorAll('.katex-display').length === 2, 'display equations');
        assert(!host.querySelector('.katex-error'), 'TeX subscripts, fractions and aligned equations');
        assert(host.querySelector('code')?.textContent === String.raw`\(literal\)`, 'inline code stays literal');
        assert(!host.hasAttribute('aria-busy'), 'math skeleton clears');

        for (const [text, ending] of [['Before $$x^2$$ after.', 'after.'], ['$$x^2$$ followed by text.', 'followed by text.']]) {
            await PageUI.rich(host, text);
            assert(host.children.length === 1 && host.firstElementChild.tagName === 'P', 'math in running text preserves its paragraph');
            assert(host.querySelector('.katex') && host.textContent.includes(ending), 'formula and following text survive');
        }

        await PageUI.rich(host, '```latex\n\\[x_1\\]\n```\n\nPrices: $5 and $10. Range: $5-$10.\n\n<img src=x onerror="window.__richUnsafe=1">');
        assert(host.querySelector('pre code')?.textContent.includes(String.raw`\[x_1\]`), 'fenced TeX remains code');
        assert(!host.querySelector('.katex'), 'code and prices do not become formulas');
        assert(host.textContent.includes('$5 and $10'), 'currency text is unchanged');
        assert(host.textContent.includes('$5-$10'), 'currency ranges remain literal');
        assert(!host.querySelector('[onerror]') && window.__richUnsafe !== 1, 'untrusted HTML is sanitized');

        await PageUI.rich(host, String.raw`Invalid math: \(\frac{1}\)`);
        assert(host.querySelector('.katex-error') && !host.hasAttribute('aria-busy'), 'invalid TeX stays readable and settles');
        await document.fonts.ready;
        assert(document.fonts.check('12px KaTeX_Main'), 'local math fonts loaded');
        return 'PASS: bold, lists, four math delimiters, display math, TeX commands, literal code, prices, sanitization, invalid TeX and lazy math assets';
    } finally { host.remove(); }
})()
