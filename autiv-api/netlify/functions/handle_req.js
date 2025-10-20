import crypto from "crypto";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
const WORKER_URL = process.env.WORKER_URL;
const SECRET = process.env.WORKER_SHARED_SECRET;
const AUTIV_JWT_PUBLIC_KEY = process.env.AUTIV_JWT_PUBLIC_KEY;
const AUTIV_JWT_AUDIENCE = process.env.AUTIV_JWT_AUDIENCE || "autiv-worker";
const AUTIV_JWT_ISSUER = process.env.AUTIV_JWT_ISSUER || "autiv-api";
const AUTIV_JWT_LEEWAY = Number(process.env.AUTIV_JWT_LEEWAY || "5");

if (!WORKER_URL || !SECRET) {
  throw new Error("WORKER_URL and WORKER_SHARED_SECRET must be defined for handle_req function");
}

if (!AUTIV_JWT_PUBLIC_KEY) {
  throw new Error("AUTIV_JWT_PUBLIC_KEY must be defined for handle_req function");
}

/**
 * Generate HMAC signature for worker authentication
 */
function generateHmacSignature(method, path, timestamp, nonce, bodyHash, secret) {
  const signingString = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  return crypto.createHmac("sha256", secret).update(signingString).digest("hex");
}

/**
 * Generate SHA-256 hash of a string
 */
function hashString(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * Make authenticated request to Cloudflare Worker
 */
async function makeWorkerRequest(endpoint, options = {}) {
  const method = options.method || "POST";
  const body = options.body || "";
  const headers = options.headers || {};
  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const bodyHash = hashString(body);
  const signature = generateHmacSignature(method, endpoint, timestamp, nonce, bodyHash, SECRET);
  
  const url = `${WORKER_URL}${endpoint}`;
  
  const requestOptions = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Timestamp": timestamp,
      "X-Request-Nonce": nonce,
      "X-Signature": signature,
      ...headers
    },
    body: method === "GET" ? undefined : body
  };
  
  try {
    const response = await fetch(url, requestOptions);
    const responseText = await response.text();
    return {
      status: response.status,
      data: responseText
    };
  } catch (error) {
    console.error('Worker request failed:', error.message);
    throw error;
  }
}

/**
 * Netlify Function Handler
 */
export const handler = async (event) => {
  // Handle CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key, X-Target-Endpoint, X-Project-Id, X-Developer-Id"
      }
    };
  }

  try {
    const { path, body, headers } = event;
    const method = event.httpMethod;

    // Get the target endpoint from header or extract from path
    const apiPath = headers["x-target-endpoint"] || path.replace("/.netlify/functions/handle_req", "");

    // Prepare headers for worker request
    const workerHeaders = {};
    const apiKey = headers["x-api-key"];

    if (apiKey) {
      workerHeaders["X-Api-Key"] = apiKey;
    }

    // Developer API key bypasses Autiv JWT requirement
    if (!apiKey) {
      const authHeader = headers.authorization || headers.Authorization || "";

      if (!authHeader.startsWith("Bearer ")) {
        return {
          statusCode: 401,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "Missing Autiv authorization token" })
        };
      }

      const token = authHeader.slice("Bearer ".length).trim();

      let claims;
      try {
        claims = jwt.verify(token, AUTIV_JWT_PUBLIC_KEY, {
          algorithms: ["RS256"],
          audience: AUTIV_JWT_AUDIENCE,
          issuer: AUTIV_JWT_ISSUER,
          clockTolerance: AUTIV_JWT_LEEWAY,
        });
      } catch (error) {
        console.error("Autiv token verification failed", error);
        return {
          statusCode: 401,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "Invalid Autiv authorization token" }),
        };
      }

      if (!claims?.email) {
        return {
          statusCode: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "Autiv token missing email claim" }),
        };
      }

      workerHeaders["X-User-Email"] = claims.email;
      if (claims.developerId) {
        workerHeaders["X-Developer-Id"] = claims.developerId;
      }
      if (claims.sub) {
        workerHeaders["X-Autiv-Subject"] = claims.sub;
      }
    }

    if (headers["x-project-id"]) {
      workerHeaders["X-Project-Id"] = headers["x-project-id"];
    }

    // Make request to worker
    const result = await makeWorkerRequest(apiPath, {
      method,
      body: body || "",
      headers: workerHeaders
    });
    
    return {
      statusCode: result.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: result.data
    };
    
  } catch (error) {
    console.error("Handler error:", error.message);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        error: "Internal server error",
        message: error.message,
        details: error.stack?.split('\n')[0] || 'No details available'
      })
    };
  }
};
