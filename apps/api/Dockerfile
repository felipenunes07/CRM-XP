FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm ci

RUN npm run build -w @olist-crm/shared
RUN npm run build -w @olist-crm/api

EXPOSE 4000

ENV NODE_ENV=production

CMD ["npm", "run", "start", "-w", "@olist-crm/api"]
