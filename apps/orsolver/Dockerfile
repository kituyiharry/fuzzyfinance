# ── Stage 1: Build OR-Tools + Rust binary ────────────────────────────────────
FROM rust:1-bookworm AS builder

# Debian bookworm ships cmake 3.25 which has a FetchContent PATCH_COMMAND bug
# that breaks OR-Tools' zlib sub-build. Install via pip to get 3.31+.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git clang libssl-dev pkg-config python3 python3-pip \
 && pip3 install --break-system-packages cmake \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY . .

# IS_DOCKER tells build.rs to disable LTO and clear MAKEFLAGS, preventing
# lto-wrapper from breaking cmake's make jobs via Cargo's inherited jobserver FDs.
ENV IS_DOCKER=1

RUN cargo build --release -p orsolver-server -vv

# Collect all OR-Tools shared libs the binary depends on into one directory
RUN mkdir -p /runtime-libs && \
    ldd /build/target/release/orsolver-server \
      | grep -oP '/\S+\.so[.\d]*' \
      | xargs -I{} cp --no-dereference {} /runtime-libs/ ; \
    # Also copy any .so symlinks so the soname chain resolves correctly
    find /build/target -name '*.so*' -exec cp --no-dereference {} /runtime-libs/ \; 2>/dev/null || true

# ── Stage 2: Slim runtime ─────────────────────────────────────────────────────
FROM debian:bookworm-slim

COPY --from=builder /build/target/release/orsolver-server /usr/local/bin/orsolver-server
COPY --from=builder /runtime-libs/ /usr/local/lib/ortools/

# Register the OR-Tools lib directory and refresh the cache
RUN echo /usr/local/lib/ortools > /etc/ld.so.conf.d/ortools.conf && ldconfig

EXPOSE 3000
ENV PORT=3000

CMD ["orsolver-server"]
