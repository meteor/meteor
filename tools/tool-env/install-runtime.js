"use strict";

// This module gets imported again in install-promise.js, but we might as
// well import it here as well, in case we ever stop using meteor-promise.
require("./wrap-fibers.js");

// Install ES2015-complaint polyfills for Object, Array, String, Function,
// Symbol, Map, Set, and Promise, patching the native implementations when
// they are available.
require("./install-promise.js");

// Installs source map support with a hook to add functions to look for
// source maps in custom places.
require('./source-map-retriever-stack.js');
