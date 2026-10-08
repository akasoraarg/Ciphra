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
        const familyName = value => value.replace(/["']/g, '').trim();
        const loadedFaces = [...document.fonts].filter(face => familyName(face.family) === 'KaTeX_Main' && face.status === 'loaded');
        assert(loadedFaces.length > 0, 'a KaTeX_Main font face actually loaded');
        // FontFace exposes status, but its source is only available through CSSOM.
        const stylesheetURL = new URL('vendor/katex/katex.min.css', document.baseURI);
        const stylesheet = [...document.styleSheets].find(sheet => sheet.href === stylesheetURL.href);
        assert(stylesheet, 'local KaTeX stylesheet exists');
        const fontDirectory = new URL('fonts/', stylesheetURL);
        const localFaceLoaded = [...stylesheet.cssRules].some(rule => {
            if (rule.type !== CSSRule.FONT_FACE_RULE || familyName(rule.style.fontFamily) !== 'KaTeX_Main') return false;
            if (!loadedFaces.some(face => face.style === rule.style.fontStyle && face.weight === rule.style.fontWeight)) return false;
            const sources = [...rule.style.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)/g)];
            return sources.length > 0 && sources.every(([, source]) => {
                const url = new URL(source, stylesheetURL);
                return url.origin === location.origin && url.pathname.startsWith(fontDirectory.pathname);
            });
        });
        assert(localFaceLoaded, 'loaded KaTeX_Main face uses vendored local font sources');
        return 'PASS: bold, lists, four math delimiters, display math, TeX commands, literal code, prices, sanitization, invalid TeX and lazy math assets';
    } finally { host.remove(); }
})()
