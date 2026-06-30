# Developer task runner (Windows / PowerShell).
#   ./tasks.ps1 install   # create venv + install backend, install frontend
#   ./tasks.ps1 seed      # build + load the canonical day
#   ./tasks.ps1 test      # run the backend test suite
#   ./tasks.ps1 api       # run the FastAPI backend (http://localhost:8000)
#   ./tasks.ps1 web       # run the Next.js frontend (http://localhost:3000)

param([Parameter(Position = 0)][string]$Task = "help")

$ErrorActionPreference = "Stop"
$Py = ".\.venv\Scripts\python.exe"

switch ($Task) {
    "install" {
        python -m venv .venv
        & $Py -m pip install --upgrade pip
        & $Py -m pip install -e ".[dev]"
        Push-Location frontend; npm install; Pop-Location
    }
    "seed"  { & $Py data-generator/generate_synthetic_data.py }
    "reset" { & $Py data-generator/generate_synthetic_data.py --reset }
    "test"  { & $Py -m pytest backend/tests -q }
    "api"   { & $Py -m uvicorn backend.app.main:app --reload --port 8000 }
    "web"   { Push-Location frontend; npm run dev; Pop-Location }
    default {
        Write-Host "Tasks: install | seed | reset | test | api | web"
    }
}
