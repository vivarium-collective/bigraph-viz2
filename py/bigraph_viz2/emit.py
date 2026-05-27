"""emit_html — produce a self-contained bigraph viz HTML snippet."""
from __future__ import annotations

import html as _html
import json
import secrets
from importlib import resources
from typing import Any

_BUNDLE_PKG = "bigraph_viz2._bundle"


def _read_bundle_file(name: str) -> str:
    return resources.files(_BUNDLE_PKG).joinpath(name).read_text(encoding="utf-8")


def emit_html(
    state: dict[str, Any],
    *,
    height: str = "500px",
    width: str = "100%",
    inspector: bool = True,
    theme: str = "light",
    dedupe: bool = False,
    id: str | None = None,
    max_row_width: int = 480,
    expand: bool = False,
    core: Any | None = None,
    materialize: bool = True,
) -> str:
    """Produce a self-contained HTML snippet that renders `state` in the browser.

    Set ``expand=True`` to run the spec through ``bigraph_schema`` /
    ``process_bigraph`` first — this materializes wire-referenced stores and
    type-checks the spec, the same compile step ``bigraph-viz`` did. If the
    composite references custom process addresses, build a ``core`` with those
    registered and pass it; otherwise a default core is allocated.
    """
    if theme != "light":
        raise ValueError("only theme='light' is supported in v1")
    if expand:
        from .expand import expand_state
        state = expand_state(state, core=core)
    viz_id = id or _new_id()
    div_id = f"bgv2-{viz_id}"
    data_id = f"bgv2-{viz_id}-data"

    state_json = json.dumps(state, default=str, ensure_ascii=False)

    bundle = ""
    if not dedupe:
        css = _read_bundle_file("bigraph-viz2.css")
        js  = _read_bundle_file("bigraph-viz2.iife.min.js")
        bundle = (
            f"<style data-bgv2-bundle>{css}</style>"
            f"<script data-bgv2-bundle>{js}</script>"
        )

    opts_json = json.dumps({
        "inspector": inspector,
        "maxRowWidth": max_row_width,
        "id": viz_id,
        "materialize": materialize,
    })

    style = f"height:{height};width:{width}"

    bootstrap = (
        "<script>(function(){"
        f"var el=document.getElementById({json.dumps(div_id)});"
        f"var raw=document.getElementById({json.dumps(data_id)}).textContent;"
        "if(!window.BigraphViz){"
        "  console.error('bigraph-viz2: bundle not loaded — call emit_html with dedupe=False first');"
        "  return;"
        "}"
        f"window.BigraphViz.mount(el, JSON.parse(raw), {opts_json});"
        "})();</script>"
    )

    return (
        f"{bundle}"
        f"<div id=\"{_html.escape(div_id, quote=True)}\" "
        f"class=\"bgv2-host\" style=\"{_html.escape(style, quote=True)}\"></div>"
        f"<script type=\"application/json\" id=\"{_html.escape(data_id, quote=True)}\">"
        f"{state_json}"
        f"</script>"
        f"{bootstrap}"
    )


def _new_id() -> str:
    return secrets.token_hex(4)
