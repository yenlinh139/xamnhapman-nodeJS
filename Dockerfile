FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p logs src/uploads

EXPOSE 4000

CMD ["node", "./src/server.js"]
