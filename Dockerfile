FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Expose port
EXPOSE 5000

# Jalankan migrasi, seeder otomatis, dan start server
CMD sh -c "npx prisma migrate deploy && npx prisma db seed && node server.js"
