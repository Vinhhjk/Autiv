// test-get-user-subscriptions.js
import crypto from "crypto";
import dotenv from "dotenv"
dotenv.config()
const WORKER_URL = "https://autiv-worker.nguyenvinh5005.workers.dev/api/get-user-subscriptions";
const SECRET = process.env.SECRET
const METHOD = "POST";
const BODY = ""; // empty canonical body for simplicity

const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomBytes(16).toString("hex"); // 128-bit nonce

// body hash = SHA256 of empty string
const bodyHash = crypto.createHash("sha256").update(BODY).digest("hex");

// signing string must exactly match worker's construction
const signingString = `${METHOD}\n/api/get-user-subscriptions\n${timestamp}\n${nonce}\n${bodyHash}`;

// HMAC
const signature = crypto.createHmac("sha256", SECRET).update(signingString).digest("hex");

// Send request with X-User-Email header
const res = await fetch(WORKER_URL, {
  method: METHOD,
  headers: {
    "Content-Type": "application/json",
    "X-Request-Timestamp": timestamp,
    "X-Request-Nonce": nonce,
    "X-Signature": signature,
    "X-User-Email": "sample.user@email.com" // Use user email instead of ID
  },
  body: BODY,
});

console.log(res.status, await res.text());
