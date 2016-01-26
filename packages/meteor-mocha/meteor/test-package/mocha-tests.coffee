log = loglevel.createPackageLogger('mocha:test', 'info')

describe '1 - Array', ->
  describe '1.1 - #indexOf()', ->
    it 'should return -1 when the value is not present', ->
      expect([1,2,3].indexOf(5)).to.equal -1
      expect([1,2,3].indexOf(0)).to.equal -1

  describe '1.2 - length', ->
    it 'should return length of array', ->
      expect([1,2,3].length).to.equal 3


describe '2 - Async test', ()->
  it 'should pass', (done)->
    Meteor.setTimeout =>
      done()
    , 1000
  it 'should throw', (done)->
    Meteor.setTimeout =>
      done("I'm throwing")
    , 1000

describe '3 - Skipped test', ()->
  it.skip '3.1 - should skip test', (done)->
    Meteor.setTimeout =>
      done()
    , 1000

  it '3.2 - should skip test'

describe '4 - Uncaught exception suite', ()->
  it 'should fail due to an uncaught exception', (done)->
    setTimeout =>
      throw new Error("I'm an uncaught exception")
      done()
    , 1000



describe '5 - All sync test suite', ->
  before ->
    log.debug 'before'
  after ->
    log.debug 'after'
  beforeEach ->
    log.debug 'beforeEach'
  afterEach ->
    log.debug 'afterEach'
  it 'passing', ->
    expect(true).to.be.true
  it 'throwing', ->
    expect(false).to.be.true

describe '6 - All async test suite', ->

  before (done)->
    @keepContext = true
    log.debug 'before'
    Meteor.defer -> done()

  after (done)->
    log.debug 'after'
    Meteor.setTimeout( (-> done()), 500)

  beforeEach (done)->
    log.debug 'beforeEach'
    Meteor.setTimeout( (-> done()), 500)

  afterEach (done)->
    log.debug 'afterEach'
    @timeout(1000)
    Meteor.setTimeout( (-> done()), 500)

  @timeout(5000)



  it 'passing', (done)->
    expect(@keepContext).to.be.true
    Meteor.setTimeout( (-> done()), 2500)

  it 'throwing', (done)->
    Meteor.defer -> done(new Error('failing'))

describe '7 - implicit wait', ->
  it 'during findOne', ->
    doc = practical.TestCollection.findOne (_id: 'xxx')

describe.skip '8 - skip suite', ->
  it "this won't run", ->
    throw new Error("This is an error")
