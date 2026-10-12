"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.performHttpRequest = performHttpRequest;
async function performHttpRequest(input, signal) {
    const method = input.method.toUpperCase();
    const response = await fetch(input.url, {
        method,
        headers: input.headers,
        body: method === "GET" || method === "HEAD" ? undefined : input.body,
        redirect: "follow",
        signal,
    });
    return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers, ([key, value]) => `${key}: ${value}`),
        body: await response.text(),
    };
}
