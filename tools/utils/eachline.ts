const split = require("split2");
const pipe = require("multipipe");

import { Transform, Stream } from "stream";

type LineTransformer = (line: string) => string | Promise<string>

export function eachline(stream: Stream, callback: LineTransformer) {
  stream.pipe(transform(callback));
}

export function transform(callback: LineTransformer) {
  const splitStream = split(/\r?\n/, null, {
    trailing: false
  });

  const transform = new Transform();

  transform._transform = async function (chunk, _encoding, done) {
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
