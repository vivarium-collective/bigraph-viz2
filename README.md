# bigraph-viz2

Lightweight, read-only, interactive bigraph renderer. Drop-in replacement for
`bigraph-viz` in pbg- HTML reports with no graphviz dependency.

- `js/` — TypeScript renderer (vanilla, no framework)
- `py/` — Python package, vendors the built JS bundle, exposes `emit_html()`

## Quick start (Python)

    pip install bigraph-viz2
    from bigraph_viz2 import emit_html
    html_fragment = emit_html(composite_state)

See `2026-05-26-bigraph-viz2-design.md` for the full spec.

## Development

    bash scripts/vendor.sh   # rebuilds js/, copies bundle into py/
    cd js && npm test
    cd py && pytest

Licensed Apache-2.0.
