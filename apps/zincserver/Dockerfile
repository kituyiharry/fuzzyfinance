# ── Stage 1: Build COIN-OR stack (CoinUtils → Osi → Clp → Cgl → Cbc) ────────
FROM alpine:3.20 AS coin-build

RUN apk add --no-cache git autoconf libtool automake clang make pkgconf bison flex zlib-dev curl blas

ENV OSTYPE=linux
ENV COIN_PREFIX=/opt/coin
ENV PKG_CONFIG_PATH=/opt/coin/lib/pkgconfig
ENV CC=clang
ENV CXX=clang++

RUN git clone --depth 1 --branch releases/2.11.13 \
      https://github.com/coin-or/CoinUtils.git /coin/CoinUtils \
 && cd /coin/CoinUtils \
 && ./configure --prefix=$COIN_PREFIX --disable-shared --enable-static --disable-bzlib --without-zlib \
 && make -j"$(nproc)" && make install

RUN git clone --depth 1 --branch releases/0.108.12 \
      https://github.com/coin-or/Osi.git /coin/Osi \
 && cd /coin/Osi \
 && ./configure --prefix=$COIN_PREFIX --disable-shared --enable-static --disable-bzlib \
 && make -j"$(nproc)" && make install

RUN git clone --depth 1 --branch releases/1.17.11 \
      https://github.com/coin-or/Clp.git /coin/Clp \
 && cd /coin/Clp \
 && ./configure --prefix=$COIN_PREFIX --disable-shared --enable-static --disable-bzlib \
 && make -j"$(nproc)" && make install

RUN git clone --depth 1 --branch releases/0.60.10 \
      https://github.com/coin-or/Cgl.git /coin/Cgl \
 && cd /coin/Cgl \
 && ./configure --prefix=$COIN_PREFIX --disable-shared --enable-static --disable-bzlib \
 && make -j"$(nproc)" && make install

RUN git clone --depth 1 --branch releases/2.10.13 \
      https://github.com/coin-or/Cbc.git /coin/Cbc \
 && cd /coin/Cbc \
 && ./configure --prefix=$COIN_PREFIX --disable-shared --enable-static --disable-bzlib \
 && make -j"$(nproc)" && make install

# ── Stage 2: Build Gecode ─────────────────────────────────────────────────────
FROM alpine:3.20 AS gecode-build

RUN apk add --no-cache git clang sed tar perl make

ENV CC=clang
ENV CXX=clang++

RUN git clone --depth 1 --branch release/6.3.0 \
      https://github.com/Gecode/gecode.git /gecode \
 && cd /gecode \
 && ./configure \
      --prefix=/opt/gecode \
      --disable-examples \
      --disable-doc \
      --disable-qt \
      --disable-gist \
 && make -j"$(nproc)" && make install

# ── Stage 3: Build MiniZinc compiler from source ─────────────────────────────
FROM alpine:3.20 AS mzn-build

ARG MINIZINC_TAG=2.9.4

RUN apk add --no-cache git cmake make clang bison flex zlib-dev curl blas pkgconf

ENV OSTYPE=linux
ENV MZNARCH=linux
ENV PKG_CONFIG_PATH=/opt/coin/lib/pkgconfig

COPY --from=coin-build /opt/coin /opt/coin
COPY --from=gecode-build /opt/gecode /opt/gecode

RUN git clone --depth 1 --branch ${MINIZINC_TAG} \
      https://github.com/MiniZinc/libminizinc.git /src \
 && /bin/sh /src/download_vendor \
 && cmake -S /src -B /build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/opt/minizinc \
      -DOsiCBC_ROOT=/opt/coin \
      -DGecode_ROOT=/opt/gecode \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
 && cmake --build /build --parallel "$(nproc)" \
 && cmake --install /build

# ── Stage 4: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine

COPY --from=mzn-build /opt/minizinc /opt/minizinc
COPY --from=coin-build /opt/coin/bin/cbc /opt/coin/bin/cbc
COPY --from=gecode-build /opt/gecode/bin /opt/gecode/bin
COPY --from=gecode-build /opt/gecode/lib /opt/gecode/lib

ENV LD_LIBRARY_PATH=/opt/gecode/lib

RUN ln -sf /opt/minizinc/bin/minizinc /usr/local/bin/minizinc

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src/ ./src/

EXPOSE 8080
ENV PORT=8080

CMD ["node", "src/server.js"]
