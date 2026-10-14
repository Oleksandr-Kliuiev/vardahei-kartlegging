# Production image of @varde/api (linux/amd64). Build context: varde/.
#   docker buildx build --platform linux/amd64 -f infra/Dockerfile . \
#     --build-arg VARDE_VERSION=<sha> -t varde-api:<sha> --load
# Migrations from this image:
#   docker run --rm -e DATABASE_URL=... varde-api:<tag> node node_modules/prisma/build/index.js migrate deploy
FROM node:22-alpine AS build
# Prisma engines on alpine need OpenSSL 3 (binaryTarget linux-musl-openssl-3.0.x).
RUN apk add --no-cache openssl && npm i -g pnpm@11.11.0
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile --filter "@varde/api..." \
 && pnpm --filter "@varde/api..." build \
 && pnpm deploy --filter @varde/api --prod /out
# pnpm >= 10 does not run dependency lifecycle scripts in the deployed tree, so the client and
# engines are generated here explicitly (prisma stays in api dependencies for migrate deploy).
WORKDIR /out
RUN node node_modules/prisma/build/index.js generate

FROM node:22-alpine
RUN apk add --no-cache openssl
# Commit sha of the image; GET /health returns it as `version`.
ARG VARDE_VERSION=dev
ENV VARDE_VERSION=${VARDE_VERSION} \
    NODE_ENV=production \
    VARDE_CONFIG_DIR=/out/config \
    PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /out
COPY --from=build --chown=1000:1000 /out /out
# pnpm deploy does not ship varde/config/*.json; api reads db-budget, privacy, retention at run time.
COPY --chown=1000:1000 config/ /out/config/
USER 1000
# No curl in alpine: the healthcheck uses node's fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node","-e","fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node","dist/main.js"]
