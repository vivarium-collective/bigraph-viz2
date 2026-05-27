"""bigraph-viz2: lightweight read-only bigraph renderer.

Public API:
    emit_html(state, **opts) -> str
    BigraphViz(state, **opts)  # Jupyter wrapper
"""
from .emit import emit_html
from .jupyter import BigraphViz

__version__ = "0.1.1"
__all__ = ["emit_html", "BigraphViz", "__version__"]
