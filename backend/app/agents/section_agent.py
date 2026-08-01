"""Compatibility wrapper for older imports; real drafting lives in Writer Agent."""

from app.agents.writer import draft_report_section


def draft_section(*args, **kwargs):
    return draft_report_section(*args, **kwargs)
