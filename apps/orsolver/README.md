# orsolver

A Rust service that solves [FlatZinc](https://www.minizinc.org/doc-latest/en/flatzinc.html) constraint models using [Google OR-Tools CP-SAT](https://developers.google.com/optimization). Deployed as a [Cloudflare Container](https://developers.cloudflare.com/containers/) behind a thin CF Worker proxy.

---

## Project structure

```
apps/orsolver/
├── Cargo.toml              # workspace root
├── Cargo.lock
├── Dockerfile              # multi-stage build: OR-Tools + Rust → slim runtime
├── wrangler.toml           # Cloudflare Containers config
├── src/
│   └── worker.js           # CF Worker proxy that forwards requests to the container
│
├── orsolver-sys/           # C++ FFI layer
│   ├── Cargo.toml
│   ├── build.rs            # clones OR-Tools, runs cmake, links libs, runs bindgen
│   ├── ortools_fzn.h       # C-compatible header (bindgen target)
│   ├── ortools_fzn.cpp     # thin shim over the OR-Tools FlatZinc C++ API
│   └── src/lib.rs          # includes bindgen-generated bindings
│
├── orsolver/               # safe Rust API over orsolver-sys
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs          # public solve() function + SolveResult / SolveStatus types
│       └── tests.rs        # integration tests against real OR-Tools
│
└── orsolver-server/        # Axum HTTP server
    ├── Cargo.toml
    └── src/
        └── main.rs         # routes: GET /health, POST /solve, POST /solve/batch
```

---

## How the build works

`orsolver-sys/build.rs` runs at compile time and:

1. Clones [OR-Tools v9.15](https://github.com/google/or-tools) into Cargo's `OUT_DIR` (skipped if already present — incremental builds are fast).
2. Builds OR-Tools with cmake: `BUILD_FLATZINC=ON`, `BUILD_DEPS=ON`, `BUILD_SHARED_LIBS=ON`. Bundled deps (absl, protobuf 5.x, re2, zlib) are compiled alongside.
3. Scans the cmake install `lib/` for shared libraries and emits `cargo:rustc-link-lib` directives.
4. Compiles `ortools_fzn.cpp` via the `cc` crate — a thin `extern "C"` shim that calls into the OR-Tools FlatZinc C++ API.
5. Generates Rust FFI bindings from `ortools_fzn.h` via `bindgen`.

### Profile-aware cmake build type

| Cargo profile | cmake `CMAKE_BUILD_TYPE` |
|---------------|--------------------------|
| `debug`       | `Debug`                  |
| `release`     | `Release`                |
| `bench`       | `RelWithDebInfo`         |

### Docker-only flags

When `IS_DOCKER=1` is set (injected by the Dockerfile), the build additionally applies:
- `CMAKE_INTERPROCEDURAL_OPTIMIZATION=OFF` — prevents lto-wrapper from spawning make subprocesses through Cargo's inherited jobserver pipe FDs (which are closed by the time cmake's grandchild processes run).
- `MAKEFLAGS=""` — lets cmake manage its own parallelism cleanly.

---

## Local development

### Prerequisites

- Rust (stable)
- cmake ≥ 3.26
- clang
- git
- python3 (required by OR-Tools cmake scripts)

### Build

```sh
cd apps/orsolver
cargo build                        # debug build (OR-Tools built in Debug mode)
cargo build --release              # release build
```

The first build takes ~10–20 minutes while OR-Tools compiles. Subsequent builds are incremental.

### Run

```sh
cargo run -p orsolver-server
# or
cargo run --release -p orsolver-server
```

The server listens on port `3000` by default. Override with `PORT=<n>`.

### Test

```sh
cargo test -p orsolver
```

Tests exercise the `solve()` API directly against OR-Tools — no HTTP layer involved.

---

## Docker

```sh
# Build image (compiles OR-Tools from source — takes ~15 min on first run)
docker build -t orsolver apps/orsolver

# Run
docker run -p 3000:3000 orsolver
```

Docker layer caching means subsequent builds only recompile changed Rust source.

---

## API

### `GET /health`

Returns `200 ok`.

---

### `POST /solve`

Solve a single FlatZinc model.

**Request**

```json
{ "model": "<flatzinc string>" }
```

**Response — success `200`**

```json
{
  "status": "sat" | "unsat" | "unknown",
  "output": "<raw solver output>"
}
```

**Response — parse/solve error `422`**

```json
{ "error": "<message>" }
```

**Example**

```sh
curl -X POST http://localhost:3000/solve \
  -H 'Content-Type: application/json' \
  -d '{"model":"var 1..3: x; constraint x > 1; solve satisfy;"}'
```

```json
{"status":"sat","output":"x = 2;\n----------\n"}
```

**Minimisation**

```sh
curl -X POST http://localhost:3000/solve \
  -H 'Content-Type: application/json' \
  -d '{"model":"var 1..10: x; constraint x >= 4; solve minimize x;"}'
```

```json
{"status":"sat","output":"x = 4;\n----------\n==========\n"}
```

**Unsatisfiable**

```sh
curl -X POST http://localhost:3000/solve \
  -H 'Content-Type: application/json' \
  -d '{"model":"var 1..3: x; constraint x > 5; solve satisfy;"}'
```

```json
{"status":"unsat","output":"=====UNSATISFIABLE=====\n"}
```

---

### `POST /solve/batch`

Solve multiple models in a single request. All jobs run concurrently. Results are keyed by the `id` you provide — order is not guaranteed.

**Request**

```json
{
  "jobs": [
    { "id": "<string>", "model": "<flatzinc string>" },
    ...
  ]
}
```

**Response `200`**

```json
{
  "results": {
    "<id>": { "status": "sat" | "unsat" | "unknown", "output": "..." },
    "<id>": { "error": "..." }
  }
}
```

**Example**

```sh
curl -X POST http://localhost:3000/solve/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "jobs": [
      { "id": "feasible",   "model": "var 1..3: x; constraint x > 1; solve satisfy;" },
      { "id": "optimal",    "model": "var 1..10: y; solve minimize y;" },
      { "id": "infeasible", "model": "var 1..3: z; constraint z > 5; solve satisfy;" }
    ]
  }'
```

```json
{
  "results": {
    "feasible":   { "status": "sat",   "output": "x = 2;\n----------\n" },
    "optimal":    { "status": "sat",   "output": "y = 1;\n----------\n==========\n" },
    "infeasible": { "status": "unsat", "output": "=====UNSATISFIABLE=====\n" }
  }
}
```

---

## Deployment (Cloudflare Containers)

The project is configured for [Cloudflare Containers](https://developers.cloudflare.com/containers/) via `wrangler.toml`. A lightweight CF Worker (`src/worker.js`) proxies requests to the container.

### Deploy

```sh
cd apps/orsolver
npx wrangler deploy
```

Wrangler builds the Docker image, pushes it to Cloudflare's registry, and deploys the Worker + Container binding automatically.

### Configuration (`wrangler.toml`)

```toml
name = "orsolver"
compatibility_date = "2026-04-22"
main = "src/worker.js"

[[containers]]
class_name = "OrSolver"
image = "."
max_instances = 3
```

`max_instances = 3` means up to three container instances can run in parallel, enabling Cloudflare to distribute concurrent solve requests across them.

---

## FlatZinc primer

FlatZinc is the low-level interchange format that MiniZinc compiles down to. You can produce a `.fzn` file from a MiniZinc model using:

```sh
minizinc --output-fzn-to-stdout --no-output-ozn -c model.mzn > model.fzn
```

Then pass the contents of `model.fzn` as the `"model"` field in a `/solve` request.
