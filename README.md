# Multi-Agent Research and Synthesis Assistant

AI-powered research automation platform — React frontend + FastAPI + LangChain backend.

## Project Structure

```
research-assistant/
├── backend/              # FastAPI + LangChain
│   ├── main.py           # API server (all routes)
│   ├── requirements.txt  # Python dependencies
│   ├── .env.example      # Copy this to .env and add your key
│   └── .env              # Your OpenAI key (DO NOT commit)
├── frontend/             # React (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   ├── components/   # Sidebar, WorkflowDashboard, ReviewPanel, Report
│   │   ├── services/
│   │   │   └── api.js    # All backend calls here (toggle USE_MOCK)
│   │   └── data/
│   │       └── mockData.js
│   └── package.json
├── start.bat             # Double click to run both servers (Windows)
└── .gitignore
```

## Quick Start (Windows)

### Step 1 — Add your OpenAI key
```
copy backend\.env.example backend\.env
```
Open `backend\.env` in Notepad and add:
```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
```

### Step 2 — Switch to real backend
In `frontend/src/services/api.js`, change line 8:
```js
const USE_MOCK = false
```

### Step 3 — Run both servers
Double click `start.bat`

Two terminal windows will open:
- **Backend:** http://localhost:8000  
- **Frontend:** http://localhost:5173

Open http://localhost:5173 in your browser.

---

## Demo Mode (no OpenAI key needed)

Keep `USE_MOCK = true` in `api.js` — full flow works with mock data.  
Perfect for mid-evaluation demo.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Check backend + key status |
| POST | `/api/generate-report` | Main endpoint — topic + files → report |

### Request format (`/api/generate-report`)
```
Content-Type: multipart/form-data
topic: string (required)
files: PDF or TXT files (optional, multiple)
urls: newline-separated URLs (optional)
```

### Response format
```json
{
  "report": "# Title\n\n## Introduction\n...",
  "sources": {
    "web": [{ "title": "...", "url": "...", "snippet": "..." }],
    "files": [{ "name": "...", "preview": "..." }],
    "urls": [{ "url": "...", "ok": true }]
  }
}
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite |
| Backend | Python 3.11, FastAPI |
| LLM Framework | LangChain (LCEL chain) |
| LLM Provider | OpenAI GPT-4o-mini |
| Web Search | DuckDuckGo (via LangChain) |
| PDF Processing | PyPDFLoader (LangChain) |
| URL Scraping | WebBaseLoader (LangChain) |

---

## Team

| Name | PNR | Role |
|------|-----|------|
| Anmol Gangwar | 260250125006 | — |
| Mayur Patel | 260250125053 | — |
| Prajal Patil | 260250125056 | — |
| Vinayak Konapure | 260250125090 | — |
| Rohit Kashyap | 260250120110 | Frontend |

**Supervisor:** Ms. Shrishti Gupta, C-DAC Bangalore  
**Programme:** PG Certificate in Advanced Computing, Feb 2026 batch
