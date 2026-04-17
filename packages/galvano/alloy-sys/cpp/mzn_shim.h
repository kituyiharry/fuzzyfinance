/**
 * mzn_shim.h — extern "C" interface over the libminizinc C++ API.
 *
 * Two independent pipelines are exposed:
 *
 *   Pipeline A — end-to-end (MiniZinc → solution via libminizinc solver)
 *     mzn_solve(model, data, solver_id, timeout_ms, stdlib_dir)
 *
 *   Pipeline B — split (MiniZinc → FlatZinc → custom solver)
 *     mzn_compile(model, data, stdlib_dir) → MznCompileResult
 *     mzn_solve_fzn(fzn, solver_id, timeout_ms, stdlib_dir) → MznResult
 *
 * Pipeline B is the extensibility seam: compile once with libminizinc, then
 * hand the FlatZinc off to any solver backend — including one you write
 * yourself in Rust via the `alloy::SolverBackend` trait.
 *
 * Status integer mapping (MiniZinc::SolverInstance::Status):
 *   0 = UNKNOWN   1 = SAT   2 = OPT   3 = UNSAT
 *   4 = UNBOUNDED 5 = UNSAT_OR_UNBOUNDED 6 = ERROR 7 = NONE
 */

#ifndef ALLOY_MZN_SHIM_H
#define ALLOY_MZN_SHIM_H

#ifdef __cplusplus
extern "C" {
#endif

/* ── shared result types ─────────────────────────────────────────────────── */

/**
 * Returned by mzn_solve and mzn_solve_fzn.
 * Both `output` and `error` are strdup-allocated; call mzn_free_result().
 */
typedef struct {
    int   status;  /**< see status table above */
    char* output;  /**< solution text (NULL on hard error) */
    char* error;   /**< error message (NULL on success) */
    long  time_ms; /**< wall-clock ms for the call */
} MznResult;

/**
 * Returned by mzn_compile.
 * Call mzn_free_compile_result() when done.
 */
typedef struct {
    char* fzn;   /**< compiled FlatZinc source (NULL on error) */
    char* error; /**< error message (NULL on success) */
} MznCompileResult;

/* ── Pipeline A ─ end-to-end solve ─────────────────────────────────────── */

/**
 * Compile and solve a MiniZinc model in one step using libminizinc's built-in
 * solver selection.
 *
 * @param model_str   Complete .mzn source (UTF-8).
 * @param data_str    Optional .dzn data; appended to model. Pass NULL to omit.
 * @param solver_id   Solver ID (e.g. "org.gecode.gecode"). NULL → default.
 * @param timeout_ms  Solver time limit. 0 → no limit.
 * @param stdlib_dir  Path to the MiniZinc share/minizinc directory.
 */
MznResult mzn_solve(const char* model_str,
                    const char* data_str,
                    const char* solver_id,
                    int         timeout_ms,
                    const char* stdlib_dir);

/* ── Pipeline B ─ compile then solve ───────────────────────────────────── */

/**
 * Compile a MiniZinc model to FlatZinc without solving.
 * The returned `fzn` string is ready to pass to mzn_solve_fzn() or to a
 * custom Rust solver backend implementing `alloy::SolverBackend`.
 *
 * @param model_str  Complete .mzn source.
 * @param data_str   Optional .dzn data; NULL to omit.
 * @param stdlib_dir Path to share/minizinc.
 */
MznCompileResult mzn_compile(const char* model_str,
                              const char* data_str,
                              const char* stdlib_dir);

/**
 * Solve a precompiled FlatZinc model using libminizinc's built-in solver.
 * Use this when you want the libminizinc solver to be the backend for
 * Pipeline B (e.g. as the default `LibminizincBackend`).
 *
 * @param fzn_str    FlatZinc source (the `fzn` field from MznCompileResult).
 * @param solver_id  Solver ID. NULL → default.
 * @param timeout_ms Solver time limit. 0 → no limit.
 * @param stdlib_dir Path to share/minizinc.
 */
MznResult mzn_solve_fzn(const char* fzn_str,
                          const char* solver_id,
                          int         timeout_ms,
                          const char* stdlib_dir);

/* ── list available solvers ─────────────────────────────────────────────── */

/**
 * Return a NULL-terminated array of solver IDs known to libminizinc.
 * Free with mzn_free_solvers().
 */
char** mzn_list_solvers(const char* stdlib_dir);

/* ── memory management ───────────────────────────────────────────────────── */

void mzn_free_result(MznResult* r);
void mzn_free_compile_result(MznCompileResult* r);
void mzn_free_solvers(char** solvers);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* ALLOY_MZN_SHIM_H */
