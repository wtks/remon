FROM node:10.10.0-alpine as build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
RUN yarn build

FROM pierrezemb/gostatic
EXPOSE 80
COPY --from=build /app/dist /srv/http
CMD ["-fallback", "/index.html", "-port", "80"]
