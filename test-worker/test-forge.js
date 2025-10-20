// test-forge.js
import fetch from "node-fetch";
import crypto from "crypto";
import { WORKER_URL, METHOD } from "./test-helpers.js";

const BODY = "";
const path = "/api/verify-key";
const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomBytes(8).toString("hex");
const fakeSignature = crypto.randomBytes(32).toString("hex");

const res = await fetch(WORKER_URL, {
  method: METHOD,
  headers: {
    "Content-Type": "application/json",
    "X-Request-Timestamp": timestamp,
    "X-Request-Nonce": nonce,
    "X-Signature": fakeSignature
  },
  body: BODY
});
console.log(res.status, await res.text());
