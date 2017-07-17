import split from "split";
import { Transform } from "stream";

export function eachline(stream, callback) {
  stream.pipe(transform(callback));
}

export function transform(callback) {
  const t = new Transform();

  t._transform = async function (chunk, encoding, done) {
    let line = chunk.toString("utf8");
    try {
      line = await callback(line);
    } catch (error) {
      done(error);
      return;
    }
    done(null, line);
  };

  return split(/\r?\n/, null, {
    trailing: false
  }).pipe(t);
}
