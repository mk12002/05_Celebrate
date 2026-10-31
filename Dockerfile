# Small production image for Cloud Run / Render / any container host.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src ./src
COPY public ./public

# Run as the unprivileged user that ships with the node image.
USER node
EXPOSE 8080
CMD ["node", "server.js"]
