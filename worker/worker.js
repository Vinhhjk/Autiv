const getConfig = (env) => ({
    DATABASE_URL_HTTPS: env.DATABASE_URL_HTTPS,
  });
  
  // --- HMAC Helpers ---
  async function importKey(secret) {
    const enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  }
  function arrayBufferToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function constantTimeCompare(aHex, bHex) {
    if (aHex.length !== bHex.length) return false;
    let diff = 0;
    for (let i = 0; i < aHex.length; i += 2) {
      diff |= parseInt(aHex.substr(i, 2), 16) ^ parseInt(bHex.substr(i, 2), 16);
    }
    return diff === 0;
  }
  async function verifyHmac(secret, signingString, signatureHex) {
    const key = await importKey(secret);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingString));
    return constantTimeCompare(arrayBufferToHex(sig), signatureHex);
  }
  
  // --- Request handler ---
  async function handleRequest(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
  
    // 1. Check for Developer API Key
    const devApiKey = req.headers.get("X-Api-Key") || url.searchParams.get("api_key");
    if (devApiKey) {
      const valid = await verifyApiKey(env.XATA_API_KEY, devApiKey, env);
      if (!valid) return new Response("Invalid API key", { status: 401 });
      return await handleDeveloperRequest(req, path);
    }
    // 2. Otherwise expect signed frontend request
    const timestamp = req.headers.get("X-Request-Timestamp");
    const nonce = req.headers.get("X-Request-Nonce");
    const signature = req.headers.get("X-Signature");
    if (!timestamp || !nonce || !signature) {
      return new Response("Missing auth headers", { status: 400 });
    }
  
    // Freshness check
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    const ACCEPT_WINDOW = 60;
    if (Number.isNaN(ts) || Math.abs(now - ts) > ACCEPT_WINDOW) {
      return new Response("Stale or invalid timestamp", { status: 400 });
    }
  
    // Nonce check
    const nonceKey = `nonce:${nonce}`;
    const seen = await env.NONCE_KV.get(nonceKey);
    if (seen) return new Response("Replay detected", { status: 400 });
  
    // Canonicalize body
    const bodyText = await req.text();
    const bodyHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bodyText));
    const signingString = `${req.method}\n${path}\n${timestamp}\n${nonce}\n${arrayBufferToHex(bodyHash)}`;
  
    const ok = await verifyHmac(env.WORKER_SHARED_SECRET, signingString, signature);
    if (!ok) return new Response("Invalid signature", { status: 401 });
  
    // Reserve nonce
    await env.NONCE_KV.put(nonceKey, "1", { expirationTtl: 120 });
  
    // Handle routes for frontend
    switch (path) {
        case "/api/verify-key":
            const targetApiKey = req.headers.get("X-Api-Key") || url.searchParams.get("api_key");
            const valid = await verifyApiKey(env.XATA_API_KEY, targetApiKey, env);
            return new Response(JSON.stringify({ valid }), {
              status: valid ? 200 : 401,
              headers: { "Content-Type": "application/json" },
            });
    }
  }
  
  // --- Xata API Helper ---
  async function xataRequest(endpoint, options = {}, apiKey, env) {
    const url = `${getConfig(env).DATABASE_URL_HTTPS}/${endpoint}`;
    const defaultOptions = {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    };
    const requestOptions = { ...defaultOptions, ...options, headers: { ...defaultOptions.headers, ...options.headers } };
  
    const response = await fetch(url, requestOptions);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Xata API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return response.json();
  }
  
  // --- Verify developer API key ---
  async function verifyApiKey(xataApiKey, targetApiKey, env) {
    if (!targetApiKey) return false;
    const response = await xataRequest("tables/developers/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["api_key"],
        filter: { api_key: targetApiKey },
        page: { size: 1 },
      }),
    }, xataApiKey, env);
    return response.records.length > 0;
  }
  
  // --- Dev request handler ---
  async function handleDeveloperRequest(req, path) {
    return new Response(JSON.stringify({ ok: true, source: "developer", path }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  export default {
    async fetch(request, env, ctx) {
      return handleRequest(request, env);
    },
  };
  