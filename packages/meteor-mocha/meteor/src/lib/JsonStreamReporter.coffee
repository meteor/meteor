class @practical.mocha.JsonStreamReporter extends @practical.mocha.BaseReporter

  constructor: (runner, options)->
    super(runner, options)

    @runner.on 'start', (total)=>
      console.log(JSON.stringify(['start', { total: @stats.total }]))

    @runner.on 'pass', (test)=>
      console.log(JSON.stringify(['pass', @clean(test)]))

    @runner.on 'fail', (test, err)=>
      test = @clean(test)
      test.err = err.message
      console.log(JSON.stringify(['fail', test]))

    @runner.on 'end', =>
      console.log(JSON.stringify(['end', @stats]))

  #/**
  # * Return a plain-object representation of `test`
  # * free of cyclic properties etc.
  # *
  # * @param {Object} test
  # * @return {Object}
  # * @api private
  # */

  clean: (test)->
    return {
      title: test.title
      fullTitle: test.fullTitle()
      duration: test.duration
    }
