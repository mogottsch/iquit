FROM node:20-alpine as build

WORKDIR /app

# Copy package.json and lock file
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy only necessary files for build
COPY . .

# Build the application
RUN pnpm build

# Verify what files were built
RUN find dist -type f | sort

# Production stage
FROM nginx:alpine

# Copy built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html

# Add nginx config for SPA routing with better asset handling
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  error_page 404 /index.html; \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
  location /assets/ { \
    try_files $uri =404; \
  } \
}' > /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"] 