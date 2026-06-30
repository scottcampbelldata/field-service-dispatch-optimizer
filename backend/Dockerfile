# FastAPI + OR-Tools backend.
FROM python:3.12-slim

WORKDIR /app

# Install dependencies from the project metadata.
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
        "ortools>=9.10" "sqlalchemy>=2.0" "fastapi>=0.110" \
        "uvicorn[standard]>=0.29" "pydantic>=2.6" "pydantic-settings>=2.2" \
        "psycopg[binary]>=3.1"

COPY backend ./backend
COPY data-generator ./data-generator

EXPOSE 8000

# Seed (idempotent) then serve. The app also seeds on startup, but doing it
# here surfaces DB errors early.
CMD ["sh", "-c", "python data-generator/generate_synthetic_data.py && uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"]
