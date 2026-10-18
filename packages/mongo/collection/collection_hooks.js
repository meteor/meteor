import { EJSON } from "meteor/ejson";
import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";

// Check if an array is empty or not an array
function isEmpty(a) {
  return !Array.isArray(a) || !a.length;
}

// accounts-base is optional: Meteor.userId only exists when it is installed.
// Read it non-reactively so a hooked find() inside an autorun doesn't start
// depending on the login state.
function getClientUserId() {
  if (typeof Meteor.userId !== "function") return undefined;
  return Tracker.nonreactive(() => Meteor.userId());
}

// Resolve the userId passed to hooks. The client prefers the logged-in user;
// both sides then fall back to the current method or publication invocation,
// and finally to CollectionHooks.defaultUserId. On the server, outside of any
// DDP context and without a default, this returns undefined.
export function getHookUserId() {
  let userId = Meteor.isClient ? getClientUserId() : undefined;

  if (userId == null) {
    const invocation =
      DDP._CurrentMethodInvocation?.get() ||
      DDP._CurrentPublicationInvocation?.get();
    if (invocation) userId = invocation.userId ?? null;
  }

  if (userId == null && CollectionHooks.defaultUserId != null) {
    userId = CollectionHooks.defaultUserId;
  }

  return userId;
}

// Create a function that returns a transform for a given doc
function makeTransformGetter(collection) {
  return function(doc) {
    if (typeof collection._transform === "function") {
      return function(d) {
        return collection._transform(d || doc);
      };
    }
    return function(d) {
      return d || doc;
    };
  };
}

// The `this` value hooks are called with. `context` is the collection and
// `args` the normalized arguments of the operation; runners add `transform`,
// `_id`, `previous` and `affected` where they apply.
function hookContext(collection, args, extra) {
  return { context: collection, args, ...extra };
}

function addTopLevelFields(fields, params) {
  if (!params || typeof params !== "object") {
    return;
  }

  for (let field of Object.keys(params)) {
    if (field.includes(".")) field = field.substring(0, field.indexOf("."));
    if (!fields.includes(field)) fields.push(field);
  }
}

// Extract top-level field names from an update mutator
function getFields(mutator) {
  const fields = [];

  if (Array.isArray(mutator)) {
    for (const stage of mutator) {
      if (!stage || typeof stage !== "object") continue;
      for (const [op, params] of Object.entries(stage)) {
        if (op.startsWith("$")) {
          addTopLevelFields(fields, params);
        } else if (!fields.includes(op)) {
          fields.push(op);
        }
      }
    }
    return fields;
  }

  for (const [op, params] of Object.entries(mutator)) {
    if (op.startsWith("$")) {
      addTopLevelFields(fields, params);
    } else {
      addTopLevelFields(fields, { [op]: params });
    }
  }
  return fields;
}

// Merge hook options with precedence: global < timing/method defaults < user
function extendOptions(source, options, timing, method) {
  return Object.assign(
    {},
    (source && source.all && source.all.all) || {},
    (source && source[timing] && source[timing].all) || {},
    (source && source.all && source.all[method]) || {},
    (source && source[timing] && source[timing][method]) || {},
    options
  );
}

// Build a MongoDB projection from hook options (supports 'fetch' array or 'fetchFields' object)
function buildProjection(hookOptions) {
  const projection = {};
  if (
    hookOptions &&
    hookOptions.fetchFields &&
    typeof hookOptions.fetchFields === "object"
  ) {
    Object.assign(projection, hookOptions.fetchFields);
  }
  if (hookOptions && Array.isArray(hookOptions.fetch)) {
    for (const f of hookOptions.fetch) {
      projection[f] = 1;
    }
  }
  return projection;
}

function buildHookProjection(collectionOptions, hooks, timing, method) {
  const projection = {};
  Object.assign(
    projection,
    buildProjection(extendOptions(collectionOptions, {}, timing, method))
  );
  hooks.forEach(hook => {
    Object.assign(projection, buildProjection(hook.options || {}));
  });
  return projection;
}

function ensureProjectionIncludesId(projection) {
  if (
    projection &&
    Object.prototype.hasOwnProperty.call(projection, "_id") &&
    !projection._id
  ) {
    delete projection._id;
  }
}

function shouldFetchPrevious(collectionOptions, hooks, timing, method) {
  return hooks.some(hook => {
    return (
      extendOptions(collectionOptions, hook.options || {}, timing, method)
        .fetchPrevious !== false
    );
  });
}

// Hook controller returned from before/after registration calls
function createHookController(hooksArray, initialTarget, timing, method) {
  let currentTarget = initialTarget;
  return {
    replace(hook, options) {
      const idx = hooksArray.indexOf(currentTarget);
      if (idx === -1)
        throw new Error(`Hook not found in ${timing}.${method} hooks array`);
      const newTarget = {
        fn: hook,
        options: extendOptions(
          CollectionHooks.defaults,
          options,
          timing,
          method
        )
      };
      hooksArray.splice(idx, 1, newTarget);
      currentTarget = newTarget;
      return this;
    },
    remove() {
      const idx = hooksArray.indexOf(currentTarget);
      if (idx === -1)
        throw new Error(`Hook not found in ${timing}.${method} hooks array`);
      hooksArray.splice(idx, 1);
      currentTarget = null;
      return true;
    }
  };
}

// === PUBLIC API ===

export const CollectionHooks = {
  defaults: {
    before: {
      insert: {},
      update: {},
      remove: {},
      upsert: {},
      find: {},
      findOne: {},
      all: {}
    },
    after: {
      insert: {},
      update: {},
      remove: {},
      find: {},
      findOne: {},
      all: {}
    },
    all: { insert: {}, update: {}, remove: {}, find: {}, findOne: {}, all: {} }
  },

  // userId passed to hooks when none can be resolved from the current context.
  defaultUserId: undefined,

  _directEnv: new Meteor.EnvironmentVariable(),

  directOp(func) {
    return this._directEnv.withValue(true, func);
  },

  hookedOp(func) {
    return this._directEnv.withValue(false, func);
  },

  isWithinPublish() {
    return (
      DDP._CurrentPublicationInvocation &&
      DDP._CurrentPublicationInvocation.get() !== undefined
    );
  },

  // Normalize a selector to always be an object { _id: value }
  normalizeSelector(selector) {
    if (
      typeof selector === "string" ||
      (selector && selector.constructor === Mongo.ObjectID)
    ) {
      return { _id: selector };
    }
    return selector;
  }
};

// === SETUP FUNCTIONS ===
// Called from Mongo.Collection constructor (via collection.js)

const HOOK_METHODS = ["insert", "update", "remove", "find", "findOne"];

export function setupHookRegistrationMethods(collection) {
  // Initialize _hooks storage
  collection._hooks = {};
  for (const method of HOOK_METHODS) {
    collection._hooks[method] = { before: [], after: [] };
  }
  collection._hooks.upsert = { before: [] };

  // Create collection.before.METHOD() and collection.after.METHOD() registration functions
  for (const timing of ["before", "after"]) {
    collection[timing] = collection[timing] || {};
    for (const method of HOOK_METHODS) {
      const hooksArray = collection._hooks[method][timing];
      collection[timing][method] = function(hook, options) {
        const target = {
          fn: hook,
          options: extendOptions(
            CollectionHooks.defaults,
            options,
            timing,
            method
          )
        };
        hooksArray.push(target);
        return createHookController(hooksArray, target, timing, method);
      };
    }
  }

  // There is no after.upsert: an upsert fires after.insert or after.update.
  collection.before.upsert = function(hook, options) {
    const target = {
      fn: hook,
      options: extendOptions(
        CollectionHooks.defaults,
        options,
        "before",
        "upsert"
      )
    };
    collection._hooks.upsert.before.push(target);
    return createHookController(
      collection._hooks.upsert.before,
      target,
      "before",
      "upsert"
    );
  };
}

export function setupHookOptions(collection) {
  collection.hookOptions = EJSON.clone(CollectionHooks.defaults);
}

export function setupDirectMethods(collection) {
  collection.direct = {};

  const methods = [
    "insertAsync",
    "updateAsync",
    "removeAsync",
    "upsertAsync",
    "findOneAsync",
    "insert",
    "update",
    "remove",
    "upsert",
    "find",
    "findOne"
  ];
  for (const method of methods) {
    if (typeof collection[method] === "function") {
      collection.direct[method] = function(...args) {
        return CollectionHooks.directOp(() => collection[method](...args));
      };
    }
  }
}

// === DISPATCH ===

let warnedAboutCommunityPackage = false;

// Apps that still use matb33:collection-hooks get its wrappers on top of the
// core ones, and both read collection._hooks. Let the community package run
// the hooks so they don't fire twice.
function isCommunityPackageActive() {
  if (!Package["matb33:collection-hooks"]) return false;

  if (!warnedAboutCommunityPackage) {
    warnedAboutCommunityPackage = true;
    Meteor._debug(
      "matb33:collection-hooks is installed, so the collection hooks built " +
        "into the mongo package are disabled. Remove matb33:collection-hooks " +
        "to use the built-in hooks."
    );
  }
  return true;
}

// Whether `method` has hooks that should run for the current call.
export function hasActiveHooks(collection, method) {
  const hooks = collection._hooks;
  if (!hooks || CollectionHooks._directEnv.get()) return false;

  const active =
    method === "upsert"
      ? hooks.upsert.before.length ||
        hooks.insert.after.length ||
        hooks.update.after.length
      : hooks[method].before.length || hooks[method].after.length;

  return !!active && !isCommunityPackageActive();
}

// Single entry point for writes. Public mutators and allow-deny's validated
// and insecure paths call this with a `dispatch` function that performs the
// actual write; without active hooks it is called directly.
export function withMutationHooks(collection, method, args, dispatch) {
  if (!hasActiveHooks(collection, method)) return dispatch();

  switch (method) {
    case "insert":
      return runInsertHooks(collection, args[0], dispatch);
    case "update":
      return runUpdateHooks(collection, args[0], args[1], args[2] || {}, dispatch);
    case "remove":
      return runRemoveHooks(collection, args[0], dispatch);
    case "upsert":
      return runUpsertHooks(collection, args[0], args[1], args[2] || {}, dispatch);
    default:
      throw new Error(`Unknown mutation method: ${method}`);
  }
}

const warnedSyncMutators = new WeakMap();

// Hooks run for the *Async mutators only. Sync mutators only work on
// minimongo-backed collections (the client, or local collections on the
// server): warn once per collection and method when one skips hooks that are
// registered for it.
export function warnIfSyncMutatorSkipsHooks(collection, method) {
  if (
    !(collection._collection instanceof LocalCollection) ||
    !hasActiveHooks(collection, method)
  ) {
    return;
  }

  let warned = warnedSyncMutators.get(collection);
  if (!warned) {
    warned = new Set();
    warnedSyncMutators.set(collection, warned);
  }
  if (warned.has(method)) return;
  warned.add(method);

  Meteor._debug(
    `${collection._name || "Local collection"}.${method}() does not run ` +
      `collection hooks. Use ${method}Async() instead.`
  );
}

// === HOOK RUNNERS ===
// Runners are async functions, so they run synchronously until their first
// real await. Hooks are only awaited when they return a promise and local
// (minimongo) documents are fetched synchronously: with synchronous hooks
// the write is dispatched in the same tick, keeping the order of writes and
// the method invocation context intact.

// Returns the hook's result as is: callers only await it when it is a promise.
function runHook(fn, context, args) {
  return fn.apply(context, args);
}

function fetchDocs(collection, selector, options) {
  const cursor = collection._collection.find(selector, options);
  return collection._collection instanceof LocalCollection
    ? cursor.fetch()
    : cursor.fetchAsync();
}

function createDeferredPromise() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  // The links may never be read; don't report their rejection as unhandled.
  promise.catch(() => {});

  return { promise, resolve, reject };
}

const PROMISE_LINKS = ["stubPromise", "serverPromise"];

// On the client, mutators on remote collections return a promise carrying
// stubPromise and serverPromise. Run `body` (an async function receiving a
// dispatch wrapper) and give the returned promise the same links, forwarded
// from the dispatched write, or settled with the result when hooks abort.
function runMutation(collection, body) {
  if (!Meteor.isClient || !collection._isRemoteCollection()) {
    return body(dispatch => dispatch());
  }

  const links = {
    stubPromise: createDeferredPromise(),
    serverPromise: createDeferredPromise()
  };

  const promise = body(dispatch => {
    const mutatorPromise = dispatch();
    for (const key of PROMISE_LINKS) {
      Promise.resolve(mutatorPromise?.[key] ?? mutatorPromise).then(
        links[key].resolve,
        links[key].reject
      );
    }
    return mutatorPromise;
  });

  promise.then(
    value => PROMISE_LINKS.forEach(key => links[key].resolve(value)),
    error => PROMISE_LINKS.forEach(key => links[key].reject(error))
  );
  for (const key of PROMISE_LINKS) {
    promise[key] = links[key].promise;
  }

  return promise;
}

export function runInsertHooks(collection, doc, dispatch) {
  const userId = getHookUserId();
  const hooks = collection._hooks.insert;
  const getTransform = makeTransformGetter(collection);
  const args = [doc];

  return runMutation(collection, async dispatchWithLinks => {
    for (const hookEntry of hooks.before) {
      let r = runHook(
        hookEntry.fn,
        hookContext(collection, args, { transform: getTransform(doc) }),
        [userId, doc]
      );
      if (Meteor._isPromise(r)) r = await r;
      if (r === false) return undefined;
    }

    const id = await dispatchWithLinks(dispatch);

    if (!isEmpty(hooks.after)) {
      const afterDoc = EJSON.clone(doc);
      afterDoc._id = id;
      for (const hookEntry of hooks.after) {
        await hookEntry.fn.call(
          hookContext(collection, args, {
            transform: getTransform(afterDoc),
            _id: id
          }),
          userId,
          afterDoc
        );
      }
    }

    return id;
  });
}

export function runUpdateHooks(collection, selector, modifier, options, dispatch) {
  const userId = getHookUserId();
  const hooks = collection._hooks.update;
  const getTransform = makeTransformGetter(collection);
  const args = [selector, modifier, options];

  const hasBefore = !isEmpty(hooks.before);
  const hasAfter = !isEmpty(hooks.after);
  const shouldStorePrev =
    hasAfter &&
    shouldFetchPrevious(collection.hookOptions, hooks.after, "after", "update");

  // After hooks always receive the original modifier and options.
  const prevMutator = EJSON.clone(modifier);
  const prevOptions = EJSON.clone(options);

  return runMutation(collection, async dispatchWithLinks => {
    let docs = [];
    let prevDocs;

    // Before hooks need the documents; after hooks need at least their ids
    // to re-fetch them once the update is done.
    if (hasBefore || hasAfter) {
      const fetchOptions = { transform: null, reactive: false };
      if (!options.multi) fetchOptions.limit = 1;

      let projection;
      if (hasBefore || shouldStorePrev) {
        projection = {};
        if (shouldStorePrev) {
          Object.assign(
            projection,
            buildHookProjection(collection.hookOptions, hooks.after, "after", "update")
          );
        }
        if (hasBefore) {
          Object.assign(
            projection,
            buildHookProjection(collection.hookOptions, hooks.before, "before", "update")
          );
        }
        ensureProjectionIncludesId(projection);
      } else {
        projection = { _id: 1 };
      }
      if (Object.keys(projection).length > 0) fetchOptions.fields = projection;

      docs = fetchDocs(collection, selector, fetchOptions);
      if (Meteor._isPromise(docs)) docs = await docs;

      if (shouldStorePrev) {
        prevDocs = {};
        for (const doc of docs) {
          prevDocs[doc._id] = EJSON.clone(doc);
        }
      }
    }

    const fields = getFields(modifier);

    for (const hookEntry of hooks.before) {
      for (const doc of docs) {
        let r = runHook(
          hookEntry.fn,
          hookContext(collection, args, { transform: getTransform(doc) }),
          [userId, doc, fields, modifier, options]
        );
        if (Meteor._isPromise(r)) r = await r;
        if (r === false) return 0;
      }
    }

    const affected = await dispatchWithLinks(dispatch);

    if (hasAfter && docs.length > 0) {
      const afterFetchOptions = { transform: null, reactive: false };
      const afterProjection = buildHookProjection(
        collection.hookOptions,
        hooks.after,
        "after",
        "update"
      );
      ensureProjectionIncludesId(afterProjection);
      if (Object.keys(afterProjection).length > 0)
        afterFetchOptions.fields = afterProjection;

      let afterDocs = fetchDocs(
        collection,
        { _id: { $in: docs.map(d => d._id) } },
        afterFetchOptions
      );
      if (Meteor._isPromise(afterDocs)) afterDocs = await afterDocs;

      for (const hookEntry of hooks.after) {
        for (const doc of afterDocs) {
          await hookEntry.fn.call(
            hookContext(collection, args, {
              transform: getTransform(doc),
              previous: prevDocs && prevDocs[doc._id],
              affected
            }),
            userId,
            doc,
            fields,
            prevMutator,
            prevOptions
          );
        }
      }
    }

    return affected;
  });
}

export function runRemoveHooks(collection, selector, dispatch) {
  const userId = getHookUserId();
  const hooks = collection._hooks.remove;
  const getTransform = makeTransformGetter(collection);
  const args = [selector];

  return runMutation(collection, async dispatchWithLinks => {
    let docs = fetchDocs(collection, selector, {
      transform: null,
      reactive: false
    });
    if (Meteor._isPromise(docs)) docs = await docs;

    const prevDocs = isEmpty(hooks.after)
      ? []
      : docs.map(doc => EJSON.clone(doc));

    for (const hookEntry of hooks.before) {
      for (const doc of docs) {
        let r = runHook(
          hookEntry.fn,
          hookContext(collection, args, { transform: getTransform(doc) }),
          [userId, doc]
        );
        if (Meteor._isPromise(r)) r = await r;
        if (r === false) return 0;
      }
    }

    const result = await dispatchWithLinks(dispatch);

    // After hooks receive the documents as they were before the removal.
    for (const hookEntry of hooks.after) {
      for (const doc of prevDocs) {
        await hookEntry.fn.call(
          hookContext(collection, args, { transform: getTransform(doc) }),
          userId,
          doc
        );
      }
    }

    return result;
  });
}

export function runUpsertHooks(collection, selector, modifier, options, dispatch) {
  const userId = getHookUserId();
  const insertHooks = collection._hooks.insert;
  const updateHooks = collection._hooks.update;
  const upsertHooks = collection._hooks.upsert;
  const getTransform = makeTransformGetter(collection);
  const args = [selector, modifier, options];

  const hasUpdateAfter = !isEmpty(updateHooks.after);
  const hasInsertAfter = !isEmpty(insertHooks.after);

  return runMutation(collection, async dispatchWithLinks => {
    let docs = [];
    let prevDocs;
    let prevMutator;
    let prevOptions;

    // Only after.update hooks need the matching documents.
    if (hasUpdateAfter) {
      const fetchOptions = { transform: null, reactive: false };
      if (!options.multi) fetchOptions.limit = 1;

      const shouldStorePrev = shouldFetchPrevious(
        collection.hookOptions,
        updateHooks.after,
        "after",
        "update"
      );
      const projection = shouldStorePrev
        ? buildHookProjection(collection.hookOptions, updateHooks.after, "after", "update")
        : { _id: 1 };
      ensureProjectionIncludesId(projection);
      if (Object.keys(projection).length > 0) fetchOptions.fields = projection;

      docs = fetchDocs(collection, selector, fetchOptions);
      if (Meteor._isPromise(docs)) docs = await docs;

      prevMutator = EJSON.clone(modifier);
      prevOptions = EJSON.clone(options);
      if (shouldStorePrev) {
        prevDocs = {};
        for (const doc of docs) {
          prevDocs[doc._id] = EJSON.clone(doc);
        }
      }
    }

    for (const hookEntry of upsertHooks.before) {
      let r = runHook(hookEntry.fn, hookContext(collection, args), [
        userId,
        selector,
        modifier,
        options
      ]);
      if (Meteor._isPromise(r)) r = await r;
      if (r === false) return { numberAffected: 0 };
    }

    const ret = await dispatchWithLinks(dispatch);
    const insertedId = ret && ret.insertedId;
    const numberAffected = ret && ret.numberAffected;

    if (insertedId) {
      // The upsert inserted a document: fire after.insert hooks
      if (hasInsertAfter) {
        let insertedDocs = fetchDocs(
          collection,
          { _id: insertedId },
          { transform: null, reactive: false, limit: 1 }
        );
        if (Meteor._isPromise(insertedDocs)) insertedDocs = await insertedDocs;
        const doc = insertedDocs[0];
        if (doc) {
          for (const hookEntry of insertHooks.after) {
            await hookEntry.fn.call(
              hookContext(collection, args, {
                transform: getTransform(doc),
                _id: insertedId
              }),
              userId,
              doc
            );
          }
        }
      }
    } else if (hasUpdateAfter && docs.length > 0) {
      // The upsert updated existing documents: fire after.update hooks
      const fields = getFields(modifier);
      const afterFetchOptions = { transform: null, reactive: false };
      const afterProjection = buildHookProjection(
        collection.hookOptions,
        updateHooks.after,
        "after",
        "update"
      );
      ensureProjectionIncludesId(afterProjection);
      if (Object.keys(afterProjection).length > 0) {
        afterFetchOptions.fields = afterProjection;
      }

      let afterDocs = fetchDocs(
        collection,
        { _id: { $in: docs.map(d => d._id) } },
        afterFetchOptions
      );
      if (Meteor._isPromise(afterDocs)) afterDocs = await afterDocs;

      for (const hookEntry of updateHooks.after) {
        for (const doc of afterDocs) {
          await hookEntry.fn.call(
            hookContext(collection, args, {
              transform: getTransform(doc),
              previous: prevDocs && prevDocs[doc._id],
              affected: numberAffected
            }),
            userId,
            doc,
            fields,
            prevMutator,
            prevOptions
          );
        }
      }
    }

    return ret;
  });
}

function isAsyncFunction(fn) {
  return fn?.constructor?.name === "AsyncFunction";
}

// Call a hook that has to complete synchronously (before.find and the hooks
// of sync findOne). Async functions are rejected up front; a transpiled async
// function is caught by the promise it returns.
function callSyncHook(hookFn, hookName, context, args) {
  if (isAsyncFunction(hookFn)) {
    throw new Error(`Cannot use async function as ${hookName} hook`);
  }

  const result = hookFn.apply(context, args);
  if (Meteor._isPromise(result)) {
    throw new Error(`Cannot use async function as ${hookName} hook`);
  }

  return result;
}

const CURSOR_ASYNC_METHODS = ["countAsync", "fetchAsync", "forEachAsync", "mapAsync"];

// `coreFind(selector)` returns a cursor. A before.find hook returning false
// yields an empty cursor, so find() always returns a cursor.
export function runFindHooks(collection, selector, options, coreFind) {
  const userId = getHookUserId();
  const hooks = collection._hooks.find;
  selector = CollectionHooks.normalizeSelector(selector);
  const args = [selector, options];

  for (const hookEntry of hooks.before) {
    const result = callSyncHook(
      hookEntry.fn,
      "before.find",
      hookContext(collection, args),
      [userId, selector, options]
    );
    if (result === false) return coreFind(undefined);
  }

  const cursor = coreFind(selector);

  // after.find hooks run each time the cursor is read asynchronously.
  if (!isEmpty(hooks.after)) {
    for (const method of CURSOR_ASYNC_METHODS) {
      if (typeof cursor[method] === "function") {
        const original = cursor[method].bind(cursor);
        cursor[method] = async function(...methodArgs) {
          const result = await original(...methodArgs);
          for (const hookEntry of hooks.after) {
            await hookEntry.fn.call(cursor, userId, selector, options, cursor);
          }
          return result;
        };
      }
    }
  }

  return cursor;
}

export function runFindOneHooksSync(collection, selector, options, coreFindOne) {
  const userId = getHookUserId();
  const hooks = collection._hooks.findOne;
  selector = CollectionHooks.normalizeSelector(selector);
  const args = [selector, options];

  for (const hookEntry of hooks.before) {
    const result = callSyncHook(
      hookEntry.fn,
      "before.findOne",
      hookContext(collection, args),
      [userId, selector, options]
    );
    if (result === false) return undefined;
  }

  const doc = coreFindOne(selector);

  for (const hookEntry of hooks.after) {
    callSyncHook(hookEntry.fn, "after.findOne", hookContext(collection, args), [
      userId,
      selector,
      options,
      doc
    ]);
  }

  return doc;
}

export async function runFindOneHooks(collection, selector, options, coreFindOne) {
  const userId = getHookUserId();
  const hooks = collection._hooks.findOne;
  selector = CollectionHooks.normalizeSelector(selector);
  const args = [selector, options];

  // Capture current Tracker computation before any await (preserves client reactivity)
  const computation = Tracker.currentComputation;

  for (const hookEntry of hooks.before) {
    const r = await hookEntry.fn.call(
      hookContext(collection, args),
      userId,
      selector,
      options
    );
    if (r === false) return undefined;
  }

  const doc = computation
    ? await Tracker.withComputation(computation, () => coreFindOne(selector))
    : await coreFindOne(selector);

  for (const hookEntry of hooks.after) {
    await hookEntry.fn.call(
      hookContext(collection, args),
      userId,
      selector,
      options,
      doc
    );
  }

  return doc;
}
