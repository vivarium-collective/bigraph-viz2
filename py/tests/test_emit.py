import json
import re
from pathlib import Path

from bigraph_viz2 import emit_html

FIX = Path(__file__).parent / "fixtures" / "cell.json"
SPEC = json.loads(FIX.read_text())

def test_emit_returns_str():
    html = emit_html(SPEC)
    assert isinstance(html, str)
    assert len(html) > 0

def test_emit_contains_div_with_data_attr():
    html = emit_html(SPEC, id="viz1")
    assert 'id="bgv2-viz1"' in html
    assert "<div" in html
    assert "<script" in html

def test_emit_embeds_bundle_when_dedupe_false():
    html = emit_html(SPEC, dedupe=False)
    assert "BigraphViz" in html  # bundle global is named BigraphViz
    assert "<style" in html

def test_emit_skips_bundle_when_dedupe_true():
    html = emit_html(SPEC, dedupe=True)
    # bootstrap script still present, but no embedded bundle definition
    assert "<style" not in html
    # the dedupe path emits a small bootstrap, not the whole IIFE
    assert len(html) < 5_000   # bundle is ~12KB; dedupe path << that

def test_emit_json_round_trips_spec():
    html = emit_html(SPEC, id="viz2")
    m = re.search(r'id="bgv2-viz2-data"[^>]*>(.*?)</script>', html, re.S)
    assert m is not None
    embedded = json.loads(m.group(1))
    assert embedded == SPEC

def test_emit_height_and_width():
    html = emit_html(SPEC, height="600px", width="80%")
    assert "height:600px" in html or "height: 600px" in html
    assert "width:80%" in html or "width: 80%" in html
