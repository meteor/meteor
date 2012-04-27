var assert = require('assert');
var html_scanner = require('../../../packages/templating/html_scanner.js');

module.exports = {

  'match tag without whitespace': function() {
    console.log()
    assert.equal( "foo", "<sometag name='foo'>bar</sometag>".match(html_scanner.regex.name_attr)[1] );
  },

  'match tag with lh whitespace': function() {
    console.log()
    assert.equal( "foo", "<sometag name  ='foo'>bar</sometag>".match(html_scanner.regex.name_attr)[1] );
  },

  'match tag with rh whitespace': function() {
    console.log()
    assert.equal( "foo", "<sometag name=  'foo'>bar</sometag>".match(html_scanner.regex.name_attr)[1] );
  },

  'match tag with whitespace': function() {
    console.log()
    assert.equal( "foo", "<sometag name  =  'foo'>bar</sometag>".match(html_scanner.regex.name_attr)[1] );
  }
};