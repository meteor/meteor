/* eslint-env mocha */

import assert from 'assert'
import isMeteorBlockOnlyTest from '../../../../dist/util/executors/isMeteorBlockOnlyTest'

describe('isMeteorBlockOnlyTest', function () {

  it('accepts a valid MemberExpression', function () {
    const result = isMeteorBlockOnlyTest({
      type: 'MemberExpression',
      object: {
        type: 'Identifier',
        name: 'Meteor'
      },
      property: {
        type: 'Identifier',
        name: 'isClient'
      }
    })
    assert.ok(result)
  })

  it('accepts a valid computed MemberExpression', function () {
    const result = isMeteorBlockOnlyTest({
      type: 'MemberExpression',
      computed: true,
      object: {
        type: 'Identifier',
        name: 'Meteor'
      },
      property: {
        type: 'Literal',
        value: 'isCordova'
      }
    })
    assert.ok(result)
  })

  it('does not accept an invalid MemberExpression', function () {
    const result = isMeteorBlockOnlyTest({
      type: 'MemberExpression',
      object: {
        type: 'Identifier',
        name: 'Foo'
      },
      property: {
        type: 'Identifier',
        name: 'isClient'
      }
    })
    assert.ok(!result)
  })

  it('accepts a valid UnaryExpression', function () {
    const result = isMeteorBlockOnlyTest({
      type: 'UnaryExpression',
      operator: '!',
      argument: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor'
        },
        property: {
          type: 'Identifier',
          name: 'isServer'
        }
      }
    })
    assert.ok(result)
  })

  it('does not accept an invalid UnaryExpression', function () {
    const result = isMeteorBlockOnlyTest({
      type: 'UnaryExpression',
      operator: '!',
      argument: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Foo'
        },
        property: {
          type: 'Identifier',
          name: 'isClient'
        }
      }
    })
    assert.ok(!result)
  })

  it('accepts a valid LogicalExpression', function () {
    const result = isMeteorBlockOnlyTest({
      type: 'LogicalExpression',
      operator: '||',
      left: {
        type: 'LogicalExpression',
        operator: '&&',
        left: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor'
          },
          property: {
            type: 'Identifier',
            name: 'isClient'
          }
        },
        right: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor'
          },
          property: {
            type: 'Identifier',
            name: 'isServer'
          }
        }
      },
      right: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor'
        },
        property: {
          type: 'Identifier',
          name: 'isCordova'
        }
      }
    })
    assert.ok(result)
  })

  it('does not accept an invalid LogicalExpression', function () {
    const result = isMeteorBlockOnlyTest({
      type: 'LogicalExpression',
      operator: '||',
      left: {
        type: 'LogicalExpression',
        operator: '&&',
        left: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Foo'
          },
          property: {
            type: 'Identifier',
            name: 'isClient'
          }
        },
        right: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor'
          },
          property: {
            type: 'Identifier',
            name: 'isServer'
          }
        }
      },
      right: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor'
        },
        property: {
          type: 'Identifier',
          name: 'isCordova'
        }
      }
    })
    assert.ok(!result)
  })

  it('returns false for unresolvable expressions', function () {
    const result = isMeteorBlockOnlyTest({type: 'Identifier'})
    assert.ok(!result)
  })

  it('returns false for invalid unary expressions', function () {
    const result = isMeteorBlockOnlyTest({
      type: 'UnaryExpression',
      operator: '-',
      argument: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Foo'
        },
        property: {
          type: 'Identifier',
          name: 'isClient'
        }
      }
    })
    assert.ok(!result)
  })

})
