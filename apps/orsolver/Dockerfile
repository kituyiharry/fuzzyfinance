# ── Stage 1: Build OR-Tools + Rust binary ────────────────────────────────────
FROM rust:1-bookworm AS builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      cmake git clang libssl-dev pkg-config python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY . .

# build.rs clones OR-Tools v9.15 into OUT_DIR and builds shared libs
RUN cargo build --release -p orsolver-server

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
