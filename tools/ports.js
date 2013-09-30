//
// Policies and utilities for dealing with port numbers and IP address
// binding.
//
// NOTE: when we pass around a "port string" we actually mean an IP
// address and port.

var _ = require('underscore');

var files = exports;
_.extend(exports, {
  DEFAULT_PORT: 3000,

  portFromAddr: function (addr) {

  },

  ipFromAddr: function (addr, global) {

  },


  // Take an optimist options object and add options for our various
  // ports.
  optionsForPorts: function (opt) {
    return opt.alias('port', 'p').default('port', 3000)
      .describe('port', 'XXX Port or IP:Port to listen on.')
      .describe('app-port', 'XXX')
      .describe('mongo-port', 'XXX');
  },

  // Take an optimist argv and return a dictionary of port options
  // { mainAddr: String,
  //   appAddr: String,
  //   mongoAddr: String }
  addrsFromArgv: function (argv) {
    // XXX
    return {
      mainAddr: "0.0.0.0:3000",
      appAddr: "127.0.0.1:3001",
      mongoAddr: "127.0.0.1:3002"
    };
  },

  prettyUrlFromAddr: function (addr) {
    var outerPort = 3000; // XXX YYY
    return ('http://localhost:' + outerPort + '/');
  }


});
