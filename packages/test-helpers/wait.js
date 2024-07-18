function isPromise(obj) {
  return obj && typeof obj.then === 'function';
}

waitUntil = function _waitUntil(checkFunction, { timeout = 15_000, interval = 200, leading = true, description = '' } = {}) {
  let waitTime = interval;
  return new Promise((resolve, reject) => {
    if (leading && checkFunction()) {
      resolve();
      return;
    }
    const handler = setInterval(() => {
      const shouldWait = checkFunction();
      if (isPromise(shouldWait)) {
        shouldWait
          .then(_shouldWait => {
            if (_shouldWait) {
              resolve();
              clearInterval(handler);
              return;
            }

            if (waitTime > timeout) {
              console.error(description, 'timed out');
              reject();
              clearInterval(handler);
            }

            waitTime += interval;
          })
          .catch((_error) => {
            console.error(description, _error?.message);
            reject();
            clearInterval(handler);
          });
      } else if (shouldWait) {
        resolve();
        clearInterval(handler);
      } else {
        if (waitTime > timeout) {
          console.error(description, 'timed out');
          reject();
          clearInterval(handler);
        }
        waitTime += interval;
      }
    }, interval);
  });
};
