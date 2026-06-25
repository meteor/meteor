# force-ssl

`force-ssl` makes your Meteor server redirect insecure connections (HTTP) to a secure URL (HTTPS), ensuring that communication with the server is always encrypted and protecting users from active spoofing attacks.

```bash
meteor add force-ssl
```

The package is `prodOnly`, so it only takes effect in production builds — it does not interfere with local development.

## Usage

**Just adding the package is all you do in your app — there is no code to write and no setting to configure.** `force-ssl` exposes no JavaScript API, no `Meteor.settings` options, and no `mobile-config` preferences. Once it is in your project, every production HTTP request is redirected to HTTPS automatically.

The only requirements live at the **deployment layer**, not in your Meteor code:

1. **A proxy must terminate SSL in front of your app and forward the protocol.** Meteor bundles (`meteor build`) do not include an HTTPS server or certificate, so a proxy (HAProxy, nginx, a load balancer, your hosting platform, etc.) handles TLS and must set the `x-forwarded-proto` or `forwarded` ([RFC 7239](https://tools.ietf.org/html/rfc7239)) header. `force-ssl` reads that header to decide whether the original connection was already secure; if it was, the request passes through, otherwise it answers with a `302` redirect to the `https://` URL.
2. **`ROOT_URL` must point at your real public hostname.** The redirect target host is derived from `Meteor.absoluteUrl()` (i.e. your `ROOT_URL` environment variable).

A couple of behaviors worth knowing:

- **Local development is unaffected.** Connections coming entirely over `localhost` are always allowed over plain HTTP, so you don't need HTTPS while developing.
- **WebSockets are not redirected.** The redirect applies to regular HTTP requests; the package's own source notes it does not handle the WebSocket `upgrade` request.

## Configuring your proxy

Because `force-ssl` decides via the `x-forwarded-proto` / `forwarded` header, the proxy in front of your app must set it. Two common examples:

**nginx:**

```nginx
location / {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;   # <-- required by force-ssl
  proxy_pass http://127.0.0.1:3000;
}
```

**HAProxy:**

```
http-request set-header X-Forwarded-Proto https if { ssl_fc }
```

If your proxy already issues the HTTP→HTTPS redirect itself, you don't need this package at all.

> **Note:** `force-ssl` only performs the redirect; it does **not** send an `Strict-Transport-Security` (HSTS) header. If you want HSTS, set it on your proxy or in your own middleware.

## Production gotchas

- **Adding the package forces `Meteor.absoluteUrl()` to be secure.** `force-ssl` sets `Meteor.absoluteUrl.defaultOptions.secure = true`, so all generated absolute URLs become `https://`. Make sure your `ROOT_URL` reflects your real public host.
- **The proxy must own the `X-Forwarded-Proto` header.** A client could otherwise spoof it to bypass the redirect. Your proxy should always set/overwrite the header rather than passing through a client-supplied value. If the proxy terminates TLS but does **not** forward the proto header, you'll get an infinite HTTP→HTTPS redirect loop.
- **Non-standard HTTPS ports are dropped.** The redirect strips the port (`host.replace(/:\d+$/, '')`) and always targets the default HTTPS port (443). Serving HTTPS on a custom port will produce a broken redirect.
- **Verify it works:** an insecure request should return a `302` redirect to the `https://` URL. If you see a redirect loop, the proxy isn't forwarding the proto header correctly.

## How it works

`force-ssl` runs on the server (it builds on `webapp` and `ddp`) and redirects incoming HTTP requests to HTTPS. To detect whether a connection arrived over HTTPS, it relies on the proxy that terminates SSL in front of your app:

- Meteor bundles (i.e. `meteor build`) **do not** include an HTTPS server or certificate. A proxy server that terminates SSL in front of a Meteor bundle must set the `x-forwarded-proto` or `forwarded` ([RFC 7239](https://tools.ietf.org/html/rfc7239)) header for this package to work.
- A heuristic on that header is used to guess whether the app is running in development. To simplify development, unencrypted connections from `localhost` are always accepted over HTTP.

## When to use it

This package is recommended only for deployment platforms that do not have their own ability to force SSL:

- If you deploy with **Galaxy**, use the "Force HTTPS" setting (on the specific domain, under **Domains & Encryption** in your application's **Settings** tab) instead of this package.
- If you use another platform, prefer providing the HTTP→HTTPS redirect on the proxy that terminates your SSL (e.g. HAProxy, nginx), outside of Meteor and without this package.

> This documentation is grounded in the package's `README.md` and `package.js`. `force-ssl` exposes no public JavaScript API — adding the package is all that is required.
