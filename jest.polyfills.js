// Jest loads this file before test modules are evaluated.
// Keep it CommonJS so we can set globals before requiring dependencies.

const { TextDecoder, TextEncoder } = require("util");
const { ReadableStream } = require("stream/web");

if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
if (!global.ReadableStream) global.ReadableStream = ReadableStream;

// Provide fetch/Request/Response/Headers in the Jest JSDOM VM context.
// (JSDOM doesn't automatically expose Node's built-in fetch globals.)
const { fetch, Headers, Request, Response } = require("undici");

global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;

// NextResponse.json relies on the newer Fetch standard `Response.json()` helper.
if (global.Response && typeof global.Response.json !== "function") {
  global.Response.json = (data, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return new Response(JSON.stringify(data), { ...init, headers });
  };
}
