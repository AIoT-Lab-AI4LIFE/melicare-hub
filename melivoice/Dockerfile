FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
COPY static/ ./static/
COPY scripts/ ./scripts/
ENV DATA_DIR=/data STATIC_DIR=/srv/static PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request as u;u.urlopen('http://127.0.0.1:8765/api/health')"
WORKDIR /srv/app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8765"]
