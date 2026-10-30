FROM node:22.23.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir pypdf==6.10.0
WORKDIR /app
COPY ask/ ask/
COPY tools/ask-river-tech/ tools/ask-river-tech/
ENV NODE_ENV=production ASK_DATA_DIR=/var/data ASK_INDEX_PATH=/var/data/website-index.json ASK_INDEX_PYTHON=/opt/venv/bin/python3
CMD ["node", "tools/ask-river-tech/launch/server.mjs"]
