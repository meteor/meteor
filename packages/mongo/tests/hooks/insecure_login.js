export const InsecureLogin = {
  queue: [],
  ran: false,
  resolver: null,
  readyPromise: null,
  ready: async function (callback) {
    this.queue.push(callback)
    if (this.ran) {
      await this.unwind()
    } else {
      if (!this.readyPromise) {
        this.readyPromise = new Promise((resolve) => {
          this.resolver = resolve
        })
      }
      return this.readyPromise
    }
  },
  run: async function () {
    await this.unwind()
    this.ran = true
  },
  unwind: async function () {
    // Capture and clear state before processing so that any thrown error
    // doesn't leave the queue in a corrupt state for subsequent ready() calls.
    const callbacks = this.queue
    const resolver = this.resolver
    this.queue = []
    this.readyPromise = null
    this.resolver = null

    try {
      for (const cb of callbacks) {
        await cb()
      }
    } finally {
      if (resolver) resolver()
    }
  }
}
