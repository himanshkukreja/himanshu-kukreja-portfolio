#!/bin/sh
# judge-lite entrypoint: prepare cgroup v2 delegation for isolate, then drop to
# the unprivileged "judge" user and exec the gateway.
set -eu

CG=/sys/fs/cgroup
if [ "${JUDGE_SANDBOX:-isolate}" = "isolate" ]; then
  if [ ! -f "$CG/cgroup.controllers" ]; then
    echo "judge: cgroup v2 is not mounted at $CG (run with --privileged --cgroupns=private)" >&2
    exit 1
  fi
  if [ ! -w "$CG/cgroup.subtree_control" ]; then
    echo "judge: $CG is read-only (run with --privileged --cgroupns=private)" >&2
    exit 1
  fi
  # cgroup v2 "no internal processes" rule: move every process in the
  # container's root cgroup into a leaf, so controllers can be delegated.
  mkdir -p "$CG/init" "$CG/isolate"
  while read -r pid; do
    echo "$pid" > "$CG/init/cgroup.procs" 2>/dev/null || true
  done < "$CG/cgroup.procs"
  for c in cpu memory pids; do
    if grep -qw "$c" "$CG/cgroup.controllers"; then
      echo "+$c" > "$CG/cgroup.subtree_control"
      echo "+$c" > "$CG/isolate/cgroup.subtree_control"
    fi
  done
  mkdir -p /run/isolate/locks
  chmod 0755 /run/isolate /run/isolate/locks
  # The box root must be owned by root and writable by nobody else.
  mkdir -p /var/local/lib/isolate
  chown root:root /var/local/lib/isolate
  chmod 0755 /var/local/lib/isolate
  /usr/local/bin/isolate --check-config >/dev/null
fi

# Private scratch space for the gateway (meta files, fallback-sandbox dirs).
JUDGE_WORK_DIR="${JUDGE_WORK_DIR:-/run/judge}"
mkdir -p "$JUDGE_WORK_DIR"
chown judge:judge "$JUDGE_WORK_DIR"
chmod 0700 "$JUDGE_WORK_DIR"
export JUDGE_WORK_DIR HOME=/tmp

# The gateway itself is unprivileged; only the setuid isolate binary is root.
exec setpriv --reuid=judge --regid=judge --init-groups -- "$@"
