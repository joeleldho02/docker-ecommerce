FROM node:18-alpine

COPY . /app/

WORKDIR /app

RUN npm install
RUN npm rebuild bcrypt

CMD ["node", "server.js"]