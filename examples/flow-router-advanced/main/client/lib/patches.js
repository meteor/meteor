"use strict"


////////////////////////////////////////////////////////////////////
// Patches
//

// stubs for IE
if (!window.console) {
  window.console = {}
}
if (!window.console.log) {
  window.console.log = function (msg) {
    $('#log').append('<br /><p>' + msg + '</p>')
  };
}

// fix bootstrap dropdown unclickable issue on iOS
// https://github.com/twitter/bootstrap/issues/4550
$(document).on('touchstart.dropdown.data-api', '.dropdown-menu', function (e) {
    e.stopPropagation();
});
