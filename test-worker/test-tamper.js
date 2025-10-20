// test-tamper.js
import fetch from "node-fetch";
import crypto from "crypto";
import { WORKER_URL, SECRET, METHOD, makeSigningString, sign } from "./test-helpers.js";

const originalBody = JSON.stringify({ test: "hi" });
const path = "/api/verify-key";
const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomBytes(8).toString("hex");
const signingString = makeSigningString(METHOD, path, timestamp, nonce, originalBody);
const signature = sign(SECRET, signingString);

// attacker changes body after capturing signature:
const tamperedBody = JSON.stringify({ test: "hacked" });

const res = await fetch(WORKER_URL, {
  method: METHOD,
  headers: {
    "Content-Type": "application/json",
    "X-Request-Timestamp": timestamp,
    "X-Request-Nonce": nonce,
    "X-Signature": signature
  },
  body: tamperedBody
});
console.log(res.status, await res.text());
