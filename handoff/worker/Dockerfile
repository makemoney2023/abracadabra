FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav clamav-daemon ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
COPY worker/clamd.conf /etc/clamav/clamd.conf
COPY worker/start.sh /start.sh
RUN chmod +x /start.sh

ENV PORT=8080
EXPOSE 8080
CMD ["/start.sh"]
