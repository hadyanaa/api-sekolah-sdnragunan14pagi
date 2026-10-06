FROM node:20-slim

# Install OpenSSL (Prisma engine), audio player mpg123, dan tzdata (zona waktu WIB)
RUN apt-get update -y && apt-get install -y openssl ca-certificates mpg123 alsa-utils tzdata
ENV TZ="Asia/Jakarta"

# Set default ALSA device ke Card 1 (Intel PCH pada server)
RUN printf "defaults.pcm.card 1\ndefaults.ctl.card 1\n" > /etc/asound.conf

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
