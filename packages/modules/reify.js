require("@meteorjs/reify/lib/runtime").enable(
  module.constructor.prototype
);

if (typeof globalThis.__meteorWrapPackageGetter === "function") {
  var Mp = module.constructor.prototype;
  if (!Mp.export.__pkgWrapped) {
    var origExport = Mp.export;
    Mp.export = function (getters, constant) {
      if (getters && typeof getters === "object" && typeof this.id === "string" && this.id.indexOf("/node_modules/meteor/") === 0) {
        var self = this;
        var wrapped = {};
        Object.keys(getters).forEach(function (key) {
          wrapped[key] = globalThis.__meteorWrapPackageGetter(self.id, getters[key]);
        });
        return origExport.call(this, wrapped, constant);
      }
      return origExport.call(this, getters, constant);
    };
    Mp.export.__pkgWrapped = true;
  }
}

