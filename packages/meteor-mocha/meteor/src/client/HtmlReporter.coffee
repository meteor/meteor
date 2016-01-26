log = new ObjectLogger('HtmlReporter', 'info')

practical.mocha ?= {}

class practical.mocha.HtmlReporter extends practical.mocha.BaseReporter

  constructor: (@clientRunner, @serverRunner, @options = {})->
    try
      log.enter('constructor')
      @addReporterHtml()

      @reporter = new practical.mocha.reporters.HTML(@clientRunner)
      @serverReporter = new practical.mocha.reporters.HTML(@serverRunner, {
        elementIdPrefix: 'server-'
      })
    finally
      log.return()

  ###
    Adds the html required by the mocha HTML reporter to the body of the html
    document. We modified the mocha HTML reporter to be able to display 2 reporters
    at the same time, one for client tests and one for server tests.
    TODO: Create a single meteor reactive reporter.
  ###
  addReporterHtml: ()=>
    try
      log.enter("addReporterHtml")
      div = document.createElement('div')

      div.innerHTML = '<div class="content">
        <div class="test-wrapper">
          <h1 class="title">Client tests</h1>

          <div id="mocha" class="mocha"></div>
        </div>

        <div class="divider"></div>

        <div class="test-wrapper">
          <h1 class="title">Server tests</h1>

          <div id="server-mocha" class="mocha"></div>
        </div>
      </div>'

      document.body.appendChild(div)
    finally
      log.return()


# Meteor.startup ->
