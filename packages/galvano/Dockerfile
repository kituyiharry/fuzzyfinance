# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: builder
#   - Compiles libminizinc from source as a static library.
#   - Compiles the alloy workspace (alloy-sys → alloy → alloy-server).
# ─────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS builder

ARG LIBMZN_TAG=2.9.5

# System dependencies
RUN apt-get update && apt-get upgrade && apt-get install -y --no-install-recommends \
        build-essential \
        cmake \ 
        libgecode49 \
        flatzinc \
        ninja-build \
        git \
        unzip \
        coinor-cbc \
        coinor-libcbc-dev \
        coinor-libcbc3 \
        libblas-dev \ 
        liblapack-dev \
        zlib1g-dev \ 
        libbz2-dev \
        flex \
        bison \
        pkg-config \
        libgmp-dev \
        zlib1g-dev \
        libclang-dev \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Rust (stable)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain stable --no-modify-path
ENV PATH="/root/.cargo/bin:${PATH}"

# Build libminizinc as a static library and install to /opt/minizinc
RUN git clone --depth 1 --branch "${LIBMZN_TAG}" \
        https://github.com/MiniZinc/libminizinc.git /src/libminizinc
RUN  chmod +x /src/libminizinc/download_vendor
RUN  /src/libminizinc/download_vendor
RUN  cmake -S /src/libminizinc -B /build/libminizinc \
        -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/opt/minizinc \
        -DBUILD_SHARED_LIBS=OFF \
        -DBUILD_MINIZINC=OFF \
        #-DHIGHS_PLUGIN=OFF \
        #-DCPLEX_PLUGIN=OFF \
        -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
        -DCMAKE_COMPILE_WARNING_AS_ERROR=OFF \
        #-DCMAKE_DISABLE_FIND_PACKAGE_CPlex=ON \
        #-DGUROBI_PLUGIN=OFF \
    && cmake --build /build/libminizinc --target install -j"$(nproc)"

# Copy workspace source
WORKDIR /workspace
COPY . /workspace/

# Build the binary — build.rs picks up MINIZINC_ROOT to skip the source-build path.
ENV MINIZINC_ROOT=/opt/minizinc
RUN cargo build --release -p alloy-server

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: runtime
#   - Minimal image; libstdc++ is already present in bookworm-slim.
#   - Copies the MiniZinc standard library (needed at runtime for .mzn builtins).
#   - Copies the compiled binary.
# ─────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# MiniZinc stdlib (share/minizinc/**) — required at solver runtime.
COPY --from=builder /opt/minizinc/share /opt/minizinc/share

# The compiled binary (named "alloy" per the [[bin]] target).
COPY --from=builder /workspace/target/release/alloy /usr/local/bin/alloy

ENV MZN_STDLIB_DIR=/opt/minizinc/share/minizinc
ENV ALLOY_PORT=3000
ENV RUST_LOG=info

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -fsS http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/local/bin/alloy"]
