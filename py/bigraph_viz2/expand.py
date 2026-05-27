"""Composite expansion + schema validation, mirroring what bigraph-viz did.

``expand_state`` takes a raw process-bigraph composite dict (the kind you write
into a ``.pbg`` file) and runs ``core.realize(schema, state)`` to:

  * fill in missing stores referenced by wires,
  * propagate type information,
  * type-check the spec.

This is an opt-in dep on ``process_bigraph`` / ``bigraph_schema``. Install with::

    pip install "bigraph-viz2[expand]"

If the user composite uses custom process types (e.g. ``local:MyProcess``),
register those into a core first and pass it via ``core=``::

    from process_bigraph import allocate_core
    import my_pkg     # side-effect: registers process types
    core = allocate_core()
    expanded = expand_state(spec, core=core)

By default a vanilla core is allocated (built-in types only), which is fine
for specs that don't reference custom process addresses.
"""
from __future__ import annotations

import sys
from typing import Any


def expand_state(state: dict, core: Any | None = None, *, raise_on_error: bool = False) -> dict:
    """Return the composite state with stores materialized + types resolved.

    Falls back to the original ``state`` (and prints to stderr) on failure
    unless ``raise_on_error=True``.
    """
    try:
        from process_bigraph import allocate_core
    except ImportError as e:
        raise ImportError(
            "bigraph_viz2.expand_state requires process_bigraph. "
            "Install with: pip install \"bigraph-viz2[expand]\""
        ) from e

    if core is None:
        core = allocate_core()

    try:
        _schema, compiled_state, _ = core.realize({}, state)
        return compiled_state
    except Exception as e:
        if raise_on_error:
            raise
        print(
            f"bigraph_viz2: expansion failed ({type(e).__name__}: {e}); "
            "rendering raw state.",
            file=sys.stderr,
        )
        return state


def validate_state(state: dict, core: Any | None = None) -> list[str]:
    """Return a list of validation issues; empty list = clean spec.

    A thin shim over ``expand_state`` that captures the realize exception
    rather than swallowing it. For deeper schema introspection, call into
    ``bigraph_schema`` directly.
    """
    try:
        from process_bigraph import allocate_core
    except ImportError as e:
        raise ImportError(
            "bigraph_viz2.validate_state requires process_bigraph. "
            "Install with: pip install \"bigraph-viz2[expand]\""
        ) from e

    if core is None:
        core = allocate_core()

    try:
        core.realize({}, state)
        return []
    except Exception as e:
        return [f"{type(e).__name__}: {e}"]
