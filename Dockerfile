FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice \
       poppler-utils \
       fonts-dejavu \
       fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 5000

CMD ["node", "src/server.js"]
