#!/usr/bin/env bash
# Chạy MELI Voice độc lập: ./run.sh  ->  http://localhost:8765
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8765}"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
if [ -f .env ]; then set -a; . ./.env; set +a; fi
[ -n "$OPENAI_API_KEY" ] || echo "⚠  Chưa có OPENAI_API_KEY (điền vào file .env) - giao diện vẫn chạy nhưng không xử lý được audio."
cd app
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
