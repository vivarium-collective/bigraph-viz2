import json
from pathlib import Path

from bigraph_viz2 import BigraphViz, emit_html

SPEC = json.loads((Path(__file__).parent / "fixtures" / "cell.json").read_text())

def test_repr_html_matches_emit_html():
    bv = BigraphViz(SPEC, id="viz1", dedupe=True)
    assert bv._repr_html_() == emit_html(SPEC, id="viz1", dedupe=True)
