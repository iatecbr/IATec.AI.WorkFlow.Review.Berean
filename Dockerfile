# Dockerfile for Berean (AI-powered code review CLI)
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . ./

# Install dependencies (including devDependencies needed for build)
RUN npm install

# Build TypeScript sources
RUN npm run build
RUN npm link

# Use non-root user for security
RUN addgroup -g 1001 berean && adduser -u 1001 -G berean -s /bin/sh -D berean
USER berean

# Expose Fastify default port
EXPOSE 3000

# Default command: start Fastify web server
ENTRYPOINT ["node", "dist/index.js"]
CMD [ "web" ]