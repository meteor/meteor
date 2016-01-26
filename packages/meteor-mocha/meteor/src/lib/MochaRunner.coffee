log = new ObjectLogger('MochaRunner', 'info')

practical = @practical || {}



class practical.MochaRunner

  @instance: null

  @get: ->
    practical.MochaRunner.instance ?= new practical.MochaRunner()

  serverRunEvents: null
  publishers: {}

  constructor: ->
    try
      log.enter 'constructor'

      @serverRunEvents = new Mongo.Collection('mochaServerRunEvents')
      if Meteor.isServer
        Meteor.methods({
          "mocha/runServerTests": @runServerTests.bind(@)
        })
        @publish()

    finally
      log.return()



  publish: ->
    try
      log.enter("publish")
      self = @
      Meteor.publish 'mochaServerRunEvents', (runId)->
        try
          log.enter 'publish.mochaServerRunEvents'
          expect(@ready).to.be.a('function')
          self.publishers[runId] ?= @
          @ready()
          # You can't return any other value but a Cursor, otherwise it will throw an exception
          return undefined
        catch ex
          log.error ex.stack if ex.stack?
          throw new Meteor.Error('unknown-error', (if ex.message? then ex.message else undefined), (if ex.stack? then ex.stack else undefined))
        finally
          log.return()
    finally
      log.return()


  runServerTests: (runId, grep)=>
    try
      log.enter("runServerTests", runId)
      expect(runId).to.be.a("string")
      expect(@publishers[runId], "publisher").to.be.an("object")
      expect(Meteor.isServer).to.be.true

      mochaRunner = new practical.mocha.Mocha()
      @_addTestsToMochaRunner(mocha.suite, mochaRunner.suite)

      mochaRunner.reporter(practical.mocha.MeteorPublishReporter, {
        grep: @escapeGrep(grep)
        publisher: @publishers[runId]
      })

      log.info "Starting server side tests with run id #{runId}"
      mochaRunner.run (failures)->
        log.warn 'failures:', failures

    finally
      log.return()


  # Recursive function that starts with global suites and adds all sub suites within each global suite
  _addTestsToMochaRunner: (fromSuite, toSuite)->
    try
      log.enter("_addTestToMochaRunner")

      addHooks = (hookName)->
        for hook in fromSuite["_#{hookName}"]
          toSuite[hookName](hook.title, hook.fn)
        log.debug("Hook #{hookName} for '#{fromSuite.fullTitle()}' added.")

      addHooks("beforeAll")
      addHooks("afterAll")
      addHooks("beforeEach")
      addHooks("afterEach")

      for test in fromSuite.tests
        test = new practical.mocha.Test(test.title, test.fn)
        toSuite.addTest(test)
        log.debug("Tests for '#{fromSuite.fullTitle()}' added.")

      for suite in fromSuite.suites
        newSuite = practical.mocha.Suite.create(toSuite, suite.title)
        newSuite.timeout(suite.timeout())
        log.debug("Suite #{newSuite.fullTitle()}  added to '#{fromSuite.fullTitle()}'.")
        @_addTestsToMochaRunner(suite, newSuite)

    finally
      log.return()


  runEverywhere: ->
    try
      log.enter 'runEverywhere'
      expect(Meteor.isClient).to.be.true

      @runId = Random.id()
      @serverRunSubscriptionHandle = Meteor.subscribe 'mochaServerRunEvents', @runId, {
        onReady: _.bind(@onServerRunSubscriptionReady, @)
        onError: _.bind(@onServerRunSubscriptionError, @)
      }

    finally
      log.return()


  setReporter: (@reporter)->

  escapeGrep: (grep = '')->
    try
      log.enter("escapeGrep", grep)
      matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;
      grep.replace(matchOperatorsRe,  '\\$&')
      return new RegExp(grep)
    finally
      log.return()

  onServerRunSubscriptionReady: =>
    try
      log.enter 'onServerRunSubscriptionReady'
      query = practical.mocha.Mocha.utils.parseQuery(location.search || '');

      Meteor.call "mocha/runServerTests", @runId,  query.grep, (err)->
        log.debug "tests started"
        log.error(err) if err

      Tracker.autorun =>
        runOrder = @serverRunEvents.findOne({event: "run order"})
        if runOrder?.data is "serial"
          reporter = new practical.mocha.ClientServerReporter(null, {runOrder: "serial"})
        else if runOrder?.data is "parallel"
          mocha.reporter(practical.mocha.ClientServerReporter)
          mocha.run(->)

    finally
      log.return()


  onServerRunSubscriptionError: (meteorError)->
    try
      log.enter 'onServerRunSubscriptionError'
      log.error meteorError
    finally
      log.return()


@MochaRunner = practical.MochaRunner.get()

if Meteor.isClient
# Run the tests on Meteor.startup, after all code is loaded and ready
  Meteor.startup ->
    # We defer because if another package sets a different reporter on Meteor.startup,
    # that's the reporter that we want to be used.
    Meteor.defer ->
      MochaRunner.runEverywhere()
