const assert = require('assert');
const astUtils = require('../../../../lib/util/ast/index');

describe('ast utils', () => {
  it('exports isMeteorCall', () => {
    assert({}.hasOwnProperty.call(astUtils, 'isMeteorCall'));
    assert.equal(typeof astUtils.isMeteorCall, 'function');
  });
  it('exports isMeteorProp', () => {
    assert({}.hasOwnProperty.call(astUtils, 'isMeteorProp'));
    assert.equal(typeof astUtils.isMeteorProp, 'function');
  });
  it('exports isTemplateProp', () => {
    assert({}.hasOwnProperty.call(astUtils, 'isTemplateProp'));
    assert.equal(typeof astUtils.isTemplateProp, 'function');
  });
  it('exports isFunction', () => {
    assert({}.hasOwnProperty.call(astUtils, 'isFunction'));
    assert.equal(typeof astUtils.isFunction, 'function');
  });
  it('exports getPropertyName', () => {
    assert({}.hasOwnProperty.call(astUtils, 'getPropertyName'));
    assert.equal(typeof astUtils.getPropertyName, 'function');
  });
});
