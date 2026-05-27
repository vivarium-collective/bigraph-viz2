# bigraph-viz2

Lightweight, read-only, interactive bigraph renderer. Drop-in replacement for
`bigraph-viz`'s static PNG output in pbg- HTML reports — no graphviz
dependency, pan/zoom/click-to-inspect/dblclick-to-collapse in the browser, and
the entire renderer inlines into a self-contained ~40 KB snippet.

## Install (Python)

    pip install bigraph-viz2

No graphviz. No node. No browser. The JS bundle is vendored inside the package.

## Use

    from bigraph_viz2 import emit_html

    # one-shot: pasteable HTML fragment
    snippet = emit_html(composite_state, height="500px")
    report_html = report_html.replace("{{BIGRAPH}}", snippet)

For multiple viz on one page, inline the bundle once and dedupe the rest:

    snippets = [emit_html(specs[0], dedupe=False)]
    for s in specs[1:]:
        snippets.append(emit_html(s, dedupe=True))

In a Jupyter notebook:

    from bigraph_viz2 import BigraphViz
    BigraphViz(composite_state)   # auto-displays via _repr_html_

## Interactions

| gesture                | effect                                  |
| ---------------------- | --------------------------------------- |
| drag empty space       | pan                                     |
| wheel                  | zoom centered on cursor (0.25× – 4×)    |
| hover a node           | 2-line tooltip                          |
| click a node           | populate inspector                      |
| double-click a node    | collapse / expand subtree               |

Collapse state persists in the URL hash and survives reload.

## API

`emit_html(state, *, height="500px", width="100%", inspector=True, theme="light", dedupe=False, id=None, max_row_width=480) -> str`

- `state` — the composite state dict (same shape `bigraph-viz` accepts).
- `dedupe` — pass `True` to skip inlining the ~40KB bundle if it was inlined
  by an earlier call on the same page.
- `id` — explicit DOM id (auto-generated if omitted). Used to disambiguate
  collapse state in the URL hash across multiple viz on a page.

## Development

    bash scripts/vendor.sh        # build js + copy bundle into py
    cd js && npm test             # vitest
    cd js && npm run test:e2e     # playwright
    cd py && pytest

Spec: see `2026-05-26-bigraph-viz2-design.md`.

## Status

v0.1 — initial release.

## License

Apache-2.0.
