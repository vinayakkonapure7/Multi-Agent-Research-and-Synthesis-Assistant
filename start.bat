@echo off
echo ================================================
echo   Research Assistant — Starting both servers
echo ================================================
echo.

if not exist "%~dp0backend\.env" (
    echo Creating backend\.env from template — add your OPENAI_API_KEY before using LLM features.
    copy "%~dp0backend\.env.example" "%~dp0backend\.env" > nul
)

if not exist "%~dp0backend\venv\Scripts\activate.bat" (
    echo Creating backend virtual environment...
    py -3.11 -m venv "%~dp0backend\venv"
)

echo [1/2] Starting Backend (FastAPI)...
start cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && echo Installing dependencies... && pip install -r requirements.txt && echo. && echo Backend running at http://localhost:8000 && uvicorn app.main:app --reload --port 8000"

timeout /t 3 /nobreak > nul

echo [2/2] Starting Frontend (React)...
start cmd /k "cd /d "%~dp0frontend" && echo Installing dependencies... && npm install && echo. && echo Frontend running at http://localhost:5173 && npm run dev"

echo.
echo ================================================
echo   Both servers starting in separate windows
echo   Backend:  http://localhost:8000/docs
echo   Frontend: http://localhost:5173
echo ================================================
echo.
pause
