# =============================================================================
# fraud-dashboard — Next.js 16 production image
# Build context: fake_job_detector/dashboard/
#
# Multi-stage build:
#   Stage 1 (builder): installs all deps, bakes NEXT_PUBLIC_* env vars, builds
#   Stage 2 (runner):  minimal Node runtime + only the built artifacts
#
# NEXT_PUBLIC_* variables are embedded at BUILD time by Next.js.
# Pass them as build args in docker-compose so the browser can reach the API
# via the host-side port-forward (default: localhost:8000).
# =============================================================================

# ---- Stage 1: builder -------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies. npm install is used because no package-lock.json
# exists in the repo; it generates one during the build.
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy the rest of the source
COPY . .

# Build-time public env vars — browser fetches API through the host port-forward
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8000

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- Stage 2: runner --------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user matching Next.js conventions
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001 -G nodejs

# Copy only what the production server needs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD wget -qO- http://localhost:3000 > /dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
