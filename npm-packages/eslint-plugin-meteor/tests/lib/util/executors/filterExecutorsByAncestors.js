const assert = require('assert');
const filterExecutorsByAncestors = require('../../../../lib/util/executors/filterExecutorsByAncestors');

describe('filterExecutorsByAncestors', () => {
  it('filters on MemberExpression for isClient', () => {
    const consequent = { type: 'BlockStatement' };
    const result = filterExecutorsByAncestors(new Set(['browser', 'server']), [
      { type: 'Program' },
      {
        type: 'IfStatement',
        test: {
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
        consequent,
      },
      consequent,
    ]);
    assert.equal(result.size, 1);
    assert.ok(result.has('browser'));
  });

  it('filters on MemberExpression for else-block of isClient', () => {
    const alternate = { type: 'BlockStatement' };
    const result = filterExecutorsByAncestors(new Set(['browser', 'server']), [
      { type: 'Program' },
      {
        type: 'IfStatement',
        test: {
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
        alternate,
      },
      alternate,
    ]);
    assert.equal(result.size, 1);
    assert.ok(result.has('server'));
  });

  it('warns on hierarchical error', () => {
    assert.throws(() => {
      const consequent = { type: 'BlockStatement' };
      filterExecutorsByAncestors(new Set(['browser', 'server']), [
        { type: 'Program' },
        {
          type: 'IfStatement',
          test: {
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
        },
        consequent,
      ]);
    });
  });

  it('filters on MemberExpression for isServer', () => {
    const consequent = { type: 'BlockStatement' };
    const result = filterExecutorsByAncestors(new Set(['server', 'cordova']), [
      { type: 'Program' },
      {
        type: 'IfStatement',
        test: {
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
        consequent,
      },
      consequent,
    ]);
    assert.equal(result.size, 1);
    assert.ok(result.has('server'));
  });

  it('filters on MemberExpression for isCordova', () => {
    const consequent = { type: 'BlockStatement' };
    const result = filterExecutorsByAncestors(new Set(['browser', 'cordova']), [
      { type: 'Program' },
      {
        type: 'IfStatement',
        test: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor',
          },
          property: {
            type: 'Identifier',
            name: 'isCordova',
          },
        },
        consequent,
      },
      consequent,
    ]);
    assert.equal(result.size, 1);
    assert.ok(result.has('cordova'));
  });

  it('filters on UnaryExpression', () => {
    const consequent = { type: 'BlockStatement' };
    const result = filterExecutorsByAncestors(
      new Set(['browser', 'server', 'cordova']),
      [
        { type: 'Program' },
        {
          type: 'IfStatement',
          test: {
            type: 'UnaryExpression',
            operator: '!',
            argument: {
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
          },
          consequent,
        },
        consequent,
      ]
    );
    assert.equal(result.size, 1);
    assert.ok(result.has('server'));
  });

  it('ignores unresolvable IfStatements is in ancestors', () => {
    const consequent = { type: 'BlockStatement' };
    const result = filterExecutorsByAncestors(new Set(['browser', 'server']), [
      { type: 'Program' },
      {
        type: 'IfStatement',
        test: { type: 'Identifier' },
        consequent,
      },
      consequent,
    ]);
    assert.equal(result.size, 2);
    assert.ok(result.has('browser'));
    assert.ok(result.has('server'));
  });
});
