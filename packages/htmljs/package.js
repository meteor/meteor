Package.describe({
  summary: "Easy macros for generating DOM elements in Javascript"
});

Package.on_use(function (api) {
  api.use('underscore', 'client');
  // Note: html.js will optionally use jquery if it's available
  api.add_files('html.js', 'client');
  api.export([
    'A', 'ABBR', 'ACRONYM', 'B', 'BDO', 'BIG', 'BLOCKQUOTE', 'BR', 'BUTTON',
    'CAPTION', 'CITE', 'CODE', 'COL', 'COLGROUP', 'DD', 'DEL', 'DFN', 'DIV',
    'DL', 'DT', 'EM', 'FIELDSET', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HR', 'I', 'IFRAME', 'IMG', 'INPUT', 'INS', 'KBD', 'LABEL', 'LEGEND', 'LI',
    'OBJECT', 'OL', 'OPTGROUP', 'OPTION', 'P', 'PARAM', 'PRE', 'Q', 'S', 'SAMP',
    'SCRIPT', 'SELECT', 'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP',
    'TABLE', 'TBODY', 'TD', 'TEXTAREA', 'TFOOT', 'TH', 'THEAD', 'TR', 'TT', 'U',
    'UL', 'VAR'
  ], 'client');
});

Package.on_test(function (api) {
  api.use('htmljs', 'client');
  api.use('tinytest');
  api.add_files('htmljs_test.js', 'client');
});
