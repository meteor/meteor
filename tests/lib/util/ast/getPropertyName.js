/* eslint-env mocha */

import assert from 'assert'
import getPropertyName from '../../../../dist/util/ast/getPropertyName'

describe('getPropertyName', function () {
  it('returns false if property type is not Literal or Identifier', function () {
    assert.equal(getPropertyName({type: 'CallExpression'}), false)
  })

  it('returns the value if property type is of type Literal', function () {
    assert.equal(getPropertyName({type: 'Literal', value: 'foo'}), 'foo')
  })

  it('returns the name if property type is of type Identifier', function () {
    assert.equal(getPropertyName({type: 'Identifier', name: 'foo'}), 'foo')
  })
})
