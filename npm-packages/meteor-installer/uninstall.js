const { meteorPath } = require('./config');
const rimraf = require('rimraf');

function uninstall() {
  console.log(`Uninstalling Meteor from ${meteorPath}`);

  try {
    rimraf.sync(meteorPath);
  } catch (err) {
    console.log('Encountered error while uninstalling:');
    console.error(err);
    process.exit(1);
  }

  console.log('Successfully uninstalled Meteor');
}

module.exports = {
  uninstall,
};
