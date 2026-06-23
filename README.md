# Multi-Agent Research and Synthesis Assistant

AI-powered research automation platform — React frontend + FastAPI + LangChain backend.

---

## Project Structure

```text
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
│   │   ├── components/
│   │   │   ├── Sidebar
│   │   │   ├── WorkflowDashboard
│   │   │   ├── ReviewPanel
│   │   │   └── Report
│   │   ├── services/
│   │   │   └── api.js
│   │   └── data/
│   │       └── mockData.js
│   └── package.json
├── start.bat
└── .gitignore
```

---

# Setup Instructions

## Step 1 — Add Your OpenAI API Key

Create a `.env` file inside the backend folder:

```bash
cp backend/.env.example backend/.env
```

Update:

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
```

---

## Step 2 — Configure Frontend Mode

Open:

```text
frontend/src/services/api.js
```

### Demo Mode

```javascript
const USE_MOCK = true
```

### Real OpenAI Backend

```javascript
const USE_MOCK = false
```

---

# Running the Application

## macOS / Linux

### Terminal 1 — Backend

```bash
cd /Users/Course/Multi-Agent-Research-and-Synthesis-Assistant/backend

source venv/bin/activate

python -m uvicorn main:app --reload
```

Backend will run at:

```text
http://localhost:8000
```

---

### Terminal 2 — Frontend

```bash
cd /Users/Course/Multi-Agent-Research-and-Synthesis-Assistant/frontend

npm install

npm run dev
```

Frontend will run at:

```text
http://localhost:5173
```

Open:

```text
http://localhost:5173
```

in your browser.

---

## Windows

### Terminal 1 — Backend

```cmd
cd backend

python -m venv venv

venv\Scripts\activate

pip install -r requirements.txt

python -m uvicorn main:app --reload
```

Backend:

```text
http://localhost:8000
```

---

### Terminal 2 — Frontend

```cmd
cd frontend

npm install

npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

# Demo Mode

No OpenAI API key is required.

Keep:

```javascript
const USE_MOCK = true
```

The complete workflow runs using mock data and is suitable for project demonstrations and evaluations.

---

# API Endpoints

| Method | Endpoint             | Description                      |
| ------ | -------------------- | -------------------------------- |
| GET    | /api/health          | Check backend and API key status |
| POST   | /api/generate-report | Generate research report         |

## Request Format

```text
Content-Type: multipart/form-data

topic: string (required)

files: PDF/TXT files (optional)

urls: newline-separated URLs (optional)
```

## Response Format

```json
{
  "report": "# Title\n\n## Introduction\n...",
  "sources": {
    "web": [
      {
        "title": "...",
        "url": "...",
        "snippet": "..."
      }
    ],
    "files": [
      {
        "name": "...",
        "preview": "..."
      }
    ],
    "urls": [
      {
        "url": "...",
        "ok": true
      }
    ]
  }
}
```

---

# Tech Stack

| Layer          | Technology         |
| -------------- | ------------------ |
| Frontend       | React 18, Vite     |
| Backend        | FastAPI            |
| LLM Framework  | LangChain          |
| LLM Provider   | OpenAI GPT-4o-mini |
| Web Search     | DuckDuckGo         |
| PDF Processing | PyPDFLoader        |
| URL Scraping   | WebBaseLoader      |

---

# Team

| Name             | PNR          |
| ---------------- | ------------ |
| Anmol Gangwar    | 260250125006 |
| Mayur Patel      | 260250125053 |
| Prajal Patil     | 260250125056 |
| Vinayak Konapure | 260250125090 |
| Rohit Kashyap    | 260250120110 |

**Supervisor:** Ms. Shrishti Gupta, C-DAC Bangalore

**Programme:** PGCP in Big Data Analytics & Advanced Computing, Feb 2026 Batch

**Group No.:** PGCP-CD-003
