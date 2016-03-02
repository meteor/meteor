import assert from 'assert'
import * as astUtils from '../../../../dist/util/ast/index'

describe('ast utils', () => {
  it('exports isMeteorCall', () => {
    assert(astUtils.hasOwnProperty('isMeteorCall'))
    assert.equal(typeof astUtils.isMeteorCall, 'function')
  })
  it('exports isMeteorProp', () => {
    assert(astUtils.hasOwnProperty('isMeteorProp'))
    assert.equal(typeof astUtils.isMeteorProp, 'function')
  })
  it('exports isTemplateProp', () => {
    assert(astUtils.hasOwnProperty('isTemplateProp'))
    assert.equal(typeof astUtils.isTemplateProp, 'function')
  })
  it('exports isFunction', () => {
    assert(astUtils.hasOwnProperty('isFunction'))
    assert.equal(typeof astUtils.isFunction, 'function')
  })
  it('exports getPropertyName', () => {
    assert(astUtils.hasOwnProperty('getPropertyName'))
    assert.equal(typeof astUtils.getPropertyName, 'function')
  })
})
