import split from "split";
import { bindEnvironment } from "./fiber-helpers.js";

export function eachline(stream, callback) {
  stream.pipe(transform(callback));
}

export function transform(callback) {
  const bound = bindEnvironment(callback);
  const mapper = data => bound(toUtf8(data));
  return split(/\r?\n/, mapper, {
    trailing: false
  });
}

function toUtf8(buffer) {
  return buffer && buffer.toString("utf8");
}
