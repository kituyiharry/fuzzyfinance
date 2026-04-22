#include "ortools_fzn.h"

#include <cstdlib>
#include <cstring>
#include <exception>
#include <string>

//#define OR_PROTO_DLL

#include "absl/log/initialize.h"
#include "ortools/flatzinc/cp_model_fz_solver.h"
#include "ortools/flatzinc/model.h"
#include "ortools/flatzinc/parser.h"
#include "ortools/sat/model.h"
#include "ortools/util/logging.h"

#include "google/protobuf/text_format.h"
#include "ortools/base/logging.h"
#include "ortools/base/path.h"
#include "ortools/base/timer.h"
#include "ortools/flatzinc/cp_model_fz_solver.h"
#include "ortools/flatzinc/model.h"
#include "ortools/flatzinc/parser.h"
#include "ortools/sat/model.h"
#include "ortools/util/logging.h"

static bool ABSL_INIT = false;


static char* dup_str(const std::string& s) {
    char* p = static_cast<char*>(std::malloc(s.size() + 1));
    if (p) {
        std::memcpy(p, s.data(), s.size());
        p[s.size()] = '\0';
    }
    return p;
}

extern "C" {

char* solve_flatzinc(const char* fzn_model, char** err_out) {
    if (err_out) *err_out = nullptr;
    try {

        if (!ABSL_INIT) {
            absl::InitializeLog();
            ABSL_INIT = true;
        }

        // sat::Model owns solver state; its logger handles internal messages.
        operations_research::sat::Model sat_model;
        operations_research::SolverLogger* logger =
            sat_model.GetOrCreate<operations_research::SolverLogger>();
        logger->EnableLogging(true);

        // Capture solution output (variable assignments, status markers) to a
        // string via callback instead of printing directly to stdout.
        std::string solution_buf;
        operations_research::SolverLogger solution_logger;
        solution_logger.EnableLogging(true);
        solution_logger.SetLogToStdOut(false);
        solution_logger.AddInfoLoggingCallback(
            [&solution_buf](const std::string& line) {
                solution_buf += line;
                solution_buf += '\n';
            });

        // Construct the fz::Model and parse the FlatZinc string into it.
        operations_research::fz::Model fz_model("orsolver");
        if (!operations_research::fz::ParseFlatzincString(fzn_model, &fz_model)) {
            if (err_out) *err_out = dup_str("failed to parse FlatZinc model");
            return nullptr;
        }

        // Required pre-processing step for floating-point variables/objectives.
        operations_research::sat::ProcessFloatingPointOVariablesAndObjective(
            &fz_model);

        // Solver parameters — keep defaults, free search enabled.
        operations_research::fz::FlatzincSatParameters fz_params;
        fz_params.display_all_solutions = false;
        fz_params.search_all_solutions = false;
        fz_params.use_free_search = true;
        fz_params.log_search_progress = false;
        fz_params.ortools_mode = true;

        operations_research::sat::SatParameters sat_params;

        operations_research::sat::SolveFzWithCpModelProto(
            fz_model, fz_params, sat_params, &sat_model, &solution_logger);

        return dup_str(solution_buf);
    } catch (const std::exception& e) {
        if (err_out) *err_out = dup_str(e.what());
        return nullptr;
    } catch (...) {
        if (err_out) *err_out = dup_str("unknown C++ exception");
        return nullptr;
    }
}

void free_solve_result(char* ptr) {
    std::free(ptr);
}

} // extern "C"
