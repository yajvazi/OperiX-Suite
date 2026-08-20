FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.source
RUN python -c 'exec("from pathlib import Path\nsource=Path(\"/tmp/requirements.source\").read_bytes()\ntext=None\nfor encoding in (\"utf-8\", \"utf-16\"):\n    try:\n        text=source.decode(encoding)\n        break\n    except UnicodeDecodeError:\n        pass\nif text is None: raise SystemExit(\"requirements file is not valid UTF-8 or UTF-16\")\nPath(\"/tmp/requirements.normalized.txt\").write_text(text, encoding=\"utf-8\")")'
RUN pip install --no-cache-dir -r /tmp/requirements.normalized.txt

COPY . .

EXPOSE 8002

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
