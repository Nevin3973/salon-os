# Container image for DigitalOcean App Platform (and any other Docker host).
#
# Two things here are easy to get wrong and both have bitten this file:
#
#  1. `npm ci` runs the postinstall hook, which runs `prisma generate`. That
#     needs prisma/schema.prisma to exist, so the schema must be copied BEFORE
#     the install — not with the rest of the source afterwards. The previous
#     version copied only package*.json first and the build failed every time.
#
#  2. Linting and tests do not belong in an image build. CI already gates them,
#     and running them here makes every deploy slower while giving a broken
#     deploy the same symptom as a style warning.

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
# openssl is required by Prisma's query engine on Alpine.
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- build ----------
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma's client is generated from the schema, not from the database, so no
# connection is needed at build time.
RUN npx prisma generate && npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Bind to every interface: App Platform reaches the container from outside.
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
RUN apk add --no-cache openssl

# Run as a non-root user. A container that is root by default gives an attacker
# who finds an RCE a much easier next step.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# `standalone` carries its own minimal node_modules; static and public are not
# included in it and have to be copied alongside.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma's schema, migrations and engine are needed at runtime for `migrate
# deploy` and for the client to start.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 8080

# server.js is what `output: "standalone"` produces; `npm start` would run
# `next start`, which is not present in the standalone bundle.
CMD ["node", "server.js"]
