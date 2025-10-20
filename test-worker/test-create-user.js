// test-create-user.js
import crypto from "crypto";
import dotenv from "dotenv"
dotenv.config()
const WORKER_URL = "https://autiv-worker.nguyenvinh5005.workers.dev/api/create-user";
const SECRET = process.env.SECRET
const METHOD = "POST";

// The JSON body you want to create the user with
const BODY = JSON.stringify({
  email: "sample232.user@email.com",
  wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
  smart_account_address: "0xabcdefabcdefabcdefabcdefabcdefabcdef"
});

const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomBytes(16).toString("hex");

// body hash = SHA256 of BODY string
const bodyHash = crypto.createHash("sha256").update(BODY).digest("hex");

// signing string must exactly match worker's construction
const signingString = `${METHOD}\n/api/create-user\n${timestamp}\n${nonce}\n${bodyHash}`;

// HMAC
const signature = crypto.createHmac("sha256", SECRET).update(signingString).digest("hex");

// Send request
const res = await fetch(WORKER_URL, {
  method: METHOD,
  headers: {
    "Content-Type": "application/json",
    "X-Request-Timestamp": timestamp,
    "X-Request-Nonce": nonce,
    "X-Signature": signature,
  },
  body: BODY,
});

console.log(res.status, await res.text());
