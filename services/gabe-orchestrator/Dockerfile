FROM node:22-alpine

WORKDIR /app

COPY services/gabe-orchestrator/package.json ./package.json
COPY services/gabe-orchestrator/tsconfig.json ./tsconfig.json
COPY services/gabe-orchestrator/src ./src
COPY services/gabe-validator ../gabe-validator

RUN npm install
RUN npm run build

CMD ["npm", "run", "start"]
