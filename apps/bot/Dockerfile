# Base stage
FROM node:20-slim AS base
WORKDIR /app

# Dependency stage
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Runner stage
FROM base AS runner
# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules

# Copy app files
COPY . .

# Start the bot
CMD ["npm", "start"]
