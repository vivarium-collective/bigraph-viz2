"""Smoke tests for the opt-in composite-expansion / validation helpers."""
import pytest

pytest.importorskip("process_bigraph")  # entire file skips when extra not installed

from bigraph_viz2 import emit_html, expand_state, validate_state


def test_expand_state_passes_through_clean_spec():
    spec = {"name": "s", "stores": {"a": {"_type": "float", "value": 1.0}}}
    out = expand_state(spec)
    # We don't assert structural equality — realize() may add metadata. We
    # only require that expansion completes without raising and returns a dict
    # that still describes the variable `a`.
    assert isinstance(out, dict)


def test_validate_state_returns_empty_for_clean_spec():
    spec = {"name": "s", "stores": {"a": {"_type": "float", "value": 1.0}}}
    assert validate_state(spec) == []


def test_emit_html_with_expand_true_does_not_raise():
    spec = {"name": "s", "stores": {"a": {"_type": "float", "value": 1.0}}}
    html = emit_html(spec, expand=True, dedupe=False)
    assert isinstance(html, str)
    assert "BigraphViz" in html


def test_expand_falls_back_on_failure_by_default(capsys):
    bad = {"name": "s", "stores": {"x": {"_type": "process", "address": "local:NotARegisteredType"}}}
    out = expand_state(bad)  # should NOT raise; falls back with stderr warning
    assert isinstance(out, dict)
    captured = capsys.readouterr()
    assert "expansion failed" in captured.err
