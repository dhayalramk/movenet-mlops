FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    TFHUB_CACHE_DIR=/app/.cache/tfhub

# OS deps for Pillow & wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      curl ca-certificates \
      libjpeg62-turbo libpng16-16 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps (numpy first to guarantee 1.24.4)
COPY requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel \
 && pip install --no-cache-dir "numpy==1.24.4" \
 && pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .
RUN mkdir -p ${TFHUB_CACHE_DIR}

EXPOSE 8080

# Healthcheck hits /healthz on correct port
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; u='http://127.0.0.1:8080/healthz'; urllib.request.urlopen(u, timeout=3).read()" || exit 1

# Keep single worker (one TF model per process)
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
