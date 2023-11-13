function unsupported () {
  throw new Error('Fibers are not supported');
}

export const Fiber = function Fiber () {
  throw new Error('Fibers are not supported');
};

Fiber.yield = unsupported;
Fiber.current = undefined;

export const Future = function () {
  throw new Error('fibers/future is not supported');
};

Future.wrap = unsupported;
Future.task = unsupported;
Future.wait = unsupported;
Future.fromPromise = unsupported;
