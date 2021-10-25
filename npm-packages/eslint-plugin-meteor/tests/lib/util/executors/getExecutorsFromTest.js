const assert = require('assert');
const getExecutorsFromTest = require('../../../../lib/util/executors/getExecutorsFromTest');

describe('getExecutorsFromTest', () => {
  it('throws for unkown type', () => {
    assert.throws(() => {
      getExecutorsFromTest({
        type: 'Identifier',
        name: 'Meteor',
      });
    });
  });

  describe('MemberExpression', () => {
    it('isClient', () => {
      const result = getExecutorsFromTest({
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor',
        },
        property: {
          type: 'Identifier',
          name: 'isClient',
        },
      });
      assert.equal(result.size, 2);
      assert.ok(result.has('browser'));
      assert.ok(result.has('cordova'));
    });
    it('isServer', () => {
      const result = getExecutorsFromTest({
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor',
        },
        property: {
          type: 'Identifier',
          name: 'isServer',
        },
      });
      assert.equal(result.size, 1);
      assert.ok(result.has('server'));
    });
    it('isCordova', () => {
      const result = getExecutorsFromTest({
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor',
        },
        property: {
          type: 'Identifier',
          name: 'isCordova',
        },
      });
      assert.equal(result.size, 1);
      assert.ok(result.has('cordova'));
    });
    it('throws on unkown Meteor prop', () => {
      assert.throws(() => {
        getExecutorsFromTest({
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor',
          },
          property: {
            type: 'Identifier',
            name: 'isNotAMeteorProp',
          },
        });
      });
    });
  });

  describe('LogicalExpression', () => {
    it('resolves isServer AND isClient', () => {
      const result = getExecutorsFromTest({
        type: 'LogicalExpression',
        operator: '&&',
        left: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor',
          },
          property: {
            type: 'Identifier',
            name: 'isServer',
          },
        },
        right: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor',
          },
          property: {
            type: 'Identifier',
            name: 'isClient',
          },
        },
      });
      assert.equal(result.size, 0);
    });

    it('resolves isServer OR isClient', () => {
      const result = getExecutorsFromTest({
        type: 'LogicalExpression',
        operator: '||',
        left: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor',
          },
          property: {
            type: 'Identifier',
            name: 'isServer',
          },
        },
        right: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor',
          },
          property: {
            type: 'Identifier',
            name: 'isClient',
          },
        },
      });
      assert.equal(result.size, 3);
      assert.ok(result.has('browser'));
      assert.ok(result.has('server'));
      assert.ok(result.has('cordova'));
    });

    it('throws for unkown operator in LogicalExpression', () => {
      assert.throws(() => {
        getExecutorsFromTest({
          type: 'LogicalExpression',
          operator: 'XY',
          left: {},
          right: {},
        });
      });
    });
  });
});
