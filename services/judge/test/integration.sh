#!/usr/bin/env bash
# Builds the judge image, starts it the way production runs it (privileged for
# isolate, read-only root filesystem, tmpfs scratch, port on 127.0.0.1 only),
# and judges the sample solutions in test/integration.ts.
#
#   bash test/integration.sh            # build + run all cases
#   ONLY=java bash test/integration.sh  # only cases whose name contains "java"
#   KEEP=1 bash test/integration.sh     # leave the container running afterwards
#   PLATFORM=linux/amd64 bash test/integration.sh  # build/run the x86-64 image (Lightsail's arch)
set -euo pipefail

cd "$(dirname "$0")/.."
IMAGE="${IMAGE:-judge-lite:test}"
NAME="${NAME:-judge-lite-it}"
PORT="${PORT:-18080}"
SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"

echo "==> building $IMAGE"
docker build ${PLATFORM:+--platform "$PLATFORM"} -t "$IMAGE" .

docker rm -f "$NAME" >/dev/null 2>&1 || true
echo "==> starting $NAME on 127.0.0.1:$PORT"
docker run -d --name "$NAME" ${PLATFORM:+--platform "$PLATFORM"} \
  --privileged --cgroupns=private --init \
  --read-only \
  --tmpfs /run:rw,nosuid,nodev,mode=0755,size=64m \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777,size=64m \
  --tmpfs /var/local/lib/isolate:rw,exec,nosuid,nodev,mode=0755,size=512m \
  --memory 2g --cpus 2 \
  -e JUDGE_HMAC_SECRET="$SECRET" \
  -e JUDGE_WORKERS=2 \
  -e JUDGE_TESTSET_DIR=/testsets \
  -v "$PWD/test/fixtures/testsets:/testsets:ro" \
  -p "127.0.0.1:$PORT:8080" \
  "$IMAGE" >/dev/null

cleanup() {
  if [ -z "${KEEP:-}" ]; then docker rm -f "$NAME" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/livez" >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -fsS "http://127.0.0.1:$PORT/livez" >/dev/null; then
  echo "judge did not come up"; docker logs "$NAME"; exit 1
fi

ARCH="$(docker exec "$NAME" uname -m)"
echo "==> judge is up (container arch: $ARCH)"
status=0
JUDGE_URL="http://127.0.0.1:$PORT" JUDGE_HMAC_SECRET="$SECRET" JUDGE_ARCH="$ARCH" \
  node --disable-warning=ExperimentalWarning test/integration.ts || status=$?

echo "==> last gateway log lines"
docker logs --tail 5 "$NAME"
exit $status
