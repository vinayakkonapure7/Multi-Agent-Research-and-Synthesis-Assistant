"""Web search + scraping wrapper for the Research Agent."""
import logging
import time
import httpx
import trafilatura
from tavily import TavilyClient
try:
    from duckduckgo_search import DDGS
except Exception:  # pragma: no cover - optional until dependencies are installed
    DDGS = None

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = TavilyClient(api_key=settings.tavily_api_key) if settings.tavily_api_key else None


def web_search(query: str, max_results: int | None = None) -> list[dict]:
    """
    Returns citable web evidence as {title, url, content}. DDGS is the default
    project search provider; Tavily remains as an optional fallback.
    """
    max_results = max_results or settings.web_search_results
    if settings.search_provider.lower() == "ddgs":
        results = _ddgs_search(query, max_results=max_results)
        if results:
            return results
    return _tavily_search(query, max_results=max_results)


def _ddgs_search(query: str, max_results: int) -> list[dict]:
    if DDGS is None:
        logger.warning("duckduckgo-search is not installed; falling back to Tavily if configured")
        return []
    try:
        with DDGS(timeout=int(settings.web_scrape_timeout_seconds)) as ddgs:
            raw_results = list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        logger.warning(f"DDGS search failed for query '{query}': {e}")
        return []

    scraped = []
    for result in raw_results[:max_results]:
        title = result.get("title") or result.get("heading") or result.get("href") or "Untitled source"
        url = result.get("href") or result.get("url") or ""
        snippet = result.get("body") or result.get("content") or ""
        content = _scrape_url(url) if url else ""
        scraped.append({
            "title": title,
            "url": url,
            "content": content or snippet,
        })
    return [r for r in scraped if r["content"].strip()]


def _scrape_url(url: str) -> str:
    start = time.monotonic()
    try:
        resp = httpx.get(
            url,
            timeout=settings.web_scrape_timeout_seconds,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (research-report-builder)"},
        )
        resp.raise_for_status()
        if time.monotonic() - start > settings.web_scrape_timeout_seconds:
            return ""
        extracted = trafilatura.extract(resp.text, url=url, include_tables=True)
        return (extracted or "")[:4500]
    except Exception as e:
        logger.info(f"Skipping web scrape for {url}: {e}")
        return ""


def _tavily_search(query: str, max_results: int) -> list[dict]:
    if _client is None:
        logger.warning("No web search provider configured; skipping web search")
        return []
    try:
        resp = _client.search(query=query, max_results=max_results, search_depth="advanced")
        results = []
        for r in resp.get("results", []):
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", ""),
            })
        return results
    except Exception as e:
        logger.warning(f"Tavily search failed for query '{query}': {e}")
        return []
