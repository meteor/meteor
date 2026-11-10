const replayPrefix = 'ddp-duplicate-added';

if (Meteor.isServer) {
  const { DDPServer } = require('meteor/ddp-server');
  const cases = new Map();
  const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  };
  const getCase = name => {
    check(name, String);
    const state = cases.get(name);
    if (!state) throw new Meteor.Error('unknown-replay-case');
    return state;
  };
  Meteor.methods({
    async [`${replayPrefix}/seed`](name) {
      check(name, String);
      if (cases.has(name)) throw new Meteor.Error('duplicate-replay-case');
      const collection = new Mongo.Collection(name, {
        defineMutationMethods: false, _preventAutopublish: true,
      });
      const state = {
        collection, gate: deferred(), entered: deferred(), stopped: deferred(),
        subscriptions: new Set(), observers: new Set(), initialStopped: false,
        methodEntered: false, released: false, phase: null,
      };
      cases.set(name, state);
      Meteor.server.setPublicationStrategy(name, DDPServer.publicationStrategies.NO_MERGE_NO_HISTORY);
      await collection.insertAsync({ _id: 'record', label: 'initial', count: 0, preserved: 'keep' });
    },
    [`${replayPrefix}/status`](name) {
      const { initialStopped, methodEntered, released, phase } = getCase(name);
      return { initialStopped, methodEntered, released, phase };
    },
    async [`${replayPrefix}/wait`](name, event) {
      check(event, Match.OneOf('entered', 'stopped'));
      this.unblock();
      await getCase(name)[event].promise;
    },
    async [`${replayPrefix}/edit`](name) {
      const state = getCase(name);
      // Subscriptions share the session queue with methods. Allow replay while held.
      this.unblock();
      state.methodEntered = true;
      state.entered.resolve();
      state.work = (async () => {
        await state.gate.promise;
        await state.collection.updateAsync('record', { $set: { count: 20 } });
        return 'edit-confirmed';
      })();
      return state.work;
    },
    async [`${replayPrefix}/prepare`](name) {
      const state = getCase(name);
      if (!state.initialStopped) throw new Meteor.Error('initial-observer-active');
      await state.collection.updateAsync('record', { $set: { label: 'replayed' } });
    },
    [`${replayPrefix}/release`](name) {
      const state = getCase(name);
      state.released = true;
      state.gate.resolve();
    },
    [`${replayPrefix}/read`](name) {
      return getCase(name).collection.findOneAsync('record');
    },
    async [`${replayPrefix}/cleanup`](name) {
      check(name, String);
      const state = cases.get(name);
      if (!state) return;
      state.gate.resolve();
      state.entered.resolve();
      state.stopped.resolve();
      const errors = [];
      if (state.work) {
        try { await state.work; } catch (error) { errors.push(error.message); }
      }
      for (const subscription of state.subscriptions) {
        try { subscription.stop(); } catch (error) { errors.push(error.message); }
      }
      for (const observer of state.observers) {
        try { await observer.stop(); } catch (error) { errors.push(error.message); }
      }
      try { await state.collection.dropCollectionAsync(); }
      catch (error) { errors.push(error.message); }
      cases.delete(name);
      delete Meteor.server._publicationStrategies[name];
      if (Mongo._collections.get(name) === state.collection) Mongo._collections.delete(name);
      if (errors.length) throw new Meteor.Error('replay-cleanup-failed', errors.join('; '));
    },
  });
  Meteor.publish(`${replayPrefix}/records`, async function (name, phase) {
    check(phase, Match.OneOf('initial', 'replay'));
    const state = getCase(name);
    const projection = { label: 1, count: 1 };
    if (phase === 'initial') projection.preserved = 1;
    const observer = await state.collection.find('record', { projection }).observeChangesAsync({
      added: (id, fields) => this.added(name, id, fields),
      changed: (id, fields) => this.changed(name, id, fields),
      removed: id => this.removed(name, id),
    });
    state.observers.add(observer);
    state.subscriptions.add(this);
    this.onStop(async () => {
      await observer.stop();
      state.observers.delete(observer);
      state.subscriptions.delete(this);
      if (phase === 'initial') {
        state.initialStopped = true;
        state.stopped.resolve();
      }
    });
    state.phase = phase;
    // This ordinary-strategy collection proves processing passed the repeated add.
    this.added(`${name}-markers`, phase, { phase });
    this.ready();
  });
}

if (Meteor.isClient) {
  for (const pending of [false, true]) {
    Tinytest.addAsync(`livedata stub - duplicate added - stock publication ${pending ? 'pending write' : 'control'}`, async test => {
      const name = `${replayPrefix}-${Random.id()}`;
      // Keep both the held method and a failed update off the test-report connection.
      const connection = DDP.connect(Meteor.absoluteUrl(), { retry: false });
      const control = DDP.connect(Meteor.absoluteUrl(), { retry: false });
      const collection = new Mongo.Collection(name, { connection });
      const markers = new Mongo.Collection(`${name}-markers`, { connection, defineMutationMethods: false });
      const messages = [];
      const errors = [];
      const subscriptions = [];
      let phase = 'connect';
      let methodState = 'idle';
      let method;
      let failure;
      const cleanupErrors = [];
      let rejectDuplicate;
      const duplicateFailure = new Promise((resolve, reject) => { rejectDuplicate = reject; });
      duplicateFailure.catch(() => {});
      const captureError = text => {
        errors.push(text);
        if (text.includes('Server sent add for existing id: record')) rejectDuplicate(new Error(text));
      };
      const originalDebug = Meteor._debug;
      Meteor._debug = function (...args) {
        captureError(args.map(value => value?.stack || String(value)).join(' '));
        return originalDebug.apply(this, args);
      };
      const onError = event => captureError(event.error?.stack || event.message);
      const onRejection = event => captureError(event.reason?.stack || String(event.reason));
      const onMessage = raw => messages.push(JSON.parse(raw));
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);
      connection._stream.on('message', onMessage);

      const bounded = async (label, promise, watchErrors = true) => {
        let timer;
        try {
          return await Promise.race([
            promise,
            ...(watchErrors ? [duplicateFailure] : []),
            new Promise((resolve, reject) => {
              timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 15000);
            }),
          ]);
        } finally { clearTimeout(timer); }
      };
      const callControl = (operation, ...args) => bounded(operation,
        control.callAsync(`${replayPrefix}/${operation}`, name, ...args));
      const until = async (label, predicate) => {
        let computation;
        try {
          await bounded(label, new Promise(resolve => {
            computation = Tracker.autorun(() => { if (predicate()) resolve(); });
          }));
        } finally { computation?.stop(); }
      };
      const subscribe = kind => {
        let handle;
        const ready = new Promise((resolve, reject) => {
          handle = connection.subscribe(`${replayPrefix}/records`, name, kind, {
            onReady: resolve,
            onStop: error => { if (error) reject(error); },
          });
        });
        ready.catch(() => {});
        subscriptions.push(handle);
        return { handle, ready };
      };
      try {
        await Promise.all([collection._settingUpReplicationPromise, markers._settingUpReplicationPromise]);
        await until('both connections connected', () => connection.status().connected && control.status().connected);
        await callControl('seed');
        phase = 'initial subscription';
        const initial = { _id: 'record', label: 'initial', count: 0, preserved: 'keep' };
        const first = subscribe('initial');
        await bounded(phase, first.ready);
        test.equal(collection.findOne('record'), initial);
        first.handle.stop();
        await callControl('wait', 'stopped');
        test.equal(collection.findOne('record'), initial);

        if (pending) {
          phase = 'optimistic write';
          connection.methods({
            async [`${replayPrefix}/edit`]() {
              await collection.updateAsync('record', { $set: { count: 10 } }).stubPromise;
            },
          });
          methodState = 'pending';
          method = connection.callAsync(`${replayPrefix}/edit`, name);
          method.then(() => { methodState = 'settled'; }, error => {
            methodState = 'rejected'; captureError(error.message);
          });
          if (method.serverPromise !== method) method.serverPromise.catch(error => captureError(error.message));
          await bounded('stub completion', method.stubPromise);
          await callControl('wait', 'entered');
          test.equal(collection.findOne('record'), { ...initial, count: 10 });
          test.equal(methodState, 'pending');
        }
        await callControl('prepare');
        phase = 'replay marker';
        const replay = subscribe('replay');
        // Readiness is fenced by pending server documents. Await a later data
        // message instead; otherwise the test would wait on its own held method.
        await until(phase, () => !!markers.findOne('replay'));
        test.equal(messages.filter(message => message.msg === 'added' && message.collection === name), [
          { msg: 'added', collection: name, id: 'record', fields: { label: 'initial', count: 0, preserved: 'keep' } },
          { msg: 'added', collection: name, id: 'record', fields: { label: 'replayed', count: 0 } },
        ]);
        test.equal(collection.findOne('record'), pending
          ? { ...initial, count: 10 }
          : { ...initial, label: 'replayed' });
        if (pending) {
          test.equal(methodState, 'pending');
          test.isFalse(replay.handle.ready());
          phase = 'release and settle';
          await callControl('release');
          test.equal(await bounded('method completion', method), 'edit-confirmed');
          await bounded('replay readiness', replay.ready);
          const expected = { ...initial, label: 'replayed', count: 20 };
          test.equal(collection.findOne('record'), expected);
          test.equal(await callControl('read'), expected);
          test.equal(methodState, 'settled');
        } else {
          await bounded('control replay readiness', replay.ready);
        }
        // A subsequent ordinary method still completes on the tested connection.
        test.equal(await bounded('subsequent method', connection.callAsync(`${replayPrefix}/read`, name)), collection.findOne('record'));
        test.isTrue(connection.status().connected);
        test.equal(errors, []);
      } catch (error) {
        failure = error;
        let server;
        try { server = await bounded('diagnostic status', control.callAsync(`${replayPrefix}/status`, name), false); }
        catch (statusError) { server = statusError.message; }
        console.error('Duplicate addition diagnostics:', JSON.stringify({
          phase, methodState, document: collection.findOne('record'), server, messages, errors,
        }));
        throw error;
      } finally {
        subscriptions.forEach(handle => handle.stop());
        try {
          await bounded('server cleanup', control.callAsync(`${replayPrefix}/cleanup`, name), false);
        } catch (error) { cleanupErrors.push(error.message); }
        connection.close();
        control.close();
        const callbacks = connection._stream.eventCallbacks.message;
        const index = callbacks.indexOf(onMessage);
        if (index !== -1) callbacks.splice(index, 1);
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        Meteor._debug = originalDebug;
        for (const coll of [collection, markers]) {
          coll._collection.remove({});
          delete connection._mongo_livedata_collections[coll._name];
          if (Mongo._collections.get(coll._name) === coll) Mongo._collections.delete(coll._name);
        }
        if (failure && cleanupErrors.length) {
          console.error('Replay cleanup after failure:', cleanupErrors);
        }
      }
      test.equal(cleanupErrors, [], 'owned publication resources were cleaned up');
    });
  }
}
