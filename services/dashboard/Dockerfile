FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm install -g vite
EXPOSE 3000
CMD ["vite", "--host", "0.0.0.0", "--port", "3000"]
