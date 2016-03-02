import {
  CLIENT,
  SERVER,
  PACKAGE,
  UNIVERSAL,
  PACKAGE_CONFIG,
  MOBILE_CONFIG,
  COMPATIBILITY,
} from '../environment'

const exportedToAllEnvs = [CLIENT, COMPATIBILITY, SERVER, UNIVERSAL]
const exportedToClientEnvs = [CLIENT, COMPATIBILITY, UNIVERSAL]
const exportedToWebEnvs = [CLIENT, COMPATIBILITY, UNIVERSAL]
const exportedToServerEnvs = [SERVER, UNIVERSAL]


export default {
  // accounts-base
  Accounts: exportedToAllEnvs,
  AccountsClient: exportedToClientEnvs,
  AccountsServer: exportedToServerEnvs,

  // autoupdate
  Autoupdate: exportedToAllEnvs,

  // babel-compiler
  Babel: exportedToServerEnvs,
  BabelCompiler: exportedToServerEnvs,

  // babel-runtime
  babelHelpers: exportedToAllEnvs,

  // binary-heap
  MaxHeap: exportedToAllEnvs,
  MinHeap: exportedToAllEnvs,
  MinMaxHeap: exportedToAllEnvs,

  // blaze
  Blaze: exportedToAllEnvs,
  UI: exportedToAllEnvs,
  Handlebars: exportedToAllEnvs,

  // boilerplate-generator
  Boilerplate: exportedToServerEnvs,

  // browser-policy-common
  BrowserPolicy: exportedToServerEnvs,

  // caching-compiler
  CachingCompiler: exportedToServerEnvs,
  MultiFileCachingCompiler: exportedToServerEnvs,

  // caching-html-compiler
  CachingHtmlCompiler: exportedToServerEnvs,

  // check
  check: exportedToAllEnvs,
  Match: exportedToAllEnvs,

  // constraint-solver
  ConstraintSolver: exportedToAllEnvs,

  // ddp-client
  // ddp
  DDP: exportedToAllEnvs,

  // ddp-common
  DDPCommon: exportedToAllEnvs,

  // ddp-rate-limiter
  DDPRateLimiter: exportedToAllEnvs,

  // ddp-server
  // ddp
  DDPServer: exportedToAllEnvs,

  // deps
  Tracker: exportedToAllEnvs,
  Deps: exportedToAllEnvs,

  // diff-sequence
  DiffSequence: exportedToAllEnvs,

  // ecmascript-runtime
  // disabled because the babel-eslint parser defines them anyways
  // Symbol: exportedToAllEnvs,
  // Map: exportedToAllEnvs,
  // Set: exportedToAllEnvs,

  // ecmascript
  ECMAScript: exportedToAllEnvs,

  // ejson
  EJSON: exportedToAllEnvs,

  // email
  Email: exportedToServerEnvs,
  EmailInternals: exportedToServerEnvs,

  // es5-shim
  // Date: exportedToAllEnvs,
  // parseInt: exportedToAllEnvs

  // facebook
  Facebook: exportedToAllEnvs,

  // fastclick
  FastClick: exportedToWebEnvs,

  // geojson-utils
  GeoJSON: exportedToAllEnvs,

  // github
  Github: exportedToAllEnvs,

  // google
  Google: exportedToAllEnvs,

  // html-tools
  HTMLTools: exportedToAllEnvs,

  // htmljs
  HTML: exportedToAllEnvs,

  // http
  HTTP: exportedToAllEnvs,

  // jquery
  $: exportedToClientEnvs,
  jQuery: exportedToClientEnvs,

  // launch-screen
  LaunchScreen: exportedToAllEnvs,

  // logging
  Log: exportedToAllEnvs,

  // logic-solver
  Logic: exportedToAllEnvs,

  // markdown
  Showdown: exportedToAllEnvs,

  // meetup
  Meetup: exportedToAllEnvs,

  // meteor-developer
  MeteorDeveloperAccounts: exportedToAllEnvs,

  // meteor
  Meteor: exportedToAllEnvs,

  // minifiers
  CssTools: exportedToAllEnvs,
  UglifyJSMinify: exportedToAllEnvs,
  UglifyJS: exportedToAllEnvs,

  // minimongo
  LocalCollection: exportedToAllEnvs,
  Minimongo: exportedToAllEnvs,

  // mongo-id
  MongoID: exportedToAllEnvs,

  // mongo
  MongoInternals: exportedToServerEnvs,
  Mongo: exportedToAllEnvs,

  // npm-mongo
  NpmModuleMongodb: exportedToServerEnvs,
  NpmModuleMongodbVersion: exportedToServerEnvs,

  // oauth-encryption
  OAuthEncryption: exportedToServerEnvs,

  // oauth
  OAuth: exportedToAllEnvs,
  Oauth: exportedToAllEnvs,

  // oauth1
  OAuth1Binding: exportedToServerEnvs,

  // ordered-dict
  OrderedDict: exportedToAllEnvs,

  // package-version-parser
  PackageVersion: exportedToAllEnvs,

  // promise
  Promise: exportedToAllEnvs,

  // random
  Random: exportedToAllEnvs,

  // rate-limit
  RateLimiter: exportedToAllEnvs,

  // reactive-dict
  ReactiveDict: exportedToAllEnvs,

  // reactive-var
  ReactiveVar: exportedToAllEnvs,

  // reload
  Reload: exportedToClientEnvs,

  // route-policy
  RoutePolicy: exportedToServerEnvs,

  // service-configuration
  ServiceConfiguration: exportedToAllEnvs,

  // session
  Session: exportedToClientEnvs,

  // sha
  SHA256: exportedToAllEnvs,

  // spacebars-compiler
  SpacebarsCompiler: exportedToAllEnvs,

  // spacebars
  Spacebars: exportedToAllEnvs,

  // spiderable
  Spiderable: exportedToAllEnvs,

  // templating-tools
  TemplatingTools: exportedToAllEnvs,

  // templating
  Template: exportedToClientEnvs,

  // tinytest
  Tinytest: exportedToAllEnvs,

  // tracker
  // Tracker: exportedToAllEnvs,
  // Deps: exportedToAllEnvs,

  // twitter
  Twitter: exportedToAllEnvs,

  // ui
  // Blaze: exportedToAllEnvs,
  // UI: exportedToAllEnvs,
  // Handlebars: exportedToAllEnvs,

  // underscore
  _: exportedToAllEnvs,

  // url
  URL: exportedToAllEnvs,

  // webapp-hashing
  WebAppHashing: exportedToAllEnvs,

  // webapp
  WebApp: exportedToAllEnvs,
  main: exportedToServerEnvs,
  WebAppInternals: exportedToServerEnvs,

  // weibo
  Weibo: exportedToAllEnvs,

  // xmlbuilder
  XmlBuilder: exportedToServerEnvs,


  // globals from npm package "gloabls"
  // used by setting "env: meteor" in .eslintrc)
  App: [MOBILE_CONFIG],
  Assets: [SERVER, UNIVERSAL],
  Cordova: [PACKAGE_CONFIG],
  Npm: [PACKAGE_CONFIG, SERVER, UNIVERSAL],
  Package: [...exportedToAllEnvs, PACKAGE_CONFIG],
  Plugin: [PACKAGE],
  process: [SERVER, UNIVERSAL]
  // Router: false,
  // share: false,
  // Utils: false
}
