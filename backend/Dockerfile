# Node 22 LTS (soporte hasta abril 2027). Node 20 salio de soporte en abril
# de 2026 y ya no recibe parches de seguridad. Debe coincidir con .nvmrc y con
# la version usada en el CI.
FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# npm ci (no npm install): la imagen de produccion se construye exactamente
# desde el lock file, sin resolver versiones nuevas en cada build.
COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]