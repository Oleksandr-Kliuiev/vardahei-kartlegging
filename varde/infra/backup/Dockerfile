# Tools of the nightly backup (IMPROVEMENT-PLAN 0.1, ADR-016): pg_dump/pg_restore of the server's major,
# age, rclone, curl; docker-cli for restore.sh through `docker exec` into the PostgreSQL container. The scripts are not in the image: compose mounts /opt/varde/backup as /kit, so a
# script change needs no rebuild. Built on the VPS (README §5.2):
#   docker build -t varde-backup:pg17-1 /opt/varde/backup
# Bump the tag (VARDE_BACKUP_TAG) when this file changes.
FROM postgres:17-alpine
RUN apk add --no-cache age rclone curl bash coreutils tar gzip jq docker-cli flock
CMD ["/kit/backup.sh", "nightly"]
