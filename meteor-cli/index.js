const { Generator } = require('meteor-cli');

class ReactTypeScriptGenerator extends Generator {
  constructor(options) {
    super(options);

    // Add support for TypeScript
    this.addGenerator('typescript');
  }

  // Generate the React application
  generate() {
    // Generate the React application using the existing Meteor React generator
    this.runGenerator('react');
  }
}

module.exports = ReactTypeScriptGenerator;