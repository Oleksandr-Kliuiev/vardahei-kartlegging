# Production image of @varde/api (linux/amd64). Build context: varde/.
#   docker buildx build --platform linux/amd64 -f infra/Dockerfile . -t varde-api:<tag> --load
FROM node:22-alpine AS build
RUN npm i -g pnpm@11.11.0
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile --filter "@varde/api..." \
 && pnpm --filter @varde/api build \
 && pnpm deploy --filter @varde/api --prod /out

FROM node:22-alpine
ENV NODE_ENV=production \
    VARDE_CONFIG_DIR=/out/config
WORKDIR /out
COPY --from=build --chown=1000:1000 /out /out
# pnpm deploy does not ship varde/config/*.json; api reads db-budget, privacy, retention at run time.
COPY --chown=1000:1000 config/ /out/config/
USER 1000
CMD ["node","dist/main.js"]
