FROM node:20-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod

COPY dist/ ./dist/

CMD ["node", "dist/index.js"]
