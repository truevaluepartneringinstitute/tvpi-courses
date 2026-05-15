// ================================================================
// TVPi Course Proxy — Cloudflare Worker
// Keeps the Airtable PAT server-side. Only allows create/update
// on three specific tables. CORS-locked to the GitHub Pages domain.
// ================================================================

const AIRTABLE_BASE = 'app9N4TEFlXFVn7PI';

// Only these tables can be touched — everything else is rejected
const ALLOWED_TABLES = new Set([
  'tbl7BAdaYzaMgUpk4',  // Leads
  'tblTVtL8zv7C7gZUI',  // Raw Survey Data
  'tbljh8dLT4vbCv0Ye',  // Quiz Attempts
]);

// Only requests from these origins are allowed
const ALLOWED_ORIGINS = [
  'https://truevaluepartneringinstitute.github.io',
];

// ── CORS helpers ────────────────────────────────────────
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── Main handler ────────────────────────────────────────
export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Only POST (create) and PATCH (update)
    if (!['POST', 'PATCH'].includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, 405, cors);
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, cors);
    }

    const { tableId, recordId, fields } = body;

    // Validate table is on the allowlist
    if (!tableId || !ALLOWED_TABLES.has(tableId)) {
      return jsonResponse({ error: 'Forbidden: table not allowed' }, 403, cors);
    }

    // Validate fields object exists
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return jsonResponse({ error: 'Missing or invalid fields' }, 400, cors);
    }

    // PATCH requires a recordId
    if (request.method === 'PATCH' && !recordId) {
      return jsonResponse({ error: 'Missing recordId for update' }, 400, cors);
    }

    // Build Airtable URL
    let url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}`;
    if (request.method === 'PATCH') {
      url += `/${recordId}`;
    }

    // Forward to Airtable
    try {
      const airtableRes = await fetch(url, {
        method: request.method,
        headers: {
          'Authorization': `Bearer ${env.AIRTABLE_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields, typecast: true }),
      });

      const data = await airtableRes.json();
      return jsonResponse(data, airtableRes.status, cors);

    } catch (err) {
      return jsonResponse({ error: 'Upstream request failed' }, 502, cors);
    }
  },
};
