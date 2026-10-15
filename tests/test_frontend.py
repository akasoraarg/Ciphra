"""Verify the reorganized frontend is complete at the public static root."""
import os
from pathlib import Path
import re
import sys
import unittest
from html.parser import HTMLParser
from unittest.mock import patch
from urllib.parse import unquote, urlsplit

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
with patch.dict(os.environ, {
    'AUTH_PROVIDER': 'supabase', 'VAULT_KEY': 'synthetic-test-vault',
    'CIPHRA_BASE_KEY': 'synthetic-test-base', 'GEMINI_API_KEY': '',
}):
    import main


class AssetReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attr = {'script': 'src', 'link': 'href', 'img': 'src'}.get(tag)
        if attr:
            value = dict(attrs).get(attr)
            if value:
                self.urls.append(value)


class FrontendTests(unittest.TestCase):
    def setUp(self):
        self.client = self.enterContext(TestClient(main.app))
        self.root = Path(main.FRONTEND_DIR)

    def assert_asset(self, url, relative_to=Path('.')):
        parsed = urlsplit(url)
        if parsed.scheme or parsed.netloc or not parsed.path:
            return
        path = Path(unquote(parsed.path.lstrip('/')))
        if not parsed.path.startswith('/'):
            path = relative_to / path
        with self.subTest(asset=str(path)):
            response = self.client.get('/' + str(path))
            self.assertEqual(response.status_code, 200)

    def test_local_page_assets_are_served(self):
        for page in self.root.glob('*.html'):
            with self.subTest(page=page.name):
                self.assertEqual(self.client.get('/' + page.name).status_code, 200)
                parser = AssetReferences()
                parser.feed(page.read_text())
                for url in parser.urls:
                    self.assert_asset(url)

    def test_lazy_modules_and_fonts_are_served(self):
        sources = list(self.root.glob('*.html')) + list((self.root / 'js').glob('*.js'))
        for source in sources:
            text = source.read_text()
            for url in re.findall(r"PageUI\.asset\(\s*['\"]([^'\"]+)", text):
                self.assert_asset(url)
            for url in re.findall(r"import\(\s*['\"]([^'\"]+)", text):
                self.assert_asset(url, source.relative_to(self.root).parent)
        stylesheet = self.root / 'vendor/katex/katex.min.css'
        self.assertTrue(stylesheet.is_file(), 'vendored KaTeX CSS belongs inside the public frontend')
        for font in re.findall(r'url\(([^)]+)\)', stylesheet.read_text()):
            self.assert_asset(font.strip('\"\''), Path('vendor/katex'))


if __name__ == '__main__':
    unittest.main()
