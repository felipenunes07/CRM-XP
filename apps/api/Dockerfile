# Use Node.js as the base image
FROM node:22-slim

# Install system dependencies for some packages if needed
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy the entire monorepo
COPY . .

# Install dependencies (using workspaces)
RUN npm install

# Build the shared package and the API
RUN npm run build -w @olist-crm/shared
RUN npm run build -w @olist-crm/api

# Expose the API port
EXPOSE 4000

# Set environment to production
ENV NODE_ENV=production

# Start the API and the worker
# In a real VPS, you might want to run them separately or use PM2
# For simplicity in Docker, we can use a script or concurrently
CMD ["npm", "run", "start:api", "-w", "@olist-crm/api"]
