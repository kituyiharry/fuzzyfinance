#pragma once
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Solve a FlatZinc model, injecting every non-temporary active variable into
 * the output specs before solving so their final values appear in the returned
 * output string alongside the normally declared output variables.
 *
 * Useful for debug mode: the caller can parse "name = value;" lines from the
 * output to obtain solution values for all model variables, not just those
 * annotated with output_var.
 *
 * Same ownership and error conventions as solve_flatzinc().
 */
#if defined(__GNUC__) || defined(__clang__)
__attribute__((warn_unused_result))
#endif
char* solve_flatzinc_full(const char* fzn_model, char** err_out);

/**
 * Parse a FlatZinc model string and return a JSON object describing its
 * structure: variables, constraints, objective, outputs, search annotations,
 * and aggregate statistics. Useful for debugging and inspection without solving.
 *
 * On success: returns a heap-allocated, NUL-terminated UTF-8 JSON string.
 *             Caller must free with free_solve_result().
 * On failure: returns NULL and, if err_out is non-NULL, writes an error message.
 *
 * fzn_model must be a non-NULL, NUL-terminated UTF-8 string.
 */
#if defined(__GNUC__) || defined(__clang__)
__attribute__((warn_unused_result))
#endif
char* inspect_flatzinc(const char* fzn_model, char** err_out);

/**
 * Solve a FlatZinc model string.
 *
 * On success: returns a heap-allocated, NUL-terminated UTF-8 string containing
 * the solver output (solution lines + status markers). The caller must free it
 * with free_solve_result().
 *
 * On failure: returns NULL and, if err_out is non-NULL, writes a heap-allocated
 * error message into *err_out (also freed with free_solve_result()).
 *
 * fzn_model must be a non-NULL, NUL-terminated UTF-8 string.
 */
#if defined(__GNUC__) || defined(__clang__)
__attribute__((warn_unused_result))
#endif
char* solve_flatzinc(const char* fzn_model, char** err_out);

/** Free any string returned by solve_flatzinc. Safe to call with NULL. */
void free_solve_result(char* ptr);

#ifdef __cplusplus
}
#endif
