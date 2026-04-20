import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 8080);
const TIMEOUT_MS = Number(process.env.MINIZINC_TIMEOUT_MS ?? 30_000);

const VALID_SOLVERS = new Set(['cp', 'cp-sat', 'gecode', 'cbc']);
const DEFAULT_SOLVER = 'cp';

/**
 * @param {string} model
 * @param {string|null} data
 * @param {string} solver
 * @returns {Promise<string>}
 */
function flatten(model, data, solver) {
  const args = ['--solver', solver, '--output-fzn-to-stdout', '--no-output-ozn', '--json-stream', '--output-mode', 'json'];
  if (data) args.push('-D', `${data}`);
  args.push('-c', '-');

  return new Promise((resolve, reject) => {
    const child = spawn('minizinc', args, { timeout: TIMEOUT_MS });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });

    child.on('close', code => {
      if (code !== 0) reject(new Error(stderr.trim() || `minizinc exited with code ${code}`));
      else resolve(stdout);
    });

    child.on('error', reject);

    // Suppress EPIPE — can fire if minizinc exits before stdin is fully written
    child.stdin.on('error', () => {});
    child.stdin.write(model);
    child.stdin.end();
  });
}

// ── Response helpers ──────────────────────────────────────────────────────────

/** @param {http.ServerResponse} res */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** @param {http.ServerResponse} res */
function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

// ── Request handler ───────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Health check — used by the container orchestrator
  if (req.method === 'GET' && req.url === '/health') {
    return sendText(res, 200, 'ok');
  }

  if (req.url !== '/flatten') {
    return sendText(res, 404, 'Not Found');
  }

  if (req.method !== 'POST') {
    return sendText(res, 405, 'Method Not Allowed');
  }

  // Read body
  let raw = '';
  for await (const chunk of req) raw += chunk;

  console.log(raw);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' });
  }

  const { model, data, solver = DEFAULT_SOLVER } = parsed;

  if (!model || typeof model !== 'string') {
    return sendJson(res, 400, { error: '`model` string is required' });
  }

  if (!VALID_SOLVERS.has(solver)) {
    return sendJson(res, 400, { error: `unknown solver "${solver}"; valid options: ${[...VALID_SOLVERS].join(', ')}` });
  }

  // Response format negotiation via Accept header:
  //   Accept: application/json  → { flatzinc: "..." }
  //   Accept: text/plain        → raw FlatZinc string  (default)
  const wantJson = (req.headers['accept'] ?? '').includes('application/json');

  try {
    const flatzinc = await flatten(model, typeof data === 'string' ? data : null, solver);

    if (wantJson) {
      return sendJson(res, 200, { flatzinc });
    }

    return sendText(res, 200, flatzinc);
  } catch (err) {
    return sendJson(res, 422, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`zincserver listening on :${PORT}`);
});
