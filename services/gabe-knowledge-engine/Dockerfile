FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY scripts ./scripts

RUN npm install --save-dev typescript && npx tsc -p tsconfig.json

ENV NODE_ENV=production
EXPOSE 4100

CMD ["node", "dist/src/index.js"]
