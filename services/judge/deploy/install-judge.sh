#!/usr/bin/env bash
# Build (or load) the judge image and (re)start the systemd service.
# Run on the VM as root, from the repo checkout (e.g. /opt/judge-lite):
#
#   sudo bash services/judge/deploy/install-judge.sh            # build image on the VM
#   sudo IMAGE_TAR=/tmp/judge-lite.tar bash .../install-judge.sh # or load a prebuilt image (docker save)
#
# First run creates /etc/judge/judge.env with two fresh HMAC secrets (prod and
# staging) and prints them ONCE so you can put them in the Workers with
# `wrangler secret put JUDGE_HMAC_SECRET`. Later runs keep the existing file.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "run as root (sudo)"; exit 1; fi
HERE="$(cd "$(dirname "$0")" && pwd)"
SVC_DIR="$(cd "$HERE/.." && pwd)"
ENV_FILE=/etc/judge/judge.env
TAG="judge-lite:$(date -u +%Y%m%d%H%M%S)"

echo "==> image"
if [ -n "${IMAGE_TAR:-}" ]; then
  loaded="$(docker load -i "$IMAGE_TAR" | sed -n 's/^Loaded image: //p' | tail -1)"
  docker tag "$loaded" "$TAG"
else
  docker build -t "$TAG" "$SVC_DIR"
fi
docker tag "$TAG" judge-lite:current

echo "==> secrets"
install -d -m 0700 -o root -g root /etc/judge
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  PROD="$(openssl rand -hex 32)"
  STAGING="$(openssl rand -hex 32)"
  sed -e "s/^JUDGE_HMAC_SECRETS=.*/JUDGE_HMAC_SECRETS=prod:${PROD},staging:${STAGING}/" "$HERE/judge.env.example" > "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
  cat <<EOF

  Created $ENV_FILE with two new HMAC secrets. Copy them now; they are not shown again
  (they stay readable by root in $ENV_FILE).

    production Worker:  JUDGE_KEY_ID=prod      JUDGE_HMAC_SECRET=${PROD}
    staging Worker:     JUDGE_KEY_ID=staging   JUDGE_HMAC_SECRET=${STAGING}

EOF
else
  echo "keeping existing $ENV_FILE"
fi

echo "==> systemd unit"
install -m 0644 "$HERE/judge.service" /etc/systemd/system/judge.service
MEM_KB="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
CONTAINER_MB=$(( MEM_KB * 85 / 100 / 1024 ))
mkdir -p /etc/systemd/system/judge.service.d
cat > /etc/systemd/system/judge.service.d/10-memory.conf <<EOF
[Service]
Environment=JUDGE_CONTAINER_MEMORY=${CONTAINER_MB}m
EOF
systemctl daemon-reload
systemctl enable judge.service
systemctl restart judge.service

echo "==> waiting for the gateway"
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/livez >/dev/null 2>&1; then break; fi
  sleep 2
done
if curl -fsS http://127.0.0.1:8080/livez >/dev/null; then
  echo "judge is up on 127.0.0.1:8080 (container memory cap ${CONTAINER_MB} MB)"
else
  echo "judge did not come up; check: journalctl -u judge -n 100"; exit 1
fi

# Keep the three most recent images for rollback, remove older ones.
docker images judge-lite --format '{{.Tag}}' | grep -E '^[0-9]{14}$' | sort -r | tail -n +4 | xargs -r -I{} docker rmi "judge-lite:{}" >/dev/null 2>&1 || true
echo "rollback: docker tag judge-lite:<older-tag> judge-lite:current && systemctl restart judge"
