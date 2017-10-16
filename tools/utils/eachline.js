import split from "split2";
import pipe from "multipipe";
import { Transform } from "stream";

export function eachline(stream, callback) {
  stream.pipe(transform(callback));
}

export function transform(callback) {
  const splitStream = split(/\r?\n/, null, {
    trailing: false
  });

  const transform = new Transform();

  transform._transform = async function (chunk, encoding, done) {
    let line = chunk.toString("utf8");
    try {
      line = await callback(line);
    } catch (error) {
      done(error);
      return;
    }
    done(null, line);
  };

  return pipe(
    splitStream,
    transform,
  );
}
