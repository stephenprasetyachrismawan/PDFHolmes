# Build context = repo root.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1

# libgl/libglib utk PyMuPDF render; lainnya via wheel.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY services/extractor/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY services/extractor/pdfholmes_extractor ./pdfholmes_extractor

CMD ["python", "-m", "pdfholmes_extractor.worker"]
