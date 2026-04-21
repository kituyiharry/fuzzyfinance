import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 8080);
const TIMEOUT_MS = Number(process.env.MINIZINC_TIMEOUT_MS ?? 30_000);

const VALID_SOLVERS = new Set(['cp', 'cp-sat', 'gecode', 'cbc', 'mip', 'float', 'api', 'osicbc', 'coinbc', ]);
const DEFAULT_SOLVER = 'cp';

/**
 * @param {string} model
 * @param {string|null} data
 * @param {string} solver
 * @returns {Promise<string|Object>}
 */
function flatten(model, data, solver) {
  const args = ['--solver', solver, '--output-fzn-to-stdout', '--no-output-ozn'];
  if (data) args.push('-D', `${data}`);
  args.push('-c', '--input-from-stdin', '--fzn-format', 'json');
  //args.push('-c', '--input-from-stdin');

  return new Promise((resolve, reject) => {
    const child = spawn('minizinc', args, { timeout: TIMEOUT_MS });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });

    child.on('close', code => {
      if (code !== 0) reject(new Error(stderr.trim() || `minizinc exited with code ${code}`));
      else try
        {
            resolve(JSON.parse(stdout)); 
        } catch(e) {
            resolve(stdout);
       };
    });

    child.on('error', reject);

    // Suppress EPIPE — can fire if minizinc exits before stdin is fully written
    child.stdin.on('error', () => {});
    child.stdin.write(model);
    child.stdin.end();
  });
}

function listSolvers() {
  return new Promise((resolve, reject) => {
    const child = spawn('minizinc', ['--solvers-json'], { timeout: TIMEOUT_MS });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => {
      if (code !== 0) reject(new Error(stderr.trim() || `minizinc exited with code ${code}`));
      else resolve(JSON.parse(stdout));
    });
    child.on('error', reject);
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

  if (req.method === 'GET' && req.url === '/solvers') {
    try {
      const solvers = await listSolvers();
      return sendJson(res, 200, solvers);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.url === '/flatten/batch') {
    if (req.method !== 'POST') return sendText(res, 405, 'Method Not Allowed');

    let raw = '';
    for await (const chunk of req) raw += chunk;

    let jobs;
    try {
      jobs = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON body' });
    }

    if (!Array.isArray(jobs.multimodels)) {
      return sendJson(res, 400, { error: 'Body must be an array of jobs' });
    }

    const results = await Promise.all(jobs.multimodels.map(async job => {
      const { id, model, data, solver = DEFAULT_SOLVER } = job ?? {};

      if (!id || typeof id !== 'string') {
        return { id: id ?? null, error: '`id` string is required' };
      }
      if (!model || typeof model !== 'string') {
        return { id, error: '`model` string is required' };
      }
      if (!VALID_SOLVERS.has(solver)) {
        return { id, error: `unknown solver "${solver}"; valid options: ${[...VALID_SOLVERS].join(', ')}` };
      }

      try {
        const flatzinc = await flatten(model, typeof data === 'string' ? data : null, solver);
        return { id, flatzinc };
      } catch (err) {
        return { id, error: err.message };
      }
    }));

    const byId = Object.fromEntries(results.map(({ id, ...rest }) => [id, rest]));
    return sendJson(res, 200, byId);
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

    console.log(flatzinc);
    if (wantJson) {
      return sendJson(res, 200, { flatzinc });
    }

    return sendText(res, 200, JSON.stringify(flatzinc));
  } catch (err) {
    return sendJson(res, 422, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`zincserver listening on :${PORT}`);
});
