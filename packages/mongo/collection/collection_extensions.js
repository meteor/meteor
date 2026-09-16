/**
 * Collection Extensions System
 * 
 * Provides a clean way to extend Mongo.Collection functionality
 * without monkey patching. Supports constructor extensions,
 * prototype methods, and static methods.
 */

if (Package['lai:collection-extensions']) {
  console.warn('lai:collection-extensions is not deprecated. Use Mongo.Collection.addExtension instead.');
}

CollectionExtensions = {
  _extensions: [],
  _prototypeMethods: new Map(),
  _staticMethods: new Map(),
  
  /**
   * Add a constructor extension function
   * Extension function is called with (name, options) and 'this' bound to collection instance
   */
  addExtension(extension) {
    if (typeof extension !== 'function') {
      throw new Error('Extension must be a function');
    }
    this._extensions.push(extension);
  },
  
  /**
   * Add a prototype method to all collection instances
   * Method is bound to the collection instance
   */
  addPrototypeMethod(name, method) {
    if (typeof name !== 'string' || !name) {
      throw new Error('Prototype method name must be a non-empty string');
    }
    if (typeof method !== 'function') {
      throw new Error('Prototype method must be a function');
    }
    
    this._prototypeMethods.set(name, method);
  },
  
  /**
   * Add a static method to the Mongo.Collection constructor
   */
  addStaticMethod(name, method) {
    if (typeof name !== 'string' || !name) {
      throw new Error('Static method name must be a non-empty string');
    }
    if (typeof method !== 'function') {
      throw new Error('Static method must be a function');
    }
    
    this._staticMethods.set(name, method);
  },
  
  /**
   * Remove an extension (useful for testing)
   */
  removeExtension(extension) {
    const index = this._extensions.indexOf(extension);
    if (index > -1) {
      this._extensions.splice(index, 1);
    }
  },
  
  /**
   * Remove a prototype method
   */
  removePrototypeMethod(name) {
    this._prototypeMethods.delete(name);
  },
  
  /**
   * Remove a static method
   */
  removeStaticMethod(name) {
    this._staticMethods.delete(name);
  },
  
  /**
   * Clear all extensions (useful for testing)
   */
  clearExtensions() {
    this._extensions.length = 0;
    this._prototypeMethods.clear();
    this._staticMethods.clear();
  },
  
  /**
   * Get all registered extensions (useful for debugging)
   */
  getExtensions() {
    return [...this._extensions];
  },
  
  /**
   * Get all registered prototype methods (useful for debugging)
   */
  getPrototypeMethods() {
    return new Map(this._prototypeMethods);
  },
  
  /**
   * Get all registered static methods (useful for debugging)
   */
  getStaticMethods() {
    return new Map(this._staticMethods);
  },
  

  
  /**
   * Apply all extensions to a collection instance
   * Called during collection construction
   */
  _applyExtensions(instance, name, options) {
    // Apply constructor extensions
    for (const extension of this._extensions) {
      try {
        extension.call(instance, name, options);
      } catch (error) {
        // Provide helpful error context
        throw new Error(`Extension failed for collection '${name}': ${error.message}`);
      }
    }
    
    // Apply prototype methods
    for (const [methodName, method] of this._prototypeMethods) {
      instance[methodName] = method.bind(instance);
    }
  },
  
  /**
   * Apply static methods to the Mongo.Collection constructor
   * Called during package initialization
   */
  _applyStaticMethods(CollectionConstructor) {
    for (const [methodName, method] of this._staticMethods) {
      CollectionConstructor[methodName] = method;
    }
  },
  

}; 