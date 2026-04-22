#include "ortools_fzn.h"

#include <cstdlib>
#include <cstring>
#include <exception>
#include <mutex>
#include <string>

#include "absl/log/initialize.h"
#include "ortools/flatzinc/cp_model_fz_solver.h"
#include "ortools/flatzinc/model.h"
#include "ortools/flatzinc/parser.h"
#include "ortools/sat/model.h"
#include "ortools/util/logging.h"

namespace {

// absl logging must be initialised exactly once across all threads.
void ensure_log_initialized() {
    static std::once_flag flag;
    std::call_once(flag, absl::InitializeLog);
}

// Returns a heap-allocated copy of s, or nullptr on allocation failure.
// The caller owns the returned pointer and must free it with std::free.
char* dup_str(const std::string& s) {
    char* p = static_cast<char*>(std::malloc(s.size() + 1));
    if (p) {
        std::memcpy(p, s.data(), s.size());
        p[s.size()] = '\0';
    }
    return p;
}

// Writes msg into *err_out when err_out is non-null.
void set_error(char** err_out, const char* msg) {
    if (err_out) *err_out = dup_str(std::string(msg));
}

} // namespace

extern "C" {

char* solve_flatzinc(const char* fzn_model, char** err_out) {
    if (err_out) *err_out = nullptr;

    if (!fzn_model) {
        set_error(err_out, "fzn_model must not be null");
        return nullptr;
    }

    try {
        ensure_log_initialized();

        // sat::Model owns solver state. Suppress its internal progress log;
        // solution output is captured separately via solution_logger.
        operations_research::sat::Model sat_model;
        sat_model.GetOrCreate<operations_research::SolverLogger>()->EnableLogging(false);

        std::string solution_buf;
        operations_research::SolverLogger solution_logger;
        solution_logger.EnableLogging(true);
        solution_logger.SetLogToStdOut(false);
        solution_logger.AddInfoLoggingCallback(
            [&solution_buf](const std::string& line) {
                solution_buf += line;
                solution_buf += '\n';
            });

        operations_research::fz::Model fz_model("orsolver");
        if (!operations_research::fz::ParseFlatzincString(fzn_model, &fz_model)) {
            set_error(err_out, "failed to parse FlatZinc model");
            return nullptr;
        }

        // Required pre-processing for floating-point variables/objectives.
        operations_research::sat::ProcessFloatingPointOVariablesAndObjective(&fz_model);

        operations_research::fz::FlatzincSatParameters fz_params;
        fz_params.display_all_solutions = false;
        fz_params.search_all_solutions  = false;
        fz_params.use_free_search       = true;
        fz_params.log_search_progress   = false;
        fz_params.ortools_mode          = true;

        operations_research::sat::SolveFzWithCpModelProto(
            fz_model, fz_params, {}, &sat_model, &solution_logger);

        char* result = dup_str(solution_buf);
        if (!result) {
            set_error(err_out, "out of memory");
            return nullptr;
        }
        return result;

    } catch (const std::exception& e) {
        set_error(err_out, e.what());
        return nullptr;
    } catch (...) {
        set_error(err_out, "unknown C++ exception");
        return nullptr;
    }
}

void free_solve_result(char* ptr) {
    std::free(ptr);
}

} // extern "C"
