FROM alpine AS builder
LABEL maintainer="Kong Jun <kongjun18@outlook.com>"
WORKDIR /app
RUN apk add --no-cache --update nodejs npm
COPY package.json ./
RUN npm install --production

FROM alpine
WORKDIR /app
RUN apk add --no-cache --update nodejs
COPY --from=builder /app/node_modules ./node_modules
COPY ./ddns.js ./ddns.js
CMD ["node", "ddns.js"]
