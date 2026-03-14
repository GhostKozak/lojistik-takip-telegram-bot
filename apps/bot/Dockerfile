# Base stage for OS dependencies and Python
FROM node:20-slim AS base
WORKDIR /app

# Install system dependencies for OpenCV, Python, and EasyOCR/YOLO
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set up Python virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Dependency stage for Node.js
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
