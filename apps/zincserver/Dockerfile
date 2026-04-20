# ── Stage 1: Build MiniZinc compiler from source (native musl binary) ────────
FROM alpine:3.20 AS mzn-build

ARG MINIZINC_TAG=2.8.5

RUN apk add --no-cache git cmake make g++ bison flex

RUN git clone --depth 1 --branch ${MINIZINC_TAG} \
      https://github.com/MiniZinc/libminizinc.git /src \
 && cmake -S /src -B /build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/opt/minizinc \
 && cmake --build /build --parallel "$(nproc)" \
 && cmake --install /build

# ── Stage 2: Pull solver configs from the official bundle (text files only) ──
# The .msc files tell the native minizinc binary which globals to use during
# -c (flatten-only) mode; the actual solver binaries are not needed for that.
FROM alpine:3.20 AS bundle

ARG MINIZINC_TAG=2.8.5

RUN apk add --no-cache curl \
 && curl -fsSL \
      "https://github.com/MiniZinc/MiniZincIDE/releases/download/${MINIZINC_TAG}/MiniZincIDE-${MINIZINC_TAG}-bundle-linux-x86_64.tgz" \
    | tar -xz -C /opt \
 && mv "/opt/MiniZincIDE-${MINIZINC_TAG}-bundle-linux-x86_64" /opt/bundle

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine

COPY --from=mzn-build /opt/minizinc /opt/minizinc
# Overlay the full share tree from the bundle so solver .msc configs and their
# sibling include directories (e.g. share/minizinc/gecode/) are all present.
# Same version tag → stdlib content is identical; only solver dirs are additive.
COPY --from=bundle /opt/bundle/share/minizinc /opt/minizinc/share/minizinc

RUN ln -sf /opt/minizinc/bin/minizinc /usr/local/bin/minizinc

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src/ ./src/

EXPOSE 8080
ENV PORT=8080

CMD ["node", "src/server.js"]
