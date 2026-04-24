/**
 * FederatedCollection extension registry (mirrors Mongo.Collection extensions).
 *
 * External packages register prototype methods, static methods, or constructor
 * hooks here; `applyExtensions(instance, name, options)` is called from the
 * FederatedCollection constructor and `installStatics(Class)` wires the
 * static-method accessors onto the class at module load.
 */

export const CollectionExtensions = {
  _extensions: [],
  _prototypeMethods: new Map(),
  _staticMethods: new Map(),

  addExtension(ext) { this._extensions.push(ext); },
  removeExtension(ext) { this._extensions = this._extensions.filter(e => e !== ext); },
  addPrototypeMethod(name, method) { this._prototypeMethods.set(name, method); },
  removePrototypeMethod(name) { this._prototypeMethods.delete(name); },
  addStaticMethod(name, method) { this._staticMethods.set(name, method); },
  removeStaticMethod(name) { this._staticMethods.delete(name); },
  clearExtensions() {
    this._extensions = [];
    this._prototypeMethods.clear();
    this._staticMethods.clear();
  },
  getExtensions() { return [...this._extensions]; },
  getPrototypeMethods() { return new Map(this._prototypeMethods); },
  getStaticMethods() { return new Map(this._staticMethods); },

  applyExtensions(instance, name, options) {
    for (const ext of this._extensions) {
      ext.call(instance, name, options);
    }
    for (const [methodName, method] of this._prototypeMethods) {
      instance[methodName] = method.bind(instance);
    }
  },
};

/**
 * Install the `FederatedCollection.addExtension(...)` static API onto the
 * given class. Call once from collection.js at module load.
 */
export function installStatics(Class) {
  Class.addExtension = (ext) => CollectionExtensions.addExtension(ext);
  Class.removeExtension = (ext) => CollectionExtensions.removeExtension(ext);
  Class.addPrototypeMethod = (name, method) => CollectionExtensions.addPrototypeMethod(name, method);
  Class.removePrototypeMethod = (name) => CollectionExtensions.removePrototypeMethod(name);
  Class.addStaticMethod = (name, method) => {
    CollectionExtensions.addStaticMethod(name, method);
    Class[name] = method;
  };
  Class.removeStaticMethod = (name) => {
    CollectionExtensions.removeStaticMethod(name);
    delete Class[name];
  };
  Class.clearExtensions = () => CollectionExtensions.clearExtensions();
  Class.getExtensions = () => CollectionExtensions.getExtensions();
  Class.getPrototypeMethods = () => CollectionExtensions.getPrototypeMethods();
  Class.getStaticMethods = () => CollectionExtensions.getStaticMethods();
}
