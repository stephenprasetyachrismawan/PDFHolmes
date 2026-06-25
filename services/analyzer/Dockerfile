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

CMD ["python", "-m", "pdfholmes_analyzer.worker"]
