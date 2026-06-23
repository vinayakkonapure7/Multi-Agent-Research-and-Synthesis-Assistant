"""
Research Report Builder - FastAPI Backend (LangChain edition)
----------------------------------------------------------------
Handles: web search, PDF/text extraction, URL scraping, and LLM
synthesis -- all built on LangChain components instead of raw SDK
calls. Still a single linear pipeline (no agent autonomy / routing
yet -- that's reserved for the future LangGraph rebuild).

LangChain pieces used:
  - DuckDuckGoSearchResults  (langchain_community.tools)   -> web search
  - PyPDFLoader              (langchain_community.document_loaders) -> PDF text
  - WebBaseLoader            (langchain_community.document_loaders) -> URL scraping
  - ChatPromptTemplate + ChatOpenAI + StrOutputParser, composed with
    LCEL (prompt | llm | parser) -> synthesis chain

The OpenAI API key lives only in backend/.env (loaded via
python-dotenv) and is read by ChatOpenAI server-side. It is never
sent to or read by the frontend.
"""

import os
import tempfile
import traceback
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from langchain_community.document_loaders import PyPDFLoader, WebBaseLoader
from langchain_community.tools import DuckDuckGoSearchResults
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

load_dotenv()

# Silences LangChain's "USER_AGENT not set" warning from WebBaseLoader.
os.environ.setdefault("USER_AGENT", "ResearchReportBuilder/0.1")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
MAX_WEB_RESULTS = 5
MAX_CHARS_PER_SOURCE = 6000
REQUEST_TIMEOUT = 12

app = FastAPI(title="Research Report Builder API")

# Frontend dev server origin(s). Adjust if you deploy elsewhere.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# LangChain-backed ingestion (each maps to a future LangGraph node)
# --------------------------------------------------------------------------

def web_search(topic: str, max_results: int = MAX_WEB_RESULTS):
    """Researcher-equivalent: LangChain's DuckDuckGo search tool.

    LangChain's DuckDuckGoSearchAPIWrapper doesn't expose a timeout, and
    the underlying client can hang on a slow/blocked connection. We run
    it in a worker thread with a hard timeout so a flaky network can
    never stall the whole request -- it just degrades to "no web
    results" instead.
    """
    results = []

    def _search():
        wrapper = DuckDuckGoSearchAPIWrapper(max_results=max_results, time="y")
        search_tool = DuckDuckGoSearchResults(api_wrapper=wrapper, output_format="list")
        return search_tool.invoke(topic)

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_search)
            hits = future.result(timeout=REQUEST_TIMEOUT)
        for hit in hits:
            results.append(
                {
                    "title": hit.get("title", "Untitled"),
                    "url": hit.get("link", ""),
                    "snippet": hit.get("snippet", ""),
                }
            )
    except FuturesTimeoutError:
        print(f"[web_search] timed out after {REQUEST_TIMEOUT}s")
    except Exception as e:
        print(f"[web_search] failed: {e}")
    return results


def extract_pdf_text(file_bytes: bytes, filename: str) -> str:
    """LangChain's PyPDFLoader needs a real file path, so we write to a
    temp file, load Documents (one per page), then join and trim."""
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        loader = PyPDFLoader(tmp_path)
        docs = loader.load()
        full_text = "\n".join(d.page_content for d in docs).strip()
        return full_text[:MAX_CHARS_PER_SOURCE]
    except Exception as e:
        return f"[Could not extract text from {filename}: {e}]"
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


def extract_text_file(file_bytes: bytes, filename: str) -> str:
    """Plain text files don't need a LangChain loader -- a direct decode
    is simpler and equivalent to what TextLoader would do from bytes."""
    try:
        text = file_bytes.decode("utf-8", errors="ignore")
        return text[:MAX_CHARS_PER_SOURCE]
    except Exception as e:
        return f"[Could not read {filename}: {e}]"


def extract_url_content(url: str) -> dict:
    """LangChain's WebBaseLoader (requests + BeautifulSoup under the hood)."""
    try:
        loader = WebBaseLoader(
            web_path=url,
            requests_kwargs={"timeout": REQUEST_TIMEOUT},
            header_template={"User-Agent": "Mozilla/5.0 (ResearchReportBuilder/0.1)"},
        )
        loader.requests_per_second = 1
        docs = loader.load()
        text = " ".join(" ".join(d.page_content.split()) for d in docs)
        return {"url": url, "content": text[:MAX_CHARS_PER_SOURCE], "ok": True}
    except Exception as e:
        return {"url": url, "content": f"[Failed to fetch {url}: {e}]", "ok": False}


# --------------------------------------------------------------------------
# LangChain synthesis chain (Writer-equivalent)
# --------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are a research analyst that writes thorough, well organized, "
    "factually careful, full-length research reports by combining "
    "provided source material with your own background knowledge. You "
    "never compress a report into a short summary unless explicitly "
    "asked to."
)

USER_PROMPT_TEMPLATE = (
    "RESEARCH TOPIC:\n{topic}\n\n"
    "{context_block}\n\n"
    "Using the web search results, uploaded file content, and provided "
    "URL content above ALONGSIDE your own general knowledge, write a "
    "complete, long-form research report on the topic — not a short "
    "summary. Aim for substantial depth in every section (several "
    "paragraphs each, not single sentences or bare bullet points). "
    "Use the following structure, with each section as a proper "
    "markdown heading:\n\n"
    "1. Title\n"
    "2. Introduction — define the topic, why it matters, and the scope "
    "of this report\n"
    "3. Background / Context — explain the underlying concepts a "
    "reader needs, drawing on your own knowledge\n"
    "4. Key Findings — go through each major theme from the sources in "
    "its own subsection with a clear heading; explain the finding, why "
    "it matters, and synthesize across sources rather than listing "
    "snippets\n"
    "5. Discussion / Analysis — connect the findings together, note "
    "any disagreements or gaps between sources, and discuss broader "
    "implications\n"
    "6. Limitations — note gaps in the available sources or open "
    "questions\n"
    "7. Conclusion — summarize the report's overall takeaway\n"
    "8. Sources — list the web URLs, file names, and provided URLs "
    "actually used\n\n"
    "Do not compress this into a brief overview. Write it as a genuine "
    "multi-page report a reader could submit as a deliverable. Avoid "
    "repeating the exact same point twice, but do not sacrifice depth "
    "for brevity."
)

_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT_TEMPLATE),
    ]
)


def build_context_block(web_results, pdf_sources, url_sources) -> str:
    """Assemble the gathered source material into one context string."""
    parts = []

    if web_results:
        parts.append("=== WEB SEARCH RESULTS (DuckDuckGo) ===")
        for i, r in enumerate(web_results, 1):
            parts.append(
                f"[Web {i}] {r['title']}\nURL: {r['url']}\nSnippet: {r['snippet']}\n"
            )

    if pdf_sources:
        parts.append("=== UPLOADED FILE CONTENT ===")
        for i, (name, content) in enumerate(pdf_sources, 1):
            parts.append(f"[File {i}: {name}]\n{content}\n")

    if url_sources:
        parts.append("=== PROVIDED URL CONTENT ===")
        for i, src in enumerate(url_sources, 1):
            parts.append(f"[URL {i}: {src['url']}]\n{src['content']}\n")

    return "\n".join(parts)


def get_synthesis_chain():
    """Build the LCEL chain: prompt -> ChatOpenAI -> string output.
    Built lazily per-request so a missing/changed key is caught cleanly."""
    if not OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to backend/.env (see .env.example)."
        )
    llm = ChatOpenAI(
        model=OPENAI_MODEL,
        api_key=OPENAI_API_KEY,
        max_tokens=4000,
        temperature=0.4,
    )
    return _prompt | llm | StrOutputParser()


def synthesize_report(topic: str, web_results, pdf_sources, url_sources) -> str:
    chain = get_synthesis_chain()
    context_block = build_context_block(web_results, pdf_sources, url_sources)
    return chain.invoke({"topic": topic, "context_block": context_block})


# --------------------------------------------------------------------------
# API routes
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "openai_key_configured": bool(OPENAI_API_KEY)}


@app.post("/api/generate-report")
async def generate_report(
    topic: str = Form(...),
    urls: str = Form(""),  # newline-separated
    files: Optional[List[UploadFile]] = File(None),
):
    if not topic.strip():
        raise HTTPException(status_code=400, detail="Research topic is required.")

    url_list = [u.strip() for u in urls.splitlines() if u.strip()]

    # 1. Web search
    web_results = web_search(topic)

    # 2. File extraction
    pdf_sources = []
    if files:
        for f in files:
            file_bytes = await f.read()
            if f.filename.lower().endswith(".pdf"):
                content = extract_pdf_text(file_bytes, f.filename)
            else:
                content = extract_text_file(file_bytes, f.filename)
            pdf_sources.append((f.filename, content))

    # 3. URL scraping
    url_sources = [extract_url_content(u) for u in url_list]

    # 4. Synthesis (LangChain LCEL chain)
    try:
        report = synthesize_report(topic, web_results, pdf_sources, url_sources)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Report generation failed: {e}")

    return {
        "report": report,
        "sources": {
            "web": web_results,
            "files": [{"name": n, "preview": c[:2000]} for n, c in pdf_sources],
            "urls": [
                {"url": s["url"], "ok": s["ok"], "preview": s["content"][:2000]}
                for s in url_sources
            ],
        },
    }
