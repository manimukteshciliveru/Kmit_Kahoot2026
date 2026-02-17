# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install all dependencies (including devDependencies if any needed for build scripts)
RUN npm ci

COPY . .

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM node:18-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy package.json and package-lock.json
COPY package*.json ./

# Copy built node_modules from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application code
COPY . .

# Create uploads and logs directories if they don't exist
RUN mkdir -p uploads logs && chown -R node:node uploads logs

# Use non-root user for security
USER node

EXPOSE 5000

CMD ["node", "server.js"]
