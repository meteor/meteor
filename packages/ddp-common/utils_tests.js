const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

Tinytest.add(
  'ddp-common - toWireMessage - passes messages without cleared fields through untouched',
  function (test) {
    const ping = { msg: 'ping', id: '1' };
    test.isTrue(DDPCommon.toWireMessage(ping) === ping);

    const added = { msg: 'added', collection: 'c', id: '1', fields: { a: 1, b: 'x' } };
    test.isTrue(DDPCommon.toWireMessage(added) === added);
  }
);

Tinytest.add(
  'ddp-common - toWireMessage - extracts undefined fields into cleared',
  function (test) {
    const msg = {
      msg: 'changed', collection: 'c', id: '1',
      fields: { a: 1, b: undefined, c: undefined },
    };
    const wire = DDPCommon.toWireMessage(msg);
    test.equal(wire, {
      msg: 'changed', collection: 'c', id: '1', fields: { a: 1 }, cleared: ['b', 'c'],
    });

    // The input is left untouched.
    test.isTrue(hasOwn(msg.fields, 'b'));
    test.isFalse(hasOwn(msg, 'cleared'));

    // When every field is cleared, `fields` is omitted from the wire message.
    const allCleared = DDPCommon.toWireMessage({
      msg: 'changed', collection: 'c', id: '1', fields: { a: undefined },
    });
    test.equal(allCleared, { msg: 'changed', collection: 'c', id: '1', cleared: ['a'] });
  }
);

Tinytest.add('ddp-common - toWireMessage - rejects a non-string id', function (test) {
  test.throws(() => DDPCommon.toWireMessage({ msg: 'method', id: 5 }), /not a string/);
});

Tinytest.add(
  'ddp-common - fromWireMessage - restores cleared fields as undefined',
  function (test) {
    const msg = DDPCommon.fromWireMessage({
      msg: 'changed', collection: 'c', id: '1', fields: { a: 1 }, cleared: ['b'],
    });
    test.equal(msg.fields.a, 1);
    test.isTrue(hasOwn(msg.fields, 'b'));
    test.isUndefined(msg.fields.b);
    test.isFalse(hasOwn(msg, 'cleared'));

    // `cleared` without `fields` creates the fields object.
    const bare = DDPCommon.fromWireMessage({
      msg: 'changed', collection: 'c', id: '1', cleared: ['b'],
    });
    test.isTrue(hasOwn(bare.fields, 'b'));
    test.isUndefined(bare.fields.b);
  }
);

Tinytest.add(
  'ddp-common - EJSON serializer - roundtrips EJSON types in fields, params and result',
  function (test) {
    const serializer = DDPCommon.createEJSONSerializer();
    test.equal(serializer.name, 'ejson');
    test.equal(serializer.wireFormat, 'text');

    const date = new Date(1757600000000);
    const binary = new Uint8Array([1, 2, 3]);
    ['fields', 'params', 'result'].forEach(key => {
      const msg = { msg: 'x', id: '1', [key]: { when: date, blob: binary, nan: NaN } };
      const raw = serializer.serialize(msg);
      test.equal(typeof raw, 'string');

      const back = serializer.deserialize(raw);
      test.isTrue(back[key].when instanceof Date);
      test.equal(back[key].when.getTime(), date.getTime());
      test.isTrue(EJSON.equals(back[key].blob, binary));
      test.isTrue(Number.isNaN(back[key].nan));

      // serialize() must not mutate its input.
      test.isTrue(msg[key].when === date);
      test.isTrue(msg[key].blob === binary);
    });
  }
);

Tinytest.add(
  'ddp-common - EJSON serializer - handles cleared fields in both directions',
  function (test) {
    const serializer = DDPCommon.createEJSONSerializer();
    const msg = {
      msg: 'changed', collection: 'c', id: '1',
      fields: { a: new Date(0), b: undefined },
    };
    const raw = serializer.serialize(msg);
    test.equal(
      raw,
      '{"msg":"changed","collection":"c","id":"1","fields":{"a":{"$date":0}},"cleared":["b"]}'
    );
    test.isTrue(hasOwn(msg.fields, 'b'));
    test.isFalse(hasOwn(msg, 'cleared'));

    const back = serializer.deserialize(raw);
    test.isTrue(back.fields.a instanceof Date);
    test.isTrue(hasOwn(back.fields, 'b'));
    test.isUndefined(back.fields.b);
    test.isFalse(hasOwn(back, 'cleared'));
  }
);

Tinytest.add(
  'ddp-common - EJSON serializer - deserialize throws on invalid input',
  function (test) {
    const serializer = DDPCommon.createEJSONSerializer();
    test.throws(() => serializer.deserialize('not json'));
    test.throws(() => serializer.deserialize('42'), /not an object/);
    test.throws(() => serializer.deserialize('null'), /not an object/);
    test.throws(() => serializer.serialize({ msg: 'method', id: 5 }), /not a string/);
  }
);

Tinytest.add(
  'ddp-common - parseDDP - returns null instead of throwing on malformed frames',
  function (test) {
    test.isNull(DDPCommon.parseDDP('not json'));
    test.isNull(DDPCommon.parseDDP('"a string"'));
    test.isNull(DDPCommon.parseDDP('42'));
    // A non-array `cleared` used to escape parseDDP as a TypeError.
    test.isNull(
      DDPCommon.parseDDP('{"msg":"changed","collection":"c","id":"1","cleared":5}')
    );
  }
);

Tinytest.add(
  'ddp-common - stringifyDDP/parseDDP - wire format is unchanged',
  function (test) {
    test.equal(DDPCommon.stringifyDDP({ msg: 'ping', id: '1' }), '{"msg":"ping","id":"1"}');
    test.equal(
      DDPCommon.stringifyDDP({ msg: 'method', method: 'm', id: '2', params: [new Date(0)] }),
      '{"msg":"method","method":"m","id":"2","params":[{"$date":0}]}'
    );
    test.equal(
      DDPCommon.stringifyDDP({
        msg: 'added', collection: 'c', id: '1', fields: { n: 1, bin: new Uint8Array([255]) },
      }),
      '{"msg":"added","collection":"c","id":"1","fields":{"n":1,"bin":{"$binary":"/w=="}}}'
    );

    const back = DDPCommon.parseDDP(
      '{"msg":"changed","collection":"c","id":"1","fields":{"a":{"$date":0}},"cleared":["b"]}'
    );
    test.isTrue(back.fields.a instanceof Date);
    test.equal(back.fields.a.getTime(), 0);
    test.isTrue(hasOwn(back.fields, 'b'));
    test.isUndefined(back.fields.b);
  }
);

Tinytest.add('ddp-common - setSerializer - swaps the active serializer', function (test) {
  const ejson = DDPCommon.createEJSONSerializer();
  const previous = DDPCommon.getSerializer();
  const seen = [];
  // The serializer is process-wide: while it is swapped, every DDP frame of
  // this process (the test reporter's included) goes through it. Stay
  // byte-compatible with EJSON for everything but this test's own message.
  const isMine = (msg) => msg.collection === 'ddp-common-test';
  DDPCommon.setSerializer({
    name: 'test',
    wireFormat: 'text',
    serialize(msg) {
      if (!isMine(msg)) return ejson.serialize(msg);
      seen.push('serialize');
      return 'S:' + JSON.stringify(DDPCommon.toWireMessage(msg));
    },
    deserialize(raw) {
      if (typeof raw !== 'string' || !raw.startsWith('S:')) return ejson.deserialize(raw);
      seen.push('deserialize');
      return DDPCommon.fromWireMessage(JSON.parse(raw.slice(2)));
    },
  });
  try {
    const raw = DDPCommon.stringifyDDP({
      msg: 'changed', collection: 'ddp-common-test', id: '1', fields: { a: undefined },
    });
    test.equal(raw, 'S:{"msg":"changed","collection":"ddp-common-test","id":"1","cleared":["a"]}');

    const back = DDPCommon.parseDDP(raw);
    test.isTrue(hasOwn(back.fields, 'a'));
    test.isUndefined(back.fields.a);
    test.equal(seen, ['serialize', 'deserialize']);
  } finally {
    DDPCommon.setSerializer(previous);
  }
  test.equal(DDPCommon.getSerializer().name, 'ejson');
});
