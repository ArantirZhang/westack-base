FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Manually ensure non-TS files are copied (Alpine-compatible)
RUN mkdir -p dist/services/api/graphql && \
    cp src/services/api/graphql/schema.graphql dist/services/api/graphql/ && \
    mkdir -p dist/database/graph-schema && \
    cp src/database/graph-schema/*.cypher dist/database/graph-schema/ || true

# Verify files exist
RUN ls -la dist/services/api/graphql/ && ls -la dist/database/graph-schema/

# Production image
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose API port
EXPOSE 8080

# Health check - test GraphQL endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').request({hostname:'localhost',port:8080,path:'/',method:'POST',headers:{'Content-Type':'application/json'}},r=>{r.on('data',()=>{});r.on('end',()=>process.exit(r.statusCode===200?0:1))}).on('error',()=>process.exit(1)).end('{\"query\":\"{hello}\"}')"

# Start application
CMD ["node", "dist/index.js"]
