FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
