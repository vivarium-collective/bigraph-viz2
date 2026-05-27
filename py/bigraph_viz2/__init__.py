"""bigraph-viz2: lightweight read-only bigraph renderer.

Public API:
    emit_html(state, **opts) -> str
    BigraphViz(state, **opts)               # Jupyter wrapper
    expand_state(state, core=None) -> dict          # opt-in: requires [expand]
    validate_state(state, core=None) -> list[str]   # opt-in: requires [expand]
"""
from .emit import emit_html
from .jupyter import BigraphViz
from .expand import expand_state, validate_state

__version__ = "0.2.2"
__all__ = [
    "emit_html", "BigraphViz",
    "expand_state", "validate_state",
    "__version__",
]
