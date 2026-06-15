FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# psycopg2-binary + bcrypt build deps are bundled in wheels; slim is enough.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Fly routes to internal_port 8080
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
