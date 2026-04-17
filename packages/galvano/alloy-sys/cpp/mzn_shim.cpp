/**
 * mzn_shim.cpp
 *
 * Design rules (unchanged from the original):
 *  - Every code path is wrapped in try/catch (...) — no C++ exception
 *    ever crosses the FFI boundary.
 *  - MznSolver is constructed fresh per call (not thread-safe).
 *  - All strings returned to Rust are strdup()-allocated.
 *  - Output is captured via std::ostringstream, never via std::cout.
 *
 * mzn_solve_fzn writes the FlatZinc to a uniquely-named temp file because
 * MznSolver::run() infers model type from file extension (.fzn → FlatZinc).
 */

#include "mzn_shim.h"

// MznSolver and SolverInstance::Status
//#include <minizinc/MznSolver.hh>
#include <minizinc/solver.hh>
#include <minizinc/timer.hh>
// SolverConfigs (for mzn_list_solvers)
#include <minizinc/solver_config.hh>

#include <atomic>
#include <chrono>
#include <vector>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#  include <process.h>
#  define getpid _getpid
#else
#  include <unistd.h>
#endif

/* ── helpers ──────────────────────────────────────────────────────────────── */

static char* dup(const std::string& s) { return strdup(s.c_str()); }

static MznResult make_error(const std::string& msg, long ms) {
    MznResult r;
    r.status  = 6; /* ERROR */
    r.output  = nullptr;
    r.error   = dup(msg);
    r.time_ms = ms;
    return r;
}

static MznCompileResult make_compile_error(const std::string& msg) {
    MznCompileResult r;
    r.fzn   = nullptr;
    r.error = dup(msg);
    return r;
}

using clock_t2 = std::chrono::steady_clock;

static long elapsed(clock_t2::time_point t0) {
    return static_cast<long>(
        std::chrono::duration_cast<std::chrono::milliseconds>(
            clock_t2::now() - t0).count());
}

/** Returns a unique path for a temporary .fzn file. Does NOT create the file. */
static std::string temp_fzn_path() {
    static std::atomic<int> counter{0};
    auto dir = std::filesystem::temp_directory_path();
    return (dir / ("alloy_"
                   + std::to_string(static_cast<long>(getpid()))
                   + "_"
                   + std::to_string(++counter)
                   + ".fzn")).string();
}

/* ── Pipeline A — mzn_solve ───────────────────────────────────────────────── */

extern "C"
MznResult mzn_solve(const char* model_str,
                    const char* data_str,
                    const char* solver_id,
                    int         timeout_ms,
                    const char* stdlib_dir)
{
    auto t0 = clock_t2::now();

    try {
        std::ostringstream out, log;
        MiniZinc::Timer timer;
        MiniZinc::MznSolver solver(out, log, timer);

        std::vector<std::string> args;
        if (stdlib_dir && *stdlib_dir) {
            args.emplace_back("--stdlib-dir");
            args.emplace_back(stdlib_dir);
        }
        if (solver_id && *solver_id) {
            args.emplace_back("--solver");
            args.emplace_back(solver_id);
        }
        if (timeout_ms > 0) {
            args.emplace_back("--time-limit");
            args.emplace_back(std::to_string(timeout_ms));
        }

        std::string model = model_str ? model_str : "";
        if (data_str && *data_str) { model += "\n"; model += data_str; }

        auto status = solver.run(args, model);

        MznResult r;
        r.status  = static_cast<int>(status);
        r.output  = dup(out.str());
        r.error   = nullptr;
        r.time_ms = elapsed(t0);
        return r;

    } catch (const std::exception& e) {
        return make_error(std::string("MiniZinc: ") + e.what(), elapsed(t0));
    } catch (...) {
        return make_error("Unknown C++ exception in mzn_solve", elapsed(t0));
    }
}

/* ── Pipeline B — mzn_compile ─────────────────────────────────────────────── */

extern "C"
MznCompileResult mzn_compile(const char* model_str,
                              const char* data_str,
                              const char* stdlib_dir)
{
    try {
        std::ostringstream out, log;
        MiniZinc::Timer timer;
        MiniZinc::MznSolver solver(out, log, timer);

        std::vector<std::string> args;
        if (stdlib_dir && *stdlib_dir) {
            args.emplace_back("--stdlib-dir");
            args.emplace_back(stdlib_dir);
        }
        // --compile → output FlatZinc instead of solving
        // --output-to-stdout → write FZN to the captured output stream
        args.emplace_back("--compile");
        args.emplace_back("--output-to-stdout");

        std::string model = model_str ? model_str : "";
        if (data_str && *data_str) { model += "\n"; model += data_str; }

        solver.run(args, model);

        std::string fzn = out.str();
        if (fzn.empty()) {
            return make_compile_error("Compilation produced no FlatZinc output");
        }

        MznCompileResult r;
        r.fzn   = dup(fzn);
        r.error = nullptr;
        return r;

    } catch (const std::exception& e) {
        return make_compile_error(std::string("MiniZinc compile: ") + e.what());
    } catch (...) {
        return make_compile_error("Unknown C++ exception in mzn_compile");
    }
}

/* ── Pipeline B — mzn_solve_fzn ──────────────────────────────────────────── */

extern "C"
MznResult mzn_solve_fzn(const char* fzn_str,
                          const char* solver_id,
                          int         timeout_ms,
                          const char* stdlib_dir)
{
    auto t0 = clock_t2::now();

    if (!fzn_str || !*fzn_str) {
        return make_error("mzn_solve_fzn: empty FlatZinc input", 0);
    }

    // Write FlatZinc to a temp file — MznSolver infers .fzn format from
    // the file extension, so we can't use the inline model string here.
    std::string fzn_path = temp_fzn_path();
    {
        std::ofstream f(fzn_path);
        if (!f) return make_error("mzn_solve_fzn: cannot write temp file", 0);
        f << fzn_str;
    }

    // RAII cleanup regardless of exception path.
    struct Cleanup { const std::string& p; ~Cleanup() { std::remove(p.c_str()); } }
        cleanup{fzn_path};

    try {
        std::ostringstream out, log;
        MiniZinc::Timer timer;
        MiniZinc::MznSolver solver(out, log, timer);

        std::vector<std::string> args;
        if (stdlib_dir && *stdlib_dir) {
            args.emplace_back("--stdlib-dir");
            args.emplace_back(stdlib_dir);
        }
        if (solver_id && *solver_id) {
            args.emplace_back("--solver");
            args.emplace_back(solver_id);
        }
        if (timeout_ms > 0) {
            args.emplace_back("--time-limit");
            args.emplace_back(std::to_string(timeout_ms));
        }
        // Pass the .fzn file as a positional argument (no inline model).
        args.emplace_back(fzn_path);

        auto status = solver.run(args, "");

        MznResult r;
        r.status  = static_cast<int>(status);
        r.output  = dup(out.str());
        r.error   = nullptr;
        r.time_ms = elapsed(t0);
        return r;

    } catch (const std::exception& e) {
        return make_error(std::string("MiniZinc fzn solve: ") + e.what(), elapsed(t0));
    } catch (...) {
        return make_error("Unknown C++ exception in mzn_solve_fzn", elapsed(t0));
    }
}

/* ── mzn_list_solvers ─────────────────────────────────────────────────────── */

extern "C"
char** mzn_list_solvers(const char* /* stdlib_dir */)
{
    try {
        std::ostringstream log;
        MiniZinc::SolverConfigs configs(log);
        std::vector<std::string> solvers = configs.solvers();
        std::vector<char*> ptrs;
        ptrs.reserve(solvers.size());

        for (auto& s : solvers) {
            ptrs.emplace_back(&s[0]); // or const_cast<char*>(s.c_str())
        }
        // Optional: add a null terminator if required by C APIs (like argv)
        ptrs.push_back(nullptr); 

        char** arr = ptrs.data();
        //static_cast<char**>(
            //std::malloc((solvers.size() + 1) * sizeof(char*)));
        if (!arr) return nullptr;


        //for (std::size_t i = 0; i < solvers.size(); ++i) {
            ////arr[i] = dup(solvers[i].id());
            //arr[i] = dup(solvers[i]);
        //}
        arr[solvers.size()] = nullptr;
        return arr;

    } catch (...) {
        char** arr = static_cast<char**>(std::malloc(sizeof(char*)));
        if (arr) arr[0] = nullptr;
        return arr;
    }
}

/* ── memory management ────────────────────────────────────────────────────── */

extern "C" void mzn_free_result(MznResult* r) {
    if (!r) return;
    free(r->output);  r->output = nullptr;
    free(r->error);   r->error  = nullptr;
}

extern "C" void mzn_free_compile_result(MznCompileResult* r) {
    if (!r) return;
    free(r->fzn);    r->fzn   = nullptr;
    free(r->error);  r->error = nullptr;
}

extern "C" void mzn_free_solvers(char** solvers) {
    if (!solvers) return;
    for (char** p = solvers; *p; ++p) free(*p);
    free(solvers);
}
