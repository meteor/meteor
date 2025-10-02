import { Tinytest } from "meteor/tinytest";
import { fetch, Headers, Request, Response } from "meteor/fetch";

Tinytest.addAsync("Fetch - TypeScript types - fetch function", async (test, done) => {
  const response: Response = await fetch("https://httpbin.org/get");
  const ok: boolean = response.ok;
  const status: number = response.status;

  test.equal(typeof ok, "boolean");
  test.equal(typeof status, "number");
  done();
});

Tinytest.add("Fetch - TypeScript types - Headers constructor", (test) => {
  const headers: Headers = new Headers();
  headers.append("Content-Type", "application/json");

  const contentType: string | null = headers.get("Content-Type");
  test.equal(contentType, "application/json");
});

Tinytest.add("Fetch - TypeScript types - Headers with object", (test) => {
  const headers: Headers = new Headers({
    "Content-Type": "application/json",
    "X-Custom-Header": "value"
  });

  const hasHeader: boolean = headers.has("Content-Type");
  test.equal(hasHeader, true);
});

Tinytest.add("Fetch - TypeScript types - Request constructor", (test) => {
  const request: Request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  const method: string = request.method;
  const url: string = request.url;

  test.equal(method, "POST");
  test.equal(typeof url, "string");
});

Tinytest.add("Fetch - TypeScript types - Response constructor", (test) => {
  const response: Response = new Response("body content", {
    status: 200,
    statusText: "OK",
    headers: {
      "Content-Type": "text/plain"
    }
  });

  const status: number = response.status;
  const statusText: string = response.statusText;
  const ok: boolean = response.ok;

  test.equal(status, 200);
  test.equal(statusText, "OK");
  test.equal(ok, true);
});

Tinytest.addAsync("Fetch - TypeScript types - Response methods", async (test, done) => {
  const response: Response = new Response('{"key": "value"}');

  const json: any = await response.json();
  test.equal(json.key, "value");
  done();
});

Tinytest.addAsync("Fetch - TypeScript types - Response text", async (test, done) => {
  const response: Response = new Response("Hello World");

  const text: string = await response.text();
  test.equal(text, "Hello World");
  done();
});

Tinytest.add("Fetch - TypeScript types - Headers iteration", (test) => {
  const headers: Headers = new Headers({
    "Content-Type": "application/json",
    "X-Custom": "value"
  });

  let count = 0;
  headers.forEach((value: string, key: string) => {
    test.equal(typeof value, "string");
    test.equal(typeof key, "string");
    count++;
  });

  test.equal(count > 0, true);
});
