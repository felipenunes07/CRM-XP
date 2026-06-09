FROM node:22-slim

WORKDIR /app

COPY . .

RUN npm ci

RUN npm run build -w @olist-crm/shared
RUN npm run build -w @olist-crm/api

EXPOSE 4000

ENV NODE_ENV=production

CMD ["npm", "run", "start", "-w", "@olist-crm/api"]
