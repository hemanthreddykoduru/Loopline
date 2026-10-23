FROM node:22.11.0-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_INSFORGE_BASE_URL
ARG VITE_INSFORGE_ANON_KEY
ARG VITE_INSFORGE_FUNCTIONS_URL
ENV VITE_INSFORGE_BASE_URL=$VITE_INSFORGE_BASE_URL \
    VITE_INSFORGE_ANON_KEY=$VITE_INSFORGE_ANON_KEY \
    VITE_INSFORGE_FUNCTIONS_URL=$VITE_INSFORGE_FUNCTIONS_URL
RUN npm run build

EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4173/').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]
