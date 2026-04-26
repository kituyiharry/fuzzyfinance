#include "ortools_fzn.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <unordered_set>

#include "absl/log/initialize.h"
#include "ortools/flatzinc/cp_model_fz_solver.h"
#include "ortools/flatzinc/model.h"
#include "ortools/flatzinc/parser.h"
#include "ortools/sat/model.h"
#include "ortools/util/logging.h"


namespace {

// ── one-time absl log init ────────────────────────────────────────────────────

void ensure_log_initialized() {
    static std::once_flag flag;
    std::call_once(flag, absl::InitializeLog);
}


// ── memory helpers ────────────────────────────────────────────────────────────

char* dup_str(const std::string& s) {
    char* p = static_cast<char*>(std::malloc(s.size() + 1));
    if (p) {
        std::memcpy(p, s.data(), s.size());
        p[s.size()] = '\0';
    }
    return p;
}

void set_error(char** err_out, const char* msg) {
    if (err_out) *err_out = dup_str(std::string(msg));
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

static std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 2);
    for (unsigned char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    return out;
}

static std::string jstr(const std::string& s) {
    return "\"" + json_escape(s) + "\"";
}

// ── model structure serialisation ─────────────────────────────────────────────

namespace fz = operations_research::fz;

static std::string domain_json(const fz::Domain& d) {
    std::ostringstream j;
    j << "{";
    if (d.is_float) {
        j << "\"kind\":\"float\"";
        if (d.float_values.size() == 2) {
            j << ",\"min\":" << d.float_values[0]
              << ",\"max\":" << d.float_values[1];
        } else if (d.float_values.size() == 1) {
            j << ",\"value\":" << d.float_values[0];
        }
    } else if (d.display_as_boolean) {
        j << "\"kind\":\"bool\"";
    } else if (d.is_interval) {
        if (d.values.empty()) {
            j << "\"kind\":\"all_int\"";
        } else {
            j << "\"kind\":\"interval\""
              << ",\"min\":" << d.values[0]
              << ",\"max\":" << d.values[1];
        }
    } else {
        j << "\"kind\":\"list\""
          << ",\"size\":" << d.values.size();
        if (d.values.size() <= 64) {
            j << ",\"values\":[";
            for (size_t i = 0; i < d.values.size(); ++i) {
                if (i) j << ',';
                j << d.values[i];
            }
            j << "]";
        }
    }
    if (d.is_a_set) j << ",\"is_set\":true";
    j << "}";
    return j.str();
}

static std::string annotation_json(const fz::Annotation& ann) {
    std::ostringstream j;
    j << "{";
    switch (ann.type) {
        case fz::Annotation::IDENTIFIER:
            j << "\"kind\":\"id\",\"id\":" << jstr(ann.id);
            break;
        case fz::Annotation::FUNCTION_CALL:
            j << "\"kind\":\"call\",\"id\":" << jstr(ann.id);
            if (!ann.annotations.empty()) {
                j << ",\"args\":[";
                for (size_t i = 0; i < ann.annotations.size(); ++i) {
                    if (i) j << ',';
                    j << annotation_json(ann.annotations[i]);
                }
                j << "]";
            }
            break;
        case fz::Annotation::INT_VALUE:
            j << "\"kind\":\"int\",\"value\":" << ann.values[0];
            break;
        case fz::Annotation::INTERVAL:
            j << "\"kind\":\"interval\""
              << ",\"min\":" << ann.interval_min
              << ",\"max\":" << ann.interval_max;
            break;
        case fz::Annotation::INT_LIST:
            j << "\"kind\":\"int_list\",\"size\":" << ann.values.size();
            break;
        case fz::Annotation::VAR_REF:
            j << "\"kind\":\"var\"";
            if (!ann.variables.empty() && ann.variables[0])
                j << ",\"name\":" << jstr(ann.variables[0]->name);
            break;
        case fz::Annotation::VAR_REF_ARRAY:
            j << "\"kind\":\"var_array\",\"count\":" << ann.variables.size();
            break;
        case fz::Annotation::STRING_VALUE:
            j << "\"kind\":\"string\",\"value\":" << jstr(ann.string_value);
            break;
        case fz::Annotation::ANNOTATION_LIST:
            j << "\"kind\":\"list\",\"items\":[";
            for (size_t i = 0; i < ann.annotations.size(); ++i) {
                if (i) j << ',';
                j << annotation_json(ann.annotations[i]);
            }
            j << "]";
            break;
        default:
            j << "\"kind\":\"unknown\"";
    }
    j << "}";
    return j.str();
}

static std::string argument_json(const fz::Argument& arg) {
    std::ostringstream j;
    j << "{";
    switch (arg.type) {
        case fz::Argument::INT_VALUE:
            j << "\"kind\":\"int\",\"value\":" << arg.values[0];
            break;
        case fz::Argument::INT_INTERVAL:
            j << "\"kind\":\"interval\""
              << ",\"min\":" << arg.values[0]
              << ",\"max\":" << arg.values[1];
            break;
        case fz::Argument::INT_LIST:
            j << "\"kind\":\"int_list\",\"size\":" << arg.values.size();
            if (arg.values.size() <= 32) {
                j << ",\"values\":[";
                for (size_t i = 0; i < arg.values.size(); ++i) {
                    if (i) j << ',';
                    j << arg.values[i];
                }
                j << "]";
            }
            break;
        case fz::Argument::DOMAIN_LIST:
            j << "\"kind\":\"domain_list\",\"size\":" << arg.domains.size();
            break;
        case fz::Argument::FLOAT_VALUE:
            j << "\"kind\":\"float\",\"value\":" << arg.floats[0];
            break;
        case fz::Argument::FLOAT_INTERVAL:
            j << "\"kind\":\"float_interval\""
              << ",\"min\":" << arg.floats[0]
              << ",\"max\":" << arg.floats[1];
            break;
        case fz::Argument::FLOAT_LIST:
            j << "\"kind\":\"float_list\",\"size\":" << arg.floats.size();
            break;
        case fz::Argument::VAR_REF: {
            j << "\"kind\":\"var\"";
            const fz::Variable* v =
                arg.variables.empty() ? nullptr : arg.variables[0];
            if (v)
                j << ",\"name\":" << jstr(v->name)
                  << ",\"domain\":" << domain_json(v->domain);
            break;
        }
        case fz::Argument::VAR_REF_ARRAY:
            j << "\"kind\":\"var_array\",\"count\":" << arg.variables.size();
            break;
        case fz::Argument::VOID_ARGUMENT:
            j << "\"kind\":\"void\"";
            break;
        default:
            j << "\"kind\":\"unknown\"";
    }
    j << "}";
    return j.str();
}

static std::string model_info_json(const fz::Model& m) {
    std::ostringstream j;

    size_t total_vars   = m.variables().size();
    size_t tmp_vars     = 0, active_vars = 0;
    size_t total_cons   = m.constraints().size();
    size_t active_cons  = 0, strong_cons = 0;
    std::map<std::string, size_t> type_hist;

    for (const auto* v : m.variables()) {
        if (!v) continue;
        if (v->temporary) ++tmp_vars;
        if (v->active)    ++active_vars;
    }
    for (const auto* c : m.constraints()) {
        if (!c) continue;
        if (c->active)             ++active_cons;
        if (c->strong_propagation) ++strong_cons;
        type_hist[c->type]++;
    }

    j << "{"
      << "\"name\":" << jstr(m.name())
      << ",\"stats\":{"
          << "\"total_variables\":"               << total_vars
          << ",\"temporary_variables\":"          << tmp_vars
          << ",\"active_variables\":"             << active_vars
          << ",\"total_constraints\":"            << total_cons
          << ",\"active_constraints\":"           << active_cons
          << ",\"strong_propagation_constraints\":" << strong_cons
          << ",\"constraint_types\":{";
    {
        bool first = true;
        for (const auto& [type, count] : type_hist) {
            if (!first) j << ',';
            first = false;
            j << jstr(type) << ':' << count;
        }
    }
    j << "}}";

    // variables
    j << ",\"variables\":[";
    {
        bool first = true;
        for (const auto* v : m.variables()) {
            if (!v) continue;
            if (!first) j << ',';
            first = false;
            j << "{"
              << "\"name\":"       << jstr(v->name)
              << ",\"domain\":"    << domain_json(v->domain)
              << ",\"temporary\":" << (v->temporary ? "true" : "false")
              << ",\"active\":"    << (v->active ? "true" : "false")
              << "}";
        }
    }
    j << "]";

    // constraints
    j << ",\"constraints\":[";
    {
        bool first = true;
        for (const auto* c : m.constraints()) {
            if (!c) continue;
            if (!first) j << ',';
            first = false;
            j << "{"
              << "\"type\":"                << jstr(c->type)
              << ",\"active\":"             << (c->active ? "true" : "false")
              << ",\"strong_propagation\":" << (c->strong_propagation ? "true" : "false")
              << ",\"symmetric_breaking\":" << (c->is_symmetric_breaking ? "true" : "false")
              << ",\"redundant\":"          << (c->is_redundant ? "true" : "false")
              << ",\"args\":[";
            for (size_t i = 0; i < c->arguments.size(); ++i) {
                if (i) j << ',';
                j << argument_json(c->arguments[i]);
            }
            j << "]}";
        }
    }
    j << "]";

    // objective
    j << ",\"objective\":{";
    if (!m.objective()) {
        if (!m.float_objective_variables().empty()) {
            j << "\"kind\":\"" << (m.maximize() ? "maximize" : "minimize") << "\""
              << ",\"float_terms\":[";
            const auto& fvars   = m.float_objective_variables();
            const auto& fcoeffs = m.float_objective_coefficients();
            for (size_t i = 0; i < fvars.size(); ++i) {
                if (i) j << ',';
                j << "{\"coeff\":" << fcoeffs[i];
                if (fvars[i]) j << ",\"var\":" << jstr(fvars[i]->name);
                j << "}";
            }
            j << "],\"offset\":" << m.float_objective_offset();
        } else {
            j << "\"kind\":\"satisfy\"";
        }
    } else {
        j << "\"kind\":\"" << (m.maximize() ? "maximize" : "minimize") << "\""
          << ",\"variable\":" << jstr(m.objective()->name)
          << ",\"domain\":"   << domain_json(m.objective()->domain);
    }
    j << "}";

    // output specs
    j << ",\"outputs\":[";
    {
        bool first = true;
        for (const auto& spec : m.output()) {
            if (!first) j << ',';
            first = false;
            bool is_array = !spec.flat_variables.empty() || !spec.bounds.empty();
            j << "{"
              << "\"name\":"             << jstr(spec.name)
              << ",\"is_array\":"        << (is_array ? "true" : "false");
            if (is_array) {
                j << ",\"bounds\":[";
                for (size_t i = 0; i < spec.bounds.size(); ++i) {
                    if (i) j << ',';
                    j << "{\"min\":" << spec.bounds[i].min_value
                      << ",\"max\":" << spec.bounds[i].max_value << "}";
                }
                j << "],\"variable_count\":" << spec.flat_variables.size();
            } else if (spec.variable) {
                j << ",\"variable\":" << jstr(spec.variable->name);
            }
            j << ",\"display_as_boolean\":"
              << (spec.display_as_boolean ? "true" : "false")
              << "}";
        }
    }
    j << "]";

    // search annotations
    j << ",\"search_annotations\":[";
    {
        bool first = true;
        for (const auto& ann : m.search_annotations()) {
            if (!first) j << ',';
            first = false;
            j << annotation_json(ann);
        }
    }
    j << "]";

    j << "}";
    return j.str();
}

// ── shared solver core ────────────────────────────────────────────────────────

// Runs CP-SAT on an already-prepared fz::Model and returns the solution
// output string, or nullptr on error.
static char* run_solver(fz::Model& fz_model, char** err_out) {
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

    fz::FlatzincSatParameters fz_params;
    fz_params.display_all_solutions = false;
    fz_params.search_all_solutions  = false;
    fz_params.use_free_search       = true;
    fz_params.ortools_mode          = true;
    fz_params.log_search_progress   = false;

    {
        operations_research::sat::SolveFzWithCpModelProto(
            fz_model, fz_params, {}, &sat_model, &solution_logger);
    }

    char* result = dup_str(solution_buf);
    if (!result) set_error(err_out, "out of memory");
    return result;
}

// Injects every non-temporary active variable that is not already covered by
// a SolutionOutputSpecs entry into the model's output list, so their final
// values appear in the solver output string.
static void inject_all_variable_outputs(fz::Model& m) {
    // Collect variable pointers already covered by existing output specs.
    std::unordered_set<const fz::Variable*> covered;
    for (const auto& spec : m.output()) {
        if (spec.variable) covered.insert(spec.variable);
        for (const auto* v : spec.flat_variables) {
            if (v) covered.insert(v);
        }
    }

    for (auto* v : m.variables()) {
        if (!v || v->temporary || !v->active) continue;
        if (covered.count(v)) continue;
        m.AddOutput(fz::SolutionOutputSpecs::SingleVariable(
            v->name, v, v->domain.display_as_boolean));
        covered.insert(v);  // prevent duplicates if the same ptr appears twice
    }
}

} // namespace

extern "C" {

// ── solve_flatzinc ────────────────────────────────────────────────────────────

char* solve_flatzinc(const char* fzn_model, char** err_out) {
    if (err_out) *err_out = nullptr;
    if (!fzn_model) { set_error(err_out, "fzn_model must not be null"); return nullptr; }
    try {
        ensure_log_initialized();
        fz::Model model("orsolver");
        {
            if (!fz::ParseFlatzincString(fzn_model, &model)) {
                set_error(err_out, "failed to parse FlatZinc model");
                return nullptr;
            }
        }
        operations_research::sat::ProcessFloatingPointOVariablesAndObjective(&model);
        return run_solver(model, err_out);
    } catch (const std::exception& e) { set_error(err_out, e.what()); return nullptr; }
      catch (...) { set_error(err_out, "unknown C++ exception"); return nullptr; }
}

// ── solve_flatzinc_full ───────────────────────────────────────────────────────

char* solve_flatzinc_full(const char* fzn_model, char** err_out) {
    if (err_out) *err_out = nullptr;
    if (!fzn_model) { set_error(err_out, "fzn_model must not be null"); return nullptr; }
    try {
        ensure_log_initialized();
        fz::Model model("orsolver");
        {
            if (!fz::ParseFlatzincString(fzn_model, &model)) {
                set_error(err_out, "failed to parse FlatZinc model");
                return nullptr;
            }
        }
        operations_research::sat::ProcessFloatingPointOVariablesAndObjective(&model);
        inject_all_variable_outputs(model);
        return run_solver(model, err_out);
    } catch (const std::exception& e) { set_error(err_out, e.what()); return nullptr; }
      catch (...) { set_error(err_out, "unknown C++ exception"); return nullptr; }
}

// ── inspect_flatzinc ──────────────────────────────────────────────────────────

char* inspect_flatzinc(const char* fzn_model, char** err_out) {
    if (err_out) *err_out = nullptr;
    if (!fzn_model) { set_error(err_out, "fzn_model must not be null"); return nullptr; }
    try {
        ensure_log_initialized();
        fz::Model model("orsolver");
        {
            if (!fz::ParseFlatzincString(fzn_model, &model)) {
                set_error(err_out, "failed to parse FlatZinc model");
                return nullptr;
            }
        }
        operations_research::sat::ProcessFloatingPointOVariablesAndObjective(&model);
        std::string json = model_info_json(model);
        char* result = dup_str(json);
        if (!result) { set_error(err_out, "out of memory"); return nullptr; }
        return result;
    } catch (const std::exception& e) { set_error(err_out, e.what()); return nullptr; }
      catch (...) { set_error(err_out, "unknown C++ exception"); return nullptr; }
}

// ── free_solve_result ─────────────────────────────────────────────────────────

void free_solve_result(char* ptr) { std::free(ptr); }


} // extern "C"
