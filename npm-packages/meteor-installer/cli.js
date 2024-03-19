#!/usr/bin/env node

const command = process.argv[2] || 'install';

if (!command) {
  console.log(`
  Usage: npx meteor@<version> <command>

  Commands:
    install
    uninstall
  `);
  process.exit(1);
}

if (command === 'install') {
  require('./install');
} else if (command === 'uninstall') {
  const { uninstall } = require('./uninstall');
  uninstall();
} else {
  console.error(`Unrecognized command: ${command}`);
  process.exit(1);
}
