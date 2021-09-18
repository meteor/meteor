const assert = require('assert');
const isMeteorCall = require('../../../../lib/util/ast/isMeteorCall');

describe('isMeteorCall', () => {
  it('returns true if node is a Meteor call', () => {
    assert.equal(
      isMeteorCall(
        {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            computed: false,
            object: {
              type: 'Identifier',
              name: 'Meteor',
            },
            property: {
              type: 'Identifier',
              name: 'foo',
            },
          },
        },
        'foo'
      ),
      true
    );
  });
});
