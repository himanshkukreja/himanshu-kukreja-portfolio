#!/usr/bin/env bash
# One-time hardening + prerequisites for the judge VM.
# Target: AWS Lightsail, Ubuntu 24.04 LTS, 2 vCPU / 2 GB (beta) or 4 GB (launch), ap-south-1 (Mumbai).
#
# Run as root (sudo) on a fresh instance:
#   sudo bash bootstrap-vm.sh
# Optional: CLOUDFLARED_TOKEN=<token from the Zero Trust dashboard> sudo -E bash bootstrap-vm.sh
#
# What it does (idempotent; safe to re-run):
#   1. apt upgrade; unattended-upgrades for security updates (auto-reboot 03:30 IST if a kernel needs it)
#   2. ufw: deny all incoming except SSH (22/tcp); allow outgoing
#   3. sshd: key-only, no root login
#   4. Docker Engine from Docker's apt repo, with json-file log rotation
#   5. journald size cap (log rotation for cloudflared and system logs)
#   6. cloudflared from Cloudflare's apt repo (+ service install if CLOUDFLARED_TOKEN is set)
#   7. /etc/judge (root-only) for the env file
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "run as root (sudo)"; exit 1; fi
. /etc/os-release
if [ "${VERSION_ID:-}" != "24.04" ]; then echo "warning: tested on Ubuntu 24.04, this is ${PRETTY_NAME:-unknown}"; fi
export DEBIAN_FRONTEND=noninteractive

echo "==> 1/7 packages and unattended-upgrades"
apt-get update -y
apt-get -o Dpkg::Options::=--force-confold upgrade -y
apt-get install -y --no-install-recommends ca-certificates curl gnupg git openssl ufw unattended-upgrades apt-listchanges jq

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52judge-unattended <<'EOF'
// judge-lite: security updates only; reboot at 22:00 UTC (03:30 IST) when required.
Unattended-Upgrade::Allowed-Origins {
        "${distro_id}:${distro_codename}-security";
        "${distro_id}ESMApps:${distro_codename}-apps-security";
        "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "22:00";
EOF
systemctl enable --now unattended-upgrades

echo "==> 2/7 firewall (ufw): deny incoming except 22/tcp"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp comment 'SSH (rate limited)'
ufw --force enable
ufw status verbose

echo "==> 3/7 sshd: keys only, no root login"
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-judge-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
X11Forwarding no
MaxAuthTries 4
EOF
sshd -t && systemctl reload ssh

echo "==> 4/7 Docker Engine"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
fi
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
EOF
systemctl enable docker
systemctl restart docker

echo "==> 5/7 journald size cap"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/99-judge.conf <<'EOF'
[Journal]
SystemMaxUse=300M
SystemMaxFileSize=50M
MaxRetentionSec=30day
EOF
systemctl restart systemd-journald

echo "==> 6/7 cloudflared"
if ! command -v cloudflared >/dev/null 2>&1; then
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -y
  apt-get install -y cloudflared
fi
if [ -n "${CLOUDFLARED_TOKEN:-}" ]; then
  if systemctl list-unit-files | grep -q '^cloudflared.service'; then
    echo "cloudflared service already installed; skipping (uninstall first to change the token)"
  else
    cloudflared service install "$CLOUDFLARED_TOKEN"
  fi
else
  echo "CLOUDFLARED_TOKEN not set: run 'sudo cloudflared service install <token>' later (see README, Deploy runbook)"
fi

echo "==> 7/7 /etc/judge"
install -d -m 0700 -o root -g root /etc/judge

# cgroup v2 is required by isolate 2.x (Ubuntu 24.04 default).
if [ "$(stat -fc %T /sys/fs/cgroup)" != "cgroup2fs" ]; then
  echo "ERROR: /sys/fs/cgroup is not cgroup v2"; exit 1
fi
# isolate recommends no swap (memory limits do not cover swapped pages).
if swapon --show | grep -q .; then echo "warning: swap is enabled; isolate recommends turning it off (swapoff -a, remove from /etc/fstab)"; fi

echo
echo "Bootstrap done. Next: sudo bash deploy/install-judge.sh (from the repo checkout)."
