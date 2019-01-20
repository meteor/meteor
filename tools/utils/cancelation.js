class CancelError extends Error {}

export class CancelToken {
  constructor(exec) {
    let requested = false;
    let message;

    exec(function cancel(reason = "cancelation requested") {
      requested = true;
      message = String(reason);
    });

    this.throwIfRequested = function () {
      // It's important to introduce a gap that's long enough for file
      // change notifications to fire, and only setTimeout seems to work.
      new Promise(resolve => setTimeout(resolve, 0)).await();
      if (requested) {
        throw new CancelError(message);
      }
    };
  }

  static isCancelError(error) {
    return error instanceof CancelError;
  }

  static fromPromise(promise) {
    return new this(cancel => {
      promise.then(
        result => cancel(),
        error => cancel(error.message),
      );
    });
  }

  static empty() {
    return Object.create(CancelToken.prototype);
  }

  throwIfRequested() {}
}
