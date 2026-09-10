require("@meteorjs/reify/lib/runtime").enable(
  module.constructor.prototype
);

if (typeof globalThis.__meteorWrapPackageGetter === "function") {
  const Mp = module.constructor.prototype;
  if (!Mp.export.__pkgWrapped) {
    const origExport = Mp.export;
    Mp.export = function (getters, constant) {
      if (getters && typeof getters === "object" && typeof this.id === "string" && this.id.startsWith("/node_modules/meteor/")) {
        const wrapped = {};
        for (const key of Object.keys(getters)) {
          wrapped[key] = globalThis.__meteorWrapPackageGetter(this.id, getters[key]);
        }
        return origExport.call(this, wrapped, constant);
      }
      return origExport.call(this, getters, constant);
    };
    Mp.export.__pkgWrapped = true;
  }
}

