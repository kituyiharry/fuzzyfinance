#pragma once
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Solve a FlatZinc model string.
 *
 * On success: returns a heap-allocated, NUL-terminated UTF-8 string containing
 * the solver output (solution lines + status markers). The caller must free it
 * with free_solve_result().
 *
 * On error: returns NULL and writes a heap-allocated error message into
 * *err_out (also freed with free_solve_result()). If err_out is NULL the
 * error message is discarded.
 */
char* solve_flatzinc(const char* fzn_model, char** err_out);

/** Free a string returned by solve_flatzinc. */
void free_solve_result(char* ptr);

#ifdef __cplusplus
}
#endif
