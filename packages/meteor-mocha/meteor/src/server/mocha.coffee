options =
  ui: 'bdd'
  ignoreLeaks: true
#  reporter: practical.mocha.MeteorPublishReporter

global.mocha = new @practical.mocha.Mocha(options)

#TODO create pull request to mike:mocha-core
Package["practicalmeteor:mocha-core"].setupGlobals(mocha)
