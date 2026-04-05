import { EJSON } from "meteor/ejson";
import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";

// Check if an array is empty or not an array
function isEmpty(a) {
  return !Array.isArray(a) || !a.length;
}

// Get the userId from the current DDP invocation context.
// On the server outside any DDP context, returns undefined (tests check typeof === 'undefined').
// On the client outside any DDP context, falls back to Meteor.userId() so that hooks
// on local collections still see the logged-in user's ID.
export function getHookUserId() {
  if (Meteor.isClient) {
    const clientUserId = Meteor.userId();
    if (clientUserId != null) return clientUserId;
  }

  const methodInvocation =
    DDP._CurrentMethodInvocation && DDP._CurrentMethodInvocation.get();
  if (methodInvocation) {
    return methodInvocation.userId == null ? null : methodInvocation.userId;
  }
  const pubInvocation =
    DDP._CurrentPublicationInvocation &&
    DDP._CurrentPublicationInvocation.get();
  if (pubInvocation) {
    return pubInvocation.userId == null ? null : pubInvocation.userId;
  }
  if (Meteor.isClient) return Meteor.userId();
  return undefined;
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
      if (timing === "after" && method === "upsert") continue; // no after.upsert
      const methodHooks = collection._hooks[method];
      const hooksArray = methodHooks && methodHooks[timing];
      if (!hooksArray) continue;
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
    // before.upsert
    if (timing === "before") {
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
  }
}

export function setupHookOptions(collection) {
  collection.hookOptions = EJSON.clone(CollectionHooks.defaults);
}

export function setupDirectMethods(collection) {
  collection.direct = {};

  // Async bypass methods
  const asyncMethods = [
    "insertAsync",
    "updateAsync",
    "removeAsync",
    "upsertAsync",
    "findOneAsync"
  ];
  for (const method of asyncMethods) {
    collection.direct[method] = function(...args) {
      return CollectionHooks.directOp(() => collection[method](...args));
    };
  }

  // Sync bypass methods
  const syncMethods = [
    "insert",
    "update",
    "remove",
    "upsert",
    "find",
    "findOne"
  ];
  for (const method of syncMethods) {
    if (typeof collection[method] === "function") {
      collection.direct[method] = function(...args) {
        return CollectionHooks.directOp(() => collection[method](...args));
      };
    }
  }
}

// === HOOK RUNNERS ===
// Called inline from Mongo.Collection prototype methods

const mutatorPromiseMetadata = new WeakMap();

function withMutatorPromiseMetadata(promise, mutatorPromise) {
  if (!mutatorPromise || typeof mutatorPromise !== "object") {
    return;
  }

  if (
    mutatorPromiseMetadata.get(promise)?.stubPromise &&
    "stubPromise" in mutatorPromise &&
    mutatorPromise.stubPromise
  ) {
    mutatorPromise.stubPromise.then(
      mutatorPromiseMetadata.get(promise).stubPromise.resolve,
      mutatorPromiseMetadata.get(promise).stubPromise.reject
    );
  }

  if (
    mutatorPromiseMetadata.get(promise)?.serverPromise &&
    "serverPromise" in mutatorPromise &&
    mutatorPromise.serverPromise
  ) {
    mutatorPromise.serverPromise.then(
      mutatorPromiseMetadata.get(promise).serverPromise.resolve,
      mutatorPromiseMetadata.get(promise).serverPromise.reject
    );
  }
}

function createDeferredPromise() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function prepareMutatorPromiseMetadata(collection, promise) {
  if (!collection._isRemoteCollection()) {
    return;
  }

  const wantsStubPromise =
    collection.resolverType === "stub" || collection.resolverType == null;
  const wantsServerPromise =
    !collection._connection._stream._isStub && collection.resolverType !== "stub";

  const promiseMetadata = {};

  if (wantsStubPromise) {
    promiseMetadata.stubPromise = createDeferredPromise();
    promise.stubPromise = promiseMetadata.stubPromise.promise;
  }

  if (wantsServerPromise) {
    promiseMetadata.serverPromise = createDeferredPromise();
    promise.serverPromise = promiseMetadata.serverPromise.promise;
  }

  mutatorPromiseMetadata.set(promise, promiseMetadata);
}

function isAsyncHookFunction(hookFn) {
  try {
    return Function.prototype.toString.call(hookFn).startsWith("async");
  } catch (error) {
    return !!(
      hookFn &&
      hookFn.constructor &&
      hookFn.constructor.name === "AsyncFunction"
    );
  }
}

export function runInsertHooks(collection, doc, coreInsert) {
  const userId = getHookUserId();
  const hooks = collection._hooks.insert;
  const getTransform = makeTransformGetter(collection);

  let mutatorPromise;
  let completionPromise;

  completionPromise = Promise.resolve().then(async function() {
    // Before hooks
    for (const hookEntry of hooks.before) {
      const r = await hookEntry.fn.call(
        { transform: getTransform(doc) },
        userId,
        doc
      );
      if (r === false) return; // abort
    }

    mutatorPromise = coreInsert();
    withMutatorPromiseMetadata(completionPromise, mutatorPromise);

    const id = await mutatorPromise;

    // After hooks
    if (!isEmpty(hooks.after)) {
      const afterDoc = EJSON.clone(doc);
      afterDoc._id = id;
      for (const hookEntry of hooks.after) {
        await hookEntry.fn.call(
          { transform: getTransform(afterDoc), _id: id },
          userId,
          afterDoc
        );
      }
    }

    return id;
  });

  prepareMutatorPromiseMetadata(collection, completionPromise);
  return completionPromise;
}

export function runUpdateHooks(
  collection,
  selector,
  modifier,
  options,
  coreUpdate
) {
  const userId = getHookUserId();
  const hooks = collection._hooks.update;
  const getTransform = makeTransformGetter(collection);

  const hasBefore = !isEmpty(hooks.before);
  const hasAfter = !isEmpty(hooks.after);

  // We need to fetch docs if we have before hooks OR after hooks
  // (after hooks need docIds to re-fetch after update)
  const shouldFetch = hasBefore || hasAfter;
  const shouldStorePrev =
    hasAfter &&
    shouldFetchPrevious(collection.hookOptions, hooks.after, "after", "update");

  let docs = [];
  let docIds = [];
  const prev = {};

  // Always preserve modifier and options — after hooks need them even when fetchPrevious is false.
  prev.mutator = EJSON.clone(modifier);
  prev.options = EJSON.clone(options);

  let mutatorPromise;
  let completionPromise;

  completionPromise = Promise.resolve().then(async function() {
    if (shouldFetch) {
      const fetchOptions = { transform: null, reactive: false };
      if (!(options && options.multi)) fetchOptions.limit = 1;

      // Build projection from hook options
      const projection = {};
      if (shouldStorePrev) {
        Object.assign(
          projection,
          buildHookProjection(
            collection.hookOptions,
            hooks.after,
            "after",
            "update"
          )
        );
      }
      if (hasBefore) {
        Object.assign(
          projection,
          buildHookProjection(
            collection.hookOptions,
            hooks.before,
            "before",
            "update"
          )
        );
      }
      if (Object.keys(projection).length > 0) fetchOptions.fields = projection;

      docs = await collection._collection
        .find(selector, fetchOptions)
        .fetchAsync();
      docIds = docs.map(d => d._id);

      if (shouldStorePrev) {
        prev.docs = {};
        for (const doc of docs) {
          prev.docs[doc._id] = EJSON.clone(doc);
        }
      }
    }

    const fields = getFields(modifier);

    // Before hooks — run per-doc
    if (hasBefore) {
      let abort = false;
      for (const hookEntry of hooks.before) {
        for (const doc of docs) {
          const r = await hookEntry.fn.call(
            { transform: getTransform(doc) },
            userId,
            doc,
            fields,
            modifier,
            options
          );
          if (r === false) {
            abort = true;
            break;
          }
        }
        if (abort) break;
      }
      if (abort) return 0;
    }

    mutatorPromise = coreUpdate();
    withMutatorPromiseMetadata(completionPromise, mutatorPromise);

    const affected = await mutatorPromise;

    // After hooks — re-fetch and run per-doc
    if (hasAfter && docIds.length > 0) {
      const afterFetchOptions = { transform: null, reactive: false };
      const afterProjection = buildHookProjection(
        collection.hookOptions,
        hooks.after,
        "after",
        "update"
      );
      if (Object.keys(afterProjection).length > 0)
        afterFetchOptions.fields = afterProjection;

      const afterDocs = await collection._collection
        .find({ _id: { $in: docIds } }, afterFetchOptions)
        .fetchAsync();

      for (const hookEntry of hooks.after) {
        for (const doc of afterDocs) {
          await hookEntry.fn.call(
            {
              transform: getTransform(doc),
              previous: prev.docs && prev.docs[doc._id],
              affected
            },
            userId,
            doc,
            fields,
            prev.mutator,
            prev.options
          );
        }
      }
    }

    return affected;
  });

  prepareMutatorPromiseMetadata(collection, completionPromise);
  return completionPromise;
}

export function runRemoveHooks(collection, selector, coreRemove) {
  const userId = getHookUserId();
  const hooks = collection._hooks.remove;
  const getTransform = makeTransformGetter(collection);

  const hasBefore = !isEmpty(hooks.before);
  const hasAfter = !isEmpty(hooks.after);

  let docs = [];
  const prevDocs = [];

  let mutatorPromise;
  let completionPromise;

  completionPromise = Promise.resolve().then(async function() {
    if (hasBefore || hasAfter) {
      docs = await collection._collection
        .find(selector, { transform: null, reactive: false })
        .fetchAsync();
      if (hasAfter) {
        for (const doc of docs) prevDocs.push(EJSON.clone(doc));
      }
    }

    // Before hooks — run per-doc
    if (hasBefore) {
      let abort = false;
      for (const hookEntry of hooks.before) {
        for (const doc of docs) {
          const r = await hookEntry.fn.call(
            { transform: getTransform(doc) },
            userId,
            doc
          );
          if (r === false) {
            abort = true;
            break;
          }
        }
        if (abort) break;
      }
      if (abort) return 0;
    }

    mutatorPromise = coreRemove();
    withMutatorPromiseMetadata(completionPromise, mutatorPromise);

    const result = await mutatorPromise;

    // After hooks — use pre-removal doc copies
    if (hasAfter) {
      for (const hookEntry of hooks.after) {
        for (const doc of prevDocs) {
          await hookEntry.fn.call(
            { transform: getTransform(doc) },
            userId,
            doc
          );
        }
      }
    }

    return result;
  });

  prepareMutatorPromiseMetadata(collection, completionPromise);
  return completionPromise;
}

export function runUpsertHooks(
  collection,
  selector,
  modifier,
  options,
  coreUpsert
) {
  const userId = getHookUserId();
  const insertHooks = collection._hooks.insert;
  const updateHooks = collection._hooks.update;
  const upsertHooks = collection._hooks.upsert;
  const getTransform = makeTransformGetter(collection);

  // Fetch existing docs if we'll need update after-hooks
  let docs = [];
  let docIds = [];
  const prev = {};

  const hasUpsertBefore = !isEmpty(upsertHooks.before);
  const hasUpdateAfter = !isEmpty(updateHooks.after);
  const hasInsertAfter = !isEmpty(insertHooks.after);

  let mutatorPromise;
  let completionPromise;

  completionPromise = Promise.resolve().then(async function() {
    if (hasUpsertBefore || hasUpdateAfter) {
      const fetchOptions = { transform: null, reactive: false };
      const beforeProjection = {};

      if (hasUpdateAfter) {
        Object.assign(
          beforeProjection,
          buildHookProjection(
            collection.hookOptions,
            updateHooks.after,
            "after",
            "update"
          )
        );
      }

      if (Object.keys(beforeProjection).length > 0) {
        fetchOptions.fields = beforeProjection;
      }

      docs = await collection._collection
        .find(selector, fetchOptions)
        .fetchAsync();
      docIds = docs.map(d => d._id);
    }

    if (hasUpdateAfter) {
      // Always preserve modifier and options for after hooks.
      prev.mutator = EJSON.clone(modifier);
      prev.options = EJSON.clone(options);

      const shouldStorePrev = shouldFetchPrevious(
        collection.hookOptions,
        updateHooks.after,
        "after",
        "update"
      );

      if (shouldStorePrev) {
        prev.docs = {};
        for (const doc of docs) {
          prev.docs[doc._id] = EJSON.clone(doc);
        }
      }
    }

    // Before upsert hooks
    if (hasUpsertBefore) {
      for (const hookEntry of upsertHooks.before) {
        const r = await hookEntry.fn.call(
          {},
          userId,
          selector,
          modifier,
          options
        );
        if (r === false) return { numberAffected: 0 };
      }
    }

    mutatorPromise = coreUpsert();
    withMutatorPromiseMetadata(completionPromise, mutatorPromise);

    const ret = await mutatorPromise;
    const insertedId = ret && ret.insertedId;
    const numberAffected = ret && ret.numberAffected;

    if (insertedId) {
      // Upsert resulted in an insert — fire after.insert hooks
      if (hasInsertAfter) {
        const insertedDocs = await collection._collection
          .find(
            { _id: insertedId },
            { transform: null, reactive: false, limit: 1 }
          )
          .fetchAsync();
        const doc = insertedDocs[0];
        if (doc) {
          for (const hookEntry of insertHooks.after) {
            await hookEntry.fn.call(
              { transform: getTransform(doc), _id: insertedId },
              userId,
              doc
            );
          }
        }
      }
    } else {
      // Upsert resulted in an update — fire after.update hooks
      if (hasUpdateAfter && docIds.length > 0) {
        const fields = getFields(modifier);
        const afterFetchOptions = { transform: null, reactive: false };
        const afterProjection = buildHookProjection(
          collection.hookOptions,
          updateHooks.after,
          "after",
          "update"
        );
        if (Object.keys(afterProjection).length > 0) {
          afterFetchOptions.fields = afterProjection;
        }

        const afterDocs = await collection._collection
          .find({ _id: { $in: docIds } }, afterFetchOptions)
          .fetchAsync();

        for (const hookEntry of updateHooks.after) {
          for (const doc of afterDocs) {
            await hookEntry.fn.call(
              {
                transform: getTransform(doc),
                previous: prev.docs && prev.docs[doc._id],
                affected: numberAffected
              },
              userId,
              doc,
              fields,
              prev.mutator,
              prev.options
            );
          }
        }
      }
    }

    return ret;
  });

  prepareMutatorPromiseMetadata(collection, completionPromise);
  return completionPromise;
}

export function runFindHooks(collection, selector, options, coreFind) {
  const userId = getHookUserId();
  const hooks = collection._hooks.find;
  const hasBefore = !isEmpty(hooks.before);
  const hasAfter = !isEmpty(hooks.after);

  // Before find hooks — must be synchronous
  if (hasBefore) {
    for (const hookEntry of hooks.before) {
      if (isAsyncHookFunction(hookEntry.fn)) {
        throw new Error("Cannot use async function as before.find hook");
      }
      const result = hookEntry.fn.call({}, userId, selector, options);
      if (result === false) return;
    }
  }

  const cursor = coreFind();

  // Wrap cursor async methods for after.find hooks
  if (hasAfter) {
    const CURSOR_ASYNC_METHODS = [
      "countAsync",
      "fetchAsync",
      "forEachAsync",
      "mapAsync"
    ];
    for (const method of CURSOR_ASYNC_METHODS) {
      if (typeof cursor[method] === "function") {
        const original = cursor[method].bind(cursor);
        cursor[method] = async function(...args) {
          const result = await original(...args);
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

export async function runFindOneHooks(
  collection,
  selector,
  options,
  coreFindOne
) {
  const userId = getHookUserId();
  const hooks = collection._hooks.findOne;

  // Capture current Tracker computation before any await (preserves client reactivity)
  const computation = Tracker && Tracker.currentComputation;

  // Before hooks
  if (!isEmpty(hooks.before)) {
    for (const hookEntry of hooks.before) {
      const r = await hookEntry.fn.call({}, userId, selector, options);
      if (r === false) return;
    }
  }

  let doc;
  if (computation) {
    doc = await Tracker.withComputation(computation, () => coreFindOne());
  } else {
    doc = await coreFindOne();
  }

  // After hooks
  if (!isEmpty(hooks.after)) {
    for (const hookEntry of hooks.after) {
      await hookEntry.fn.call({}, userId, selector, options, doc);
    }
  }

  return doc;
}
