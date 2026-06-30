# Developer task runner (Linux / macOS).
PY ?= .venv/bin/python

.PHONY: install seed reset test api web

install:
	python -m venv .venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -e ".[dev]"
	cd frontend && npm install

seed:
	$(PY) data-generator/generate_synthetic_data.py

reset:
	$(PY) data-generator/generate_synthetic_data.py --reset

test:
	$(PY) -m pytest backend/tests -q

api:
	$(PY) -m uvicorn backend.app.main:app --reload --port 8000

web:
	cd frontend && npm run dev
