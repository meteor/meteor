# force-ssl

`force-ssl` makes your Meteor server redirect insecure connections (HTTP) to a secure URL (HTTPS), ensuring that communication with the server is always encrypted and protecting users from active spoofing attacks.

```bash
meteor add force-ssl
```

The package is `prodOnly`, so it only takes effect in production builds — it does not interfere with local development.

## How it works

`force-ssl` runs on the server (it builds on `webapp` and `ddp`) and redirects incoming HTTP requests to HTTPS. To detect whether a connection arrived over HTTPS, it relies on the proxy that terminates SSL in front of your app:

- Meteor bundles (i.e. `meteor build`) **do not** include an HTTPS server or certificate. A proxy server that terminates SSL in front of a Meteor bundle must set the `x-forwarded-proto` or `forwarded` ([RFC 7239](https://tools.ietf.org/html/rfc7239)) header for this package to work.
- A heuristic on that header is used to guess whether the app is running in development. To simplify development, unencrypted connections from `localhost` are always accepted over HTTP.

## When to use it

This package is recommended only for deployment platforms that do not have their own ability to force SSL:

- If you deploy with **Galaxy**, use the "Force HTTPS" setting (on the specific domain, under **Domains & Encryption** in your application's **Settings** tab) instead of this package.
- If you use another platform, prefer providing the HTTP→HTTPS redirect on the proxy that terminates your SSL (e.g. HAProxy, nginx), outside of Meteor and without this package.

> This documentation is grounded in the package's `README.md` and `package.js`. `force-ssl` exposes no public JavaScript API — adding the package is all that is required.
