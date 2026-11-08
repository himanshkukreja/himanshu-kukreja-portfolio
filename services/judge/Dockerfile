# judge-lite: gateway + toolchains + isolate in one image.
# Production runs this image privileged on the Lightsail VM (isolate needs to
# create namespaces and cgroups); the sandboxed code itself runs as an
# unprivileged per-box uid inside isolate. See README.md, "Security".

# ---------------------------------------------------------------------------
# Stage 1: build isolate from a pinned upstream tag.
# ---------------------------------------------------------------------------
FROM ubuntu:24.04 AS isolate-build
ARG ISOLATE_TAG=v2.7
ARG ISOLATE_COMMIT=8f185bb37f3f23e29b33b0c7727c91c13429abe3
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential git ca-certificates pkg-config libcap-dev libseccomp-dev \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "$ISOLATE_TAG" https://github.com/ioi/isolate.git /src/isolate \
 && cd /src/isolate \
 && test "$(git rev-parse HEAD)" = "$ISOLATE_COMMIT" \
 && make isolate

# ---------------------------------------------------------------------------
# Stage 2: runtime.
# ---------------------------------------------------------------------------
FROM ubuntu:24.04
ARG NODE_VERSION=22.23.4
ARG TARGETARCH
ENV DEBIAN_FRONTEND=noninteractive

# Toolchains: g++ 13 (Ubuntu 24.04 default), OpenJDK 21, Python 3.12.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      g++ libc6-dev openjdk-21-jdk-headless python3 \
      ca-certificates curl xz-utils libcap2 libseccomp2 \
 && rm -rf /var/lib/apt/lists/* \
 && g++ --version | head -1 && python3 --version \
 # Stable JDK path for both amd64 and arm64 (inside /usr, which isolate binds).
 && ln -s "$(dirname "$(dirname "$(readlink -f "$(which javac)")")")" /usr/lib/jvm/jdk21 \
 && /usr/lib/jvm/jdk21/bin/java -version

# Precompiled <bits/stdc++.h> for the exact flags the judge uses (see
# src/languages.ts). Cuts a typical C++ compile from ~0.45 s to ~0.09 s of CPU.
# GCC picks the matching file from the .gch directory and silently falls back
# to normal parsing if the flags differ, so a mismatch only costs speed.
RUN set -eux; \
    H="$(echo '#include <bits/stdc++.h>' | g++ -x c++ -H -fsyntax-only - 2>&1 | head -1 | cut -d' ' -f2)"; \
    test -f "$H"; mkdir -p "$H.gch"; \
    for std in c++17 c++20; do g++ -std=$std -O2 -DONLINE_JUDGE -x c++-header "$H" -o "$H.gch/$std"; done; \
    chmod -R a+rX "$H.gch"

# Node 22 from the official tarball, checksum-verified. Used both for the
# gateway and (read-only, inside the sandbox) for server-side JS judging.
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in amd64) NARCH=x64 ;; arm64) NARCH=arm64 ;; *) echo "unsupported arch"; exit 1 ;; esac; \
    cd /tmp; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NARCH}.tar.xz"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    grep " node-v${NODE_VERSION}-linux-${NARCH}.tar.xz\$" SHASUMS256.txt | sha256sum -c -; \
    tar -xJf "node-v${NODE_VERSION}-linux-${NARCH}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner \
      --exclude='*/include' --exclude='*/share/doc' --exclude='*/share/man'; \
    rm -f node-*.tar.xz SHASUMS256.txt; \
    node --version

# isolate, setuid root so the gateway can run as an unprivileged user.
COPY --from=isolate-build /src/isolate/isolate /usr/local/bin/isolate
RUN chmod 4755 /usr/local/bin/isolate \
 && mkdir -p /usr/local/etc /var/local/lib/isolate \
 && chmod 0755 /var/local/lib/isolate
COPY docker/isolate.cf /usr/local/etc/isolate

# Gateway (no runtime npm dependencies; Node runs the TypeScript directly).
RUN useradd --system --uid 1001 --home-dir /app --shell /usr/sbin/nologin judge
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY docker/entrypoint.sh /usr/local/bin/judge-entrypoint
RUN chmod 0755 /usr/local/bin/judge-entrypoint && chown -R root:root /app && chmod -R a+rX /app

ENV NODE_ENV=production \
    JUDGE_PORT=8080 \
    JUDGE_SANDBOX=isolate
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/livez || exit 1
ENTRYPOINT ["/usr/local/bin/judge-entrypoint"]
CMD ["node", "--disable-warning=ExperimentalWarning", "/app/src/server.ts"]
