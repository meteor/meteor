// Returns an async function that will be executed at most one time,
// no matter how often you call it. Useful for lazy initialization.
export const onceAsync = func => {
  let ran = false;
  let memo = undefined;
  return async function executeOnce() {
    if (ran) return memo;
    const memoPromise = func.apply(this, arguments);
    memo = await memoPromise;
    func = null;
    ran = true;
    return memo;
  };
};
