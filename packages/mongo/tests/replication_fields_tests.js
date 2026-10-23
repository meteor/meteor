import { DDPCommon } from 'meteor/ddp-common';

for (const scenario of ['repeated added', 'changed without fields', 'changed with empty fields']) {
  Tinytest.addAsync(`mongo fieldless replication - ${scenario}`, async test => {
    let store;
    const connection = {
      registerStoreClient(name, registeredStore) {
        store = registeredStore;
        return true;
      },
      registerStoreServer() {
        throw new Error('Client test registered a server store');
      },
    };
    const name = `fieldless-${Random.id()}`;
    const collection = new Mongo.Collection(name, {
      connection,
      defineMutationMethods: false,
    });
    let observer;
    try {
      await collection._settingUpReplicationPromise;
      const apply = async message => {
        await store.beginUpdate(1, false);
        try {
          store.update(message);
        } finally {
          store.endUpdate();
        }
      };
      const roundTrip = message => DDPCommon.parseDDP(DDPCommon.stringifyDDP({
        collection: name, id: 'record', ...message,
      }));
      const initial = { _id: 'record', label: 'retained', temporary: 'remove-later' };
      await apply(roundTrip({
        msg: 'added', fields: { label: initial.label, temporary: initial.temporary },
      }));
      let changes = 0;
      observer = collection.find().observeChanges({ changed() { changes++; } });

      if (scenario === 'changed with empty fields') {
        await apply({ msg: 'changed', collection: name, id: 'record', fields: {} });
      } else {
        const message = scenario === 'repeated added'
          ? { msg: 'added', fields: {} }
          : { msg: 'changed' };
        const wire = DDPCommon.stringifyDDP({ collection: name, id: 'record', ...message });
        test.isFalse(Object.prototype.hasOwnProperty.call(JSON.parse(wire), 'fields'));
        await apply(DDPCommon.parseDDP(wire));
      }
      test.equal(collection.findOne('record'), initial);
      test.equal(changes, 0);

      await apply(roundTrip({ msg: 'changed', fields: { label: 'updated' } }));
      test.equal(collection.findOne('record'), { ...initial, label: 'updated' });
      test.equal(changes, 1);

      const cleared = DDPCommon.stringifyDDP({
        msg: 'changed', collection: name, id: 'record', fields: { temporary: undefined },
      });
      test.equal(JSON.parse(cleared).cleared, ['temporary']);
      await apply(DDPCommon.parseDDP(cleared));
      test.equal(collection.findOne('record'), { _id: 'record', label: 'updated' });
      test.equal(changes, 2);
    } finally {
      observer?.stop();
      collection._collection.remove({});
      delete connection._mongo_livedata_collections[name];
      if (Mongo._collections.get(name) === collection) Mongo._collections.delete(name);
    }
  });
}
