# Multi-Agent Research and Synthesis Assistant

An AI-powered web application that helps users move from a research topic,
context, uploaded documents, and source links to a structured academic research
report. The system uses a LangGraph-orchestrated multi-agent workflow and keeps
the human reviewer in control before each section is finalized.

## Tech stack

- Programming: Python 3.11, JavaScript ES6+
- Frontend: React, Vite, HTML5, CSS3
- Backend: FastAPI, Uvicorn, REST JSON APIs
- AI orchestration: LangGraph
- LLM framework: LangChain-compatible prompt architecture
- LLM provider: OpenAI GPT-4o / GPT-4.1 compatible models
- Embeddings: OpenAI `text-embedding-3-small`
- Vector database: ChromaDB
- Retrieval: RAG, semantic search, BM25, MMR-style diversification
- Web search: DuckDuckGo Search, optional Tavily fallback
- Document processing: PyMuPDF, python-docx, openpyxl, OCR fallback
- Text chunking: RecursiveCharacterTextSplitter-style chunking
- Storage: SQLite, local upload/export folders
- Environment management: `.env`, python-dotenv / Pydantic settings

## How it works

1. Enter a research topic and context/problem statement. Before anything is
   sent to the server, a client-side pre-check rejects obviously-bad input
   (too short, or word-shaped noise caught by a common-English-word
   dictionary check) with an inline message, so gibberish never burns two
   screens before being turned away. This is a fast, best-effort filter —
   the backend's own LLM-based validation is still the real authority, and
   runs afterward regardless.
2. Upload optional source material: PDF, DOCX, XLSX, JSON, CSV/TSV, Markdown,
   text, images, or URLs. Failed uploads and URL adds can be retried in place,
   per row, without re-selecting files.
3. LangGraph runs the Researcher, Summarizer, and Critic agents, shown to the
   user as a staged pipeline with elapsed time rather than a bare spinner.
4. The UI shows the Research Agent validation, Critic Agent report, and evidence
   count/excerpts before writing begins.
5. The user reviews the proposed research-paper outline and may edit, reorder,
   delete, or add sections, or discard their edits and ask the agents to propose
   a different outline from scratch (with an inline confirmation, since this
   replaces manual changes).
6. The Writer Agent drafts one section at a time, using optional per-section
   guidance the user can supply before drafting.
7. The user approves, edits manually, or regenerates each section with feedback;
   prior drafts are kept as a version history the user can revisit or restore.
8. Once every section is approved, the final report exports as `.docx`; the
   export action stays disabled until that condition is met.
9. Any failed request (loading a project, listing/uploading sources, generating
   or approving an outline, drafting or approving a section) surfaces a
   "Try again" action that retries the same operation with the same inputs,
   distinguishing an unreachable backend from a server-side error.
10. If the Research Agent's own validation still rejects a topic that made it
    past the client-side pre-check, the project is labeled "Topic rejected"
    (shown in `var(--accent-red)`) in "Your reports" instead of sitting there
    forever as a misleading "Reviewing outline." Since the topic can't be
    edited after creation, the fix is to delete that project (via the
    existing delete-with-confirmation control) and start a new one.

## Agent workflow

- **Research Agent:** validates topic/context to reduce hallucination risk,
  searches web sources, scrapes up to seven sites, and retrieves uploaded-source
  chunks through hybrid RAG.
- **Summarizer Agent:** removes noise and converts retrieved evidence into a
  writer-ready research brief with key claims.
- **Critic Agent:** checks consistency, unsupported claims, and evidence gaps
  before the human review checkpoint.
- **Writer Agent:** drafts the approved outline section by section using the
  research brief, critic report, RAG excerpts, and web evidence.

## Project structure

```text
research-report-builder/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── researcher/
│   │   │   ├── summarizer/
│   │   │   ├── critic/
│   │   │   ├── writer/
│   │   │   └── graph.py
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   └── services/
│   ├── storage/
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── scripts/
    │   └── gen-common-words.cjs   # regenerates src/lib/commonWords.js
    ├── src/
    │   ├── api/
    │   ├── components/
    │   ├── lib/
    │   │   └── commonWords.js     # dictionary used by the topic pre-check
    │   └── styles/
    └── package.json
```

## Setup

### Prerequisites

- Python 3.11
- Node.js 18+
- OpenAI API key
- Optional: Tesseract OCR for local OCR
- Optional: Tavily API key if using `SEARCH_PROVIDER=tavily`

### Backend on macOS/Linux

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Backend on Windows PowerShell

```powershell
cd backend
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open `backend/.env` and set:

```env
OPENAI_API_KEY=your_key_here
SEARCH_PROVIDER=ddgs
WEB_SEARCH_RESULTS=7
WEB_SCRAPE_TIMEOUT_SECONDS=12
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend proxies `/api` calls to the backend
at `http://localhost:8000`.

`frontend/src/lib/commonWords.js` (a ~22k-word dictionary used by the
client-side topic pre-check) is generated, not hand-written. It normally
doesn't need to be touched, but to regenerate it:

```bash
cd frontend
npm install --no-save an-array-of-english-words @derock.ir/words-frequency
node scripts/gen-common-words.cjs
```

Those two packages are dev-only word-list sources and are never added to
`package.json` — only the generated `commonWords.js` ships with the app.

## Required paper sections

The proposed outline starts from the required academic structure:

Title, Abstract, Keywords, Introduction, Literature Review, Proposed
Methodology, Experimental Setup, Results, Discussion, Limitations, Future Work,
Conclusion, and References.

The user can still add or change sections before approving the outline. The
Writer Agent enforces the requested word-count ranges as section-level guidance.

## Notes

- API keys are read from `.env` only and are never shown in the webpage.
- SQLite is appropriate for the local/demo version; use PostgreSQL for a real
  concurrent multi-user deployment.
- The app is a drafting and validation assistant. Users should still review
  final citations before academic submission.
## Team

|      Name            PNR        |
| Rohit Kashyap    | 260250120110 |
| Anmol Gangwar    | 260250125006 |
| Mayur Patel      | 260250125053 |
| Prajal Patil     | 260250125056 |
| Vinayak Konapure | 260250125090 |

**Supervisor:** Ms. Shrishti Gupta, C-DAC Bangalore
**Programme:** PGCP in Big Data Analytics & Advanced Computing, Feb 2026 Batch
**Group No.:** PGCP-CD-003
