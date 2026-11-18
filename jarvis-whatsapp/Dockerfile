FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY prompts ./prompts
ENV NODE_ENV=production DATA_DIR=/app/data
# Monte um volume em /app/data para não perder conversas e leads a cada deploy
VOLUME /app/data
EXPOSE 3000
CMD ["node", "src/server.js"]
