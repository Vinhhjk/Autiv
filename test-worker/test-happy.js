// test-happy.js
import fetch from "node-fetch";
import { WORKER_URL, SECRET, METHOD, makeSigningString, sign } from "./test-helpers.js";
import crypto from "crypto";
const BODY = ""; // empty body for verify-key
const path = "/api/verify-key";
const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomBytes(8).toString("hex");

const signingString = makeSigningString(METHOD, path, timestamp, nonce, BODY);
const signature = sign(SECRET, signingString);

const res = await fetch(WORKER_URL, {
  method: METHOD,
  headers: {
    "Content-Type": "application/json",
    "X-Request-Timestamp": timestamp,
    "X-Request-Nonce": nonce,
    "X-Signature": signature
  },
  body: BODY
});
console.log(res.status, await res.text());
