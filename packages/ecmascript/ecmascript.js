ECMAScript = {
  compileForShell(command) {
    const babelOptions = Babel.getDefaultOptions();
    babelOptions.sourceMap = false;
    babelOptions.ast = false;

    /*
     * Since import *will* work as expected if everything is on one line,
     * we'll allow a case of the import statement being followed by a
     * semicolon, some optional whitespace and a word character.
     */
    if (command.match(/(?!.*?;\s*\S+)^\s*import/)) {
      throw new Error(
        'Using "import" in the Meteor shell is unlikely to work how you ' +
        'expect.  Try "var something = require(\'moduleId\').default;" ' +
        'instead, or see ' +
        'https://github.com/meteor/meteor/issues/6764 for more information.'
      );
    }

    return Babel.compile(command, babelOptions).code;
  }
};
