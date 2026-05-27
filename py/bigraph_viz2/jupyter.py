"""Jupyter wrapper. display(BigraphViz(spec)) in a notebook."""
from .emit import emit_html


class BigraphViz:
    def __init__(self, state, **opts):
        self._state = state
        self._opts = opts

    def _repr_html_(self):
        return emit_html(self._state, **self._opts)
