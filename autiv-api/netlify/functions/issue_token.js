import crypto from "crypto";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";

dotenv.config();

const WORKER_URL = process.env.WORKER_URL;
const WORKER_SHARED_SECRET = process.env.WORKER_SHARED_SECRET;
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const AUTIV_JWT_PRIVATE_KEY = process.env.AUTIV_JWT_PRIVATE_KEY;
const AUTIV_JWT_ISSUER = process.env.AUTIV_JWT_ISSUER || "autiv-api";
const AUTIV_JWT_AUDIENCE = process.env.AUTIV_JWT_AUDIENCE || "autiv-worker";
const AUTIV_JWT_TTL_SECONDS = Number(process.env.AUTIV_JWT_TTL_SECONDS || "60");
const AUTIV_JWT_KEY_ID = process.env.AUTIV_JWT_KEY_ID || "autiv-key";
const PRIVY_ENVIRONMENT = (process.env.PRIVY_ENVIRONMENT || "production").toLowerCase();
const PRIVY_JWKS_URL =
  process.env.PRIVY_JWKS_URL ||
  (PRIVY_ENVIRONMENT === "staging" || PRIVY_ENVIRONMENT === "development"
    ? `https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`
    : `https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`);

if (!WORKER_URL || !WORKER_SHARED_SECRET) {
  throw new Error("WORKER_URL and WORKER_SHARED_SECRET must be defined for issue_token function");
}
if (!AUTIV_JWT_PRIVATE_KEY) {
  throw new Error("AUTIV_JWT_PRIVATE_KEY must be defined for issue_token function");
}
if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET must be defined for issue_token function");
}

const privyJwks = createRemoteJWKSet(new URL(PRIVY_JWKS_URL));

function generateHmacSignature(method, path, timestamp, nonce, bodyHash, secret) {
  const signingString = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  return crypto.createHmac("sha256", secret).update(signingString).digest("hex");
}

function hashString(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

async function makeWorkerRequest(endpoint, options = {}) {
  const method = options.method || "POST";
  const body = options.body || "";
  const headers = options.headers || {};

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const bodyHash = hashString(body);
  const signature = generateHmacSignature(method, endpoint, timestamp, nonce, bodyHash, WORKER_SHARED_SECRET);

  const requestOptions = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Timestamp": timestamp,
      "X-Request-Nonce": nonce,
      "X-Signature": signature,
      ...headers,
    },
    body: method === "GET" ? undefined : body,
  };

  const response = await fetch(`${WORKER_URL}${endpoint}`, requestOptions);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

async function fetchPrivyUser(idToken) {
  const { payload } = await jwtVerify(idToken, privyJwks, {
    issuer: "privy.io",
    audience: PRIVY_APP_ID,
  });
  return payload;
}

function extractSafeEmail(user) {
  if (!user) return null;

  if (user.email?.address) {
    return user.email.address;
  }

  if (user.google?.email) {
    return user.google.email;
  }

  const linkedAccountsRaw = user.linked_accounts;
  let linkedAccounts = Array.isArray(linkedAccountsRaw) ? linkedAccountsRaw : null;

  if (!linkedAccounts && typeof linkedAccountsRaw === "string") {
    try {
      const parsed = JSON.parse(linkedAccountsRaw);
      if (Array.isArray(parsed)) {
        linkedAccounts = parsed;
      }
    } catch (err) {
      console.warn("Failed to parse linked_accounts string", err);
    }
  }

  if (linkedAccounts) {
    const emailAccount = linkedAccounts.find((acct) => acct?.type === "email" && acct?.address);
    if (emailAccount) {
      return emailAccount.address;
    }
    const googleAccount = linkedAccounts.find((acct) => acct?.type === "google_oauth" && acct?.email);
    if (googleAccount) {
      return googleAccount.email;
    }
  }

  return null;
}

function signAutivJwt(claims) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + AUTIV_JWT_TTL_SECONDS,
    iss: AUTIV_JWT_ISSUER,
    aud: AUTIV_JWT_AUDIENCE,
    jti: crypto.randomUUID(),
    ...claims,
  };

  return jwt.sign(payload, AUTIV_JWT_PRIVATE_KEY, {
    algorithm: "RS256",
    keyid: AUTIV_JWT_KEY_ID,
  });
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const authorization =
      event.headers["privy-id-token"] ||
      event.headers["Privy-Id-Token"] ||
      event.headers.authorization ||
      event.headers.Authorization;

    if (!authorization) {
      return {
        statusCode: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing Privy identity token" }),
      };
    }

    const privyToken = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : authorization;

    let privyUser;

    try {
      privyUser = await fetchPrivyUser(privyToken);
    } catch (err) {
      console.error("Privy identity token verification failed", err);
      return {
        statusCode: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Invalid Privy identity token" }),
      };
    }

    const userId = privyUser?.id || privyUser?.sub;
    const email = extractSafeEmail(privyUser);

    if (!userId || !email) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Unable to derive user identity" }),
      };
    }

    let developerId = null;
    try {
      const workerResponse = await makeWorkerRequest("/api/get-developer-info", {
        method: "POST",
        body: "",
        headers: {
          "X-User-Email": email,
        },
      });

      if (workerResponse.status === 200 && workerResponse.data?.found && workerResponse.data.developer?.id) {
        developerId = workerResponse.data.developer.id;
      }
    } catch (err) {
      console.warn("Failed to resolve developer info", err?.message || err);
    }

    const autivToken = signAutivJwt({ sub: userId, email, developerId });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: autivToken,
        expiresIn: AUTIV_JWT_TTL_SECONDS,
        issuedAt: Math.floor(Date.now() / 1000),
        developerId,
      }),
    };
  } catch (error) {
    console.error("issue_token error", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
