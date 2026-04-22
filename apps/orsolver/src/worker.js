/**
 * Cloudflare Worker — thin proxy to the OrSolver container.
 *
 * The container binding (env.ORSOLVER) is defined in wrangler.toml.
 * All requests are forwarded as-is; the container handles routing.
 */

export class OrSolver {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    return fetch(request);
  }
}

export default {
  async fetch(request, env) {
    const id = env.ORSOLVER.newUniqueId();
    const stub = env.ORSOLVER.get(id);
    return stub.fetch(request);
  },
};
