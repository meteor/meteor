log = new ObjectLogger('MeteorPublishReporter', 'info')

class @practical.mocha.MeteorPublishReporter extends @practical.mocha.BaseReporter

  # TODO: Change this to use Meteor.bindEnvironment
  @publisher: null

  constructor: (runner, options)->
    try
      log.enter 'constructor', arguments
      expect(options.reporterOptions, 'options.reporterOptions').to.be.an('object')

      # Update runner tests
      runner.grep(options.reporterOptions.grep)

      super(runner, options)

#      @publisher = practical.mocha.MeteorPublishReporter.publisher
      @publisher = options.reporterOptions.publisher
      expect(@publisher, '@publisher').to.be.an('object')
      expect(@publisher.ready, '@publisher.ready').to.be.a('function')
      expect(@publisher.added, '@publisher.added').to.be.a('function')
      expect(@publisher.onStop, '@publisher.onStop').to.be.a('function')


      @publisher.onStop =>
        @stopped = true
      @stopped = false
      @sequence = 0

      # Specify how to run tests 'serial' or 'parallel'
      # Running in 'serial' will start server tests first and then client tests
      @added 'run order', process.env.MOCHA_RUN_ORDER || 'parallel'


      @runner.on 'start', =>
        try
          log.enter 'onStart', arguments
#          @added 'start', {total: @stats.total}
          @added 'start', @stats
        finally
          log.return()

      @runner.on 'suite', (suite)=>
        try
          log.enter 'onSuite', arguments
#          log.info "suite:", suite.title
#          @added 'suite', {title: suite.title, _fullTitle: suite.fullTitle(), root: suite.root}
          @added 'suite', @cleanSuite(suite)
        finally
          log.return()

      @runner.on 'suite end', (suite)=>
        try
          log.enter 'onSuiteEnd', arguments
          @added 'suite end', @cleanSuite(suite)
        finally
          log.return()

      @runner.on 'test end', (test)=>
        try
          log.enter 'onTestEnd', arguments
          @added 'test end', @cleanTest(test)
        finally
          log.return()

      @runner.on 'pass', (test)=>
        try
          log.enter 'onPass', arguments
          @added 'pass', @cleanTest(test)
        finally
          log.return()

      @runner.on 'fail', (test, error)=>
        try
          log.enter 'onFail', arguments
          @added 'fail', @cleanTest(test)
        finally
          log.return()

      @runner.on 'end', =>
        try
          log.enter 'onEnd', arguments
          @added 'end', @stats
        finally
          log.return()

      @runner.on 'pending', (test)=>
        try
          log.enter 'onPending', arguments
          log.debug "test", test
          @added 'pending', @cleanTest(test)
        finally
          log.return()
    finally
      log.return()


  added: (event, data)=>
    try
      log.enter 'added', arguments
#      log.info event, data
      return if @stopped is true
      @sequence++
      doc =
        _id: "#{@sequence}"
        event: event
        data: data
      @publisher.added('mochaServerRunEvents', doc._id, doc)
    finally
      log.return()


  ###*
  # Return a plain-object representation of `test`
  # free of cyclic properties etc.
  #
  # @param {Object} test
  # @return {Object}
  # @api private
  ###

# TODO: Add test.server = true so we know it's a server test
  cleanTest: (test)->
    try
      log.enter("cleanTest", arguments)
#      cleanTest = @clean(test)
#      cleanTest._fullTitle =  test.fullTitle()
      # So we can show the server side test code in the reporter
      return {
        title: test.title
        _fullTitle: test.fullTitle()
        type: test.type
        state: test.state
        parent: @cleanSuite(test.parent)
        speed: test.speed
        pending: test.pending
        duration: test.duration
        async: test.async
        sync: test.sync
        _timeout: test._timeout
        _slow: test._slow
        fn: test.fn?.toString() # If the test or suite if skipped the fn is null
        err: @errorJSON(test.err or {})
      }
      return cleanTest
    finally
      log.return()


  cleanSuite: (suite)->
    try
      log.enter("cleanSuite", arguments)
#      cleanSuite = @clean(suite)
#      cleanSuite._fullTitle =  suite.fullTitle()
#      console.log(cleanSuite)
      return {
      title: suite.title
      _fullTitle: suite.fullTitle()
      root: suite.root
      pending: suite.pending
      }
    finally
      log.return()

  ###*
  # Transform `error` into a JSON object.
  # @param {Error} err
  # @return {Object}
  ###

  errorJSON: (err) =>
    res = {}
    Object.getOwnPropertyNames(err).forEach (key) ->
      res[key] = err[key]
      return
    , err
    res
