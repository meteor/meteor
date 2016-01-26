Tinytest.add 'mocha should exist', (test)->
  expect(mocha).to.be.an 'object'

Tinytest.add 'mocha.run should exist', (test)->
  expect(mocha.run).to.be.a 'function'

# Server side we need to wrap all bdd exports in fibers.
# Not implemented yet.
if Meteor.isClient
  Tinytest.add 'describe should exist', (test)->
    expect(describe).to.be.a 'function'
