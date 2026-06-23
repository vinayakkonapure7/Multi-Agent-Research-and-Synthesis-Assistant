@echo off
echo ================================================
echo   Research Assistant — Starting both servers
echo ================================================
echo.

echo [1/2] Starting Backend (FastAPI)...
start cmd /k "cd /d "%~dp0backend" && echo Installing dependencies... && pip install -r requirements.txt && echo. && echo Backend running at http://localhost:8000 && uvicorn main:app --reload --port 8000"

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
