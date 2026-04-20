/**
 * Cloudflare Worker — thin proxy to the ZincServer container.
 *
 * The container binding (env.ZINCSERVER) is defined in wrangler.toml.
 * All requests are forwarded as-is; the container handles routing.
 */

export class ZincServer {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  /** @param {Request} request */
  async fetch(request) {
    return fetch(request);
  }
}

export default {
  /** @param {Request} request @param {*} env */
  async fetch(request, env) {
    const id = env.ZINCSERVER.newUniqueId();
    const stub = env.ZINCSERVER.get(id);
    return stub.fetch(request);
  }
};
