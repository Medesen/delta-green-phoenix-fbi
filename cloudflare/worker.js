/**
 * Cloudflare Worker — Investigation Graph proxy
 *
 * Environment variables to set in the Cloudflare dashboard:
 *   GITHUB_TOKEN    — Personal Access Token with repo `contents:write` scope
 *   GITHUB_OWNER    — e.g. Medesen
 *   GITHUB_REPO     — e.g. delta-green-phoenix-fbi
 *   GITHUB_BRANCH   — e.g. main
 *   GM_PASSPHRASE   — Secret passphrase for GM mode
 *
 * Endpoints:
 *   GET  /read         → returns graph.json (master)
 *   GET  /read-draft   → returns graph_draft.json
 *   POST /save-draft   → body: { graph } — writes graph_draft.json
 *   POST /publish      → copies draft → master (GM only)
 *   POST /gm-auth      → validates GM passphrase
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-GM-Passphrase',
};

const GRAPH_PATH = 'assets/graph/graph.json';
const DRAFT_PATH = 'assets/graph/graph_draft.json';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/read') {
        return await readFile(env, GRAPH_PATH);
      }
      if (request.method === 'GET' && url.pathname === '/read-draft') {
        return await readFile(env, DRAFT_PATH);
      }
      if (request.method === 'POST' && url.pathname === '/save-draft') {
        const body = await request.json();
        return await writeFile(env, DRAFT_PATH, body.graph);
      }
      if (request.method === 'POST' && url.pathname === '/publish') {
        if (!checkGM(request, env)) return forbidden();
        const draft = await getFileContent(env, DRAFT_PATH);
        if (!draft) return json({ error: 'No draft found' }, 404);
        return await writeFile(env, GRAPH_PATH, draft);
      }
      if (request.method === 'POST' && url.pathname === '/gm-auth') {
        return checkGM(request, env)
          ? json({ ok: true })
          : forbidden();
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};

function checkGM(request, env) {
  return request.headers.get('X-GM-Passphrase') === env.GM_PASSPHRASE;
}

function forbidden() {
  return new Response('Forbidden', { status: 403, headers: CORS });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function githubApi(env, method, path, body) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'dg-investigation-worker',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return resp;
}

async function getFileContent(env, path) {
  const resp = await githubApi(env, 'GET', path);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('GitHub GET failed: ' + resp.status);
  const data = await resp.json();
  return JSON.parse(atob(data.content.replace(/\n/g, '')));
}

async function readFile(env, path) {
  const content = await getFileContent(env, path);
  if (!content) return json({ nodes: [], edges: [] });
  return json(content);
}

async function writeFile(env, path, content) {
  // Get current SHA (needed for updates)
  const getResp = await githubApi(env, 'GET', path);
  let sha = undefined;
  if (getResp.ok) {
    const existing = await getResp.json();
    sha = existing.sha;
  }

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content))));
  const putResp = await githubApi(env, 'PUT', path, {
    message: `chore: update ${path.split('/').pop()}`,
    content: encoded,
    branch: env.GITHUB_BRANCH || 'main',
    sha: sha,
  });

  if (!putResp.ok) {
    const err = await putResp.text();
    throw new Error('GitHub PUT failed: ' + err);
  }
  return json({ ok: true });
}
