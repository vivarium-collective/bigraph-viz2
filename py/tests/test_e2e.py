import json
import shutil
from pathlib import Path

import pytest

playwright = pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright

from bigraph_viz2 import emit_html

SPEC = json.loads((Path(__file__).parent / "fixtures" / "cell.json").read_text())

def _playwright_browsers_installed() -> bool:
    # Linux: ~/.cache/ms-playwright, macOS: ~/Library/Caches/ms-playwright
    candidates = [
        Path.home() / ".cache" / "ms-playwright",
        Path.home() / "Library" / "Caches" / "ms-playwright",
    ]
    return shutil.which("chromium") is not None or any(p.exists() for p in candidates)


@pytest.mark.skipif(
    not _playwright_browsers_installed(),
    reason="playwright browsers not installed",
)
def test_emit_html_renders_in_browser(tmp_path):
    page_html = (
        "<!doctype html><html><body>"
        + emit_html(SPEC, id="e2e", dedupe=False)
        + "</body></html>"
    )
    f = tmp_path / "page.html"
    f.write_text(page_html)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f.as_uri())
        page.wait_for_selector(".bgv2-svg")
        assert page.locator(".bgv2-proc").count() == 2
        browser.close()
        assert errors == []
