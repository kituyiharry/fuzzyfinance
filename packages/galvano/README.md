# galvano — Constraint Modelling and Solvers

A Rust workspace that wraps [libminizinc](https://github.com/MiniZinc/libminizinc) and exposes it over HTTP.

## Workspace layout

```
galvano/
  alloy-sys/      Raw FFI — extern-C shim + bindgen-generated bindings
  alloy/          Safe Rust library — the public API over the C++ solver
  alloy-server/   Axum HTTP server binary that depends on alloy
  Dockerfile      Multi-stage build (debian:bookworm-slim)
  vendor/         Optional: git submodule for libminizinc source
```

The two concerns are deliberately separated:
- **`alloy`** is a reusable library. Another binary (CLI, WASM, etc.) can depend on it directly without pulling in the HTTP server.
- **`alloy-server`** is the deployment artifact. It has no constraint-solving logic of its own.

---

## HTTP API

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{"status":"ok","version":"…"}` |
| `GET` | `/solvers` | Lists available solver IDs |
| `POST` | `/solve` | Solve inline (JSON body) |
| `POST` | `/solve/files` | Solve from file upload (multipart/form-data) |

### `POST /solve` — JSON body

```json
{
  "model":      "var 1..10: x; constraint x > 5; solve satisfy;",
  "data":       null,
  "solver":     null,
  "timeout_ms": 5000
}
```

### Response

```json
{
  "status":  "sat",
  "output":  "x = 6;\n----------\n",
  "error":   null,
  "time_ms": 142
}
```

Status values: `sat` · `opt` · `unsat` · `unbounded` · `unsat_or_unbounded` · `unknown` · `error` · `timeout`

### `POST /solve/files` — multipart fields

| Field | Required | Notes |
|---|---|---|
| `model` | yes | `.mzn` file content |
| `data` | no | `.dzn` file content |
| `solver` | no | solver ID string |
| `timeout` | no | milliseconds as text |

---

## Local development

### Prerequisites

- Rust stable (edition 2024 / resolver 3 requires Rust ≥ 1.84)
- `cmake`, `ninja-build`, `git`, `libgmp-dev` (for source build)

### Option A — point at an existing install

```bash
export MINIZINC_ROOT=/opt/homebrew   # macOS example
cargo build -p alloy-server
```

### Option B — let build.rs fetch and compile libminizinc

```bash
# No MINIZINC_ROOT → build.rs clones libminizinc into $OUT_DIR on first run
cargo build -p alloy-server
```

Or add the repo as a git submodule for offline / reproducible builds:

```bash
git submodule add https://github.com/MiniZinc/libminizinc.git packages/galvano/vendor/libminizinc
git submodule update --init
```

### Run

```bash
MZN_STDLIB_DIR=/path/to/share/minizinc cargo run -p alloy-server

# Quick smoke test
curl -X POST http://localhost:3000/solve \
  -H 'Content-Type: application/json' \
  -d '{"model":"var 1..10: x; constraint x > 5; solve satisfy;","timeout_ms":5000}'
```

---

## Docker

Build and run from the `packages/galvano/` directory:

```bash
docker build -t galvano/alloy .
docker run --rm -p 3000:3000 galvano/alloy
curl http://localhost:3000/health
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `ALLOY_PORT` | `3000` | Listen port |
| `ALLOY_WORKER_LIMIT` | `8` | Max concurrent solver calls |
| `ALLOY_DEFAULT_TIMEOUT_MS` | `30000` | Default solver time limit (ms) |
| `MZN_STDLIB_DIR` | `/opt/minizinc/share/minizinc` | MiniZinc stdlib path |
| `RUST_LOG` | `info` | Log filter |

---

## Known limitations

- **No solver cancellation** — if the HTTP timeout fires, the blocking thread keeps running until the solver's internal `--time-limit` triggers.
- **Raw output** — responses contain the MiniZinc text stream. Use `--output-mode json` (Phase 2) for structured solutions.
- **No streaming** — all output is buffered in memory before responding.
- **Built-in solver only by default** — Gecode / Chuffed require rebuilding libminizinc with their `*_ROOT` CMake flags.
