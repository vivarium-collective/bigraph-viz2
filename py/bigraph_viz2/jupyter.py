class BigraphViz:
    def __init__(self, state, **opts):
        self._state = state
        self._opts = opts
    def _repr_html_(self):
        raise NotImplementedError
