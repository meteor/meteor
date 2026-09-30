import { expectTypeOf } from "expect-type";
import { HTTP, HTTPInternals } from "./http";

expectTypeOf(HTTP).toBeObject();
expectTypeOf<HTTP.HTTPRequest>().toBeObject();
expectTypeOf<HTTP.HTTPResponse>().toBeObject();
expectTypeOf<HTTP.AsyncCallback>().toBeFunction();
expectTypeOf(HTTP.call).toBeFunction();
expectTypeOf(HTTP.get).toBeFunction();
expectTypeOf(HTTP.post).toBeFunction();
expectTypeOf(HTTP.put).toBeFunction();
expectTypeOf(HTTP.del).toBeFunction();
expectTypeOf(HTTP.patch).toBeFunction();
expectTypeOf(HTTPInternals).toEqualTypeOf<Record<string, unknown>>();
expectTypeOf(HTTP.call("GET", "https://example.com")).toEqualTypeOf<
  Promise<HTTP.HTTPResponse>
>();
expectTypeOf(HTTP.get("https://example.com", (_error, response) => {
  expectTypeOf(response).toEqualTypeOf<HTTP.HTTPResponse | undefined>();
})).toBeVoid();
expectTypeOf(HTTP.patch("https://example.com", { data: { enabled: true } })).toEqualTypeOf<
  Promise<HTTP.HTTPResponse>
>();
