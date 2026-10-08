# One container: builds the frontend, then serves it and the API from FastAPI.
#   docker build -t research-notebook .
#   docker run -p 8000:8000 -v nbdata:/data -e NB_SECRET_KEY=... research-notebook
# Put it behind HTTPS (see docs/DEPLOY_AWS.md); the CMD trusts X-Forwarded-* from the proxy.

FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY backend/scripts backend/scripts
COPY --from=web /app/dist dist
RUN useradd --system --create-home --uid 10001 nb && mkdir /data && chown nb /data
USER nb
ENV NB_AUTH_MODE=accounts \
    NB_DB_PATH=/data/notebook.db
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"
WORKDIR /app/backend
# Set NB_SECRET_KEY explicitly in production (otherwise a key file is created in /data).
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
