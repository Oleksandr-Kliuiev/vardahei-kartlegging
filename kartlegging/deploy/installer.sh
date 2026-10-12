#!/usr/bin/env bash
# Køyrer på VPS-en. Startar kartlegginga og legg kartlegging.vardahei.tech til i den felles Caddy-en.
set -euo pipefail
APP=/opt/kartlegging
CADDYFILE=/etc/atlas-edge/Caddyfile
CADDY=atlas-edge-caddy-1
DOMENE=kartlegging.vardahei.tech

echo "1/4 Data og startkontoar"
mkdir -p "$APP/data"
chmod 700 "$APP/data"
if [ ! -f "$APP/data/brukarar.json" ]; then
  cp "$APP/deploy/brukarar.seed.json" "$APP/data/brukarar.json"
  chmod 600 "$APP/data/brukarar.json"
  echo "   Startkontoar lagt inn."
else
  echo "   Kontoar finst frå før, rører dei ikkje."
fi

echo "2/4 Startar containeren"
docker compose -f "$APP/deploy/compose.yaml" up -d --force-recreate
for i in $(seq 1 20); do
  if docker compose -f "$APP/deploy/compose.yaml" exec -T app wget -qO- http://127.0.0.1:3070/healthz >/dev/null 2>&1; then echo "   Appen svarar."; break; fi
  sleep 1
  [ "$i" = 20 ] && { echo "   Appen svarar ikkje. Loggar:"; docker compose -f "$APP/deploy/compose.yaml" logs --tail 40; exit 1; }
done

echo "3/4 Caddy"
if grep -q "^$DOMENE" "$CADDYFILE"; then
  echo "   $DOMENE finst alt i Caddyfile."
else
  KOPI="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$CADDYFILE" "$KOPI"
  # Skriv i same fil (same inode), elles ser ikkje Caddy-containeren endringa
  { cat "$KOPI"; printf '\n%s {\n\tencode zstd gzip\n\theader Strict-Transport-Security "max-age=31536000"\n\treverse_proxy kartlegging:3070\n}\n' "$DOMENE"; } > "$CADDYFILE.ny"
  cat "$CADDYFILE.ny" > "$CADDYFILE"; rm -f "$CADDYFILE.ny"
  if ! docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    echo "   Ny Caddyfile er ugyldig. Set tilbake den gamle."
    cat "$KOPI" > "$CADDYFILE"
    docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    exit 1
  fi
  echo "   Lagt til. Kopi av den gamle: $KOPI"
fi
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "   Caddy lasta på nytt. Sertifikatet kjem av seg sjølv i løpet av eit minutt."

echo "4/4 Lenkjer til kundane"
docker compose -f "$APP/deploy/compose.yaml" exec -T app node server.js --lenkjer
echo
echo "Ferdig: https://$DOMENE/admin"
