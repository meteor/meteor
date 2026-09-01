export const InsecureLogin = {
  ensureSession: null,
  ready: async function (callback) {
    if (typeof this.ensureSession === 'function') {
      await this.ensureSession()
    }
    if (callback) {
      return await callback()
    }
  },
  run: async function () {},
}
