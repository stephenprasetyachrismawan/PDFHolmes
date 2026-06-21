# Build context = repo root. Analyzer butuh field-schema kanonik (JSON + loader py).
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY services/analyzer/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Kode worker.
COPY services/analyzer/pdfholmes_analyzer ./pdfholmes_analyzer

# field-schema: loader python + fields.json (satu sumber kebenaran).
COPY packages/field-schema/python/field_schema.py /opt/field_schema/field_schema.py
COPY packages/field-schema/fields.json /opt/field_schema/fields.json
ENV PYTHONPATH=/opt/field_schema
ENV FIELD_SCHEMA_PATH=/opt/field_schema/fields.json

# (Opsional Fase 5) Codex CLI — uncomment saat siap & set CODEX_ENABLED=true:
# RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
#  && npm install -g @openai/codex && rm -rf /var/lib/apt/lists/*

CMD ["python", "-m", "pdfholmes_analyzer.worker"]
