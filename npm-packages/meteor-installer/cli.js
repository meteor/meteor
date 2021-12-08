#!/usr/bin/env node

const command = process.argv[2];

if (!command) {
  console.log(`
  Usage: meteor-installer <command>

  Commands:
    install
    uninstall
  `);
  process.exit(1);
}

if (command === 'install') {
  require('./install.js');
} else if (command === 'uninstall') {
  const { uninstall } = require('./uninstall');
  uninstall();
} else {
  console.error(`Unrecognized command: ${command}`);
  process.exit(1);
}
