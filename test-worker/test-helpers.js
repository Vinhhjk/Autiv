// test-helpers.js
import crypto from "crypto";
import dotenv from "dotenv"
dotenv.config()
export const WORKER_URL = "https://autiv-worker.nguyenvinh5005.workers.dev/api/verify-key";
export const SECRET = process.env.SECRET
export const METHOD = "POST";

export function makeSigningString(method, path, timestamp, nonce, body) {
  const bodyHash = crypto.createHash("sha256").update(body || "").digest("hex");
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

export function sign(secret, signingString) {
  return crypto.createHmac("sha256", secret).update(signingString).digest("hex");
}
