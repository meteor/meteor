import npmConnect from "connect";

export function connect(...connectArgs) {
  const handlers = npmConnect.apply(this, connectArgs);
  const originalUse = handlers.use;

  // Wrap the handlers.use method so that any provided handler functions
  // always run in a Fiber.
  handlers.use = function use(...useArgs) {
    const { stack } = this;
    const originalLength = stack.length;
    const result = originalUse.apply(this, useArgs);

    // If we just added anything to the stack, wrap each new entry.handle
    // with a function that calls Promise.asyncApply to ensure the
    // original handler runs in a Fiber.
    for (let i = originalLength; i < stack.length; ++i) {
      const entry = stack[i];
      const originalHandle = entry.handle;

      if (originalHandle.length >= 4) {
        // If the original handle had four (or more) parameters, the
        // wrapper must also have four parameters, since connect uses
        // handle.length to determine whether to pass the error as the first
        // argument to the handle function.
        entry.handle = function handle(err, req, res, next) {
          return Promise.asyncApply(originalHandle, this, arguments);
        };
      } else {
        entry.handle = function handle(req, res, next) {
          return Promise.asyncApply(originalHandle, this, arguments);
        };
      }
    }

    return result;
  };

  return handlers;
}
