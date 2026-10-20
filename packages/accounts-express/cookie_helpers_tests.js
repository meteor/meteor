import { ServerResponse } from "node:http";
import { clearCookieOnResponse, setCookieOnResponse } from "./cookie_helpers.js";

for (const [operation, applyCookie, expectedCookie] of [
  [
    "login",
    (res, req) => setCookieOnResponse(res, req, "login/token+", new Date("2030-01-01T00:00:00Z")),
    "meteor_login_token=login%2Ftoken%2B; Path=/; Expires=Tue, 01 Jan 2030 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
  ],
  [
    "logout",
    clearCookieOnResponse,
    "meteor_login_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
  ],
]) {
  Tinytest.add(
    `accounts-express - cookies - ${operation} preserves application cookies`,
    (test) => {
      for (const existing of [
        undefined,
        "csrf=existing; HttpOnly",
        ["csrf=existing", "flash=message"],
      ]) {
        const req = { method: "POST", headers: {}, protocol: "https" };
        const res = new ServerResponse(req);
        const existingCookies = existing === undefined ? [] : [].concat(existing);
        if (existing !== undefined) res.setHeader("Set-Cookie", existing);

        applyCookie(res, req);

        test.equal([].concat(res.getHeader("Set-Cookie")), [...existingCookies, expectedCookie]);
      }
    },
  );
}
