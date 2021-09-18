const assert = require('assert');
const getPropertyName = require('../../../../lib/util/ast/getPropertyName');

describe('getPropertyName', () => {
  it('returns false if property type is not Literal or Identifier', () => {
    assert.equal(getPropertyName({ type: 'CallExpression' }), false);
  });

  it('returns the value if property type is of type Literal', () => {
    assert.equal(getPropertyName({ type: 'Literal', value: 'foo' }), 'foo');
  });

  it('returns the name if property type is of type Identifier', () => {
    assert.equal(getPropertyName({ type: 'Identifier', name: 'foo' }), 'foo');
  });
});
