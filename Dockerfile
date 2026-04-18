FROM node:20-alpine3.20 AS frontend-builder

WORKDIR /app

COPY web/package*.json ./

RUN npm install

COPY web/ ./

# Ensure previous build artifacts do not leak into the new build.
RUN rm -rf dist

RUN npm run build

FROM node:20-alpine3.20 AS production

RUN apk add --no-cache \
    sqlite \
    openssl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

RUN mkdir -p database backups config certs web/dist defaults/config

COPY package*.json ./

RUN npm install

COPY app.js config.js db.js start-with-https.js ./
COPY routes/ ./routes/
COPY middleware/ ./middleware/
COPY utils/ ./utils/
COPY scripts/ ./scripts/
COPY config/ ./defaults/config/

COPY --from=frontend-builder /app/dist ./web/dist

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production

EXPOSE 3000/tcp
EXPOSE 3443/tcp

VOLUME ["/app/database", "/app/backups", "/app/config"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "start-with-https.js"]
