import { RoutePolicy } from "meteor/routepolicy";
import { WebApp } from "meteor/webapp";

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) {
      if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
        resolve(req.body);
        return;
      }

      resolve(JSON.stringify(req.body));
      return;
    }

    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function mountBetterAuthHandler(
  auth,
  basePath = "/api/auth",
  toNodeHandler
) {
  RoutePolicy.declare(`${basePath}/`, "network");

  if (toNodeHandler) {
    WebApp.handlers.use(basePath, toNodeHandler(auth));
    return;
  }

  WebApp.handlers.use(basePath, async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const host = req.headers.host;
      const url = `${protocol}://${host}${basePath}${req.url}`;
      const headers = new Headers();

      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) {
          continue;
        }

        if (Array.isArray(value)) {
          value.forEach((item) => headers.append(key, item));
        } else {
          headers.set(key, value);
        }
      }

      const requestInit = {
        headers,
        method: req.method,
      };

      if (req.method !== "GET" && req.method !== "HEAD") {
        requestInit.body = await readRequestBody(req);

        if (!headers.has("content-type") && requestInit.body) {
          headers.set("content-type", "application/json");
        }
      }

      const response = await auth.handler(new Request(url, requestInit));

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
          const cookies = response.headers.getSetCookie
            ? response.headers.getSetCookie()
            : [value];

          cookies.forEach((cookie) => res.appendHeader("Set-Cookie", cookie));
          return;
        }

        res.setHeader(key, value);
      });

      if (!response.body) {
        res.end();
        return;
      }

      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        res.write(value);
      }

      res.end();
    } catch (error) {
      console.error("[meteor-accounts-better-auth] Handler error:", error);

      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }
  });
}
