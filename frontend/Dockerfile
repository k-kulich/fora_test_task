FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5173
# В продакшене можно использовать nginx, но для простоты используем Vite preview
# Здесь мы просто копируем статику в nginx, но в dev-режиме проще запустить vite dev сервер
# Вместо этого мы можем использовать отдельный контейнер для разработки, но я покажу универсальный вариант