import { Tinytest } from 'meteor/tinytest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

Tinytest.add('mongo - type definitions compile', function (test) {
  // Find the package directory - Meteor may run from .meteor/local/build
  let pkgDir = path.join(process.cwd(), 'packages/mongo');

  // If not found, try to find it relative to the source checkout
  if (!fs.existsSync(pkgDir)) {
    // Look for it in typical Meteor test locations
    const possiblePaths = [
      path.resolve(process.cwd(), '../../packages/mongo'),
      path.resolve(process.cwd(), '../../../packages/mongo'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        pkgDir = p;
        break;
      }
    }
  }

  const tsconfigPath = path.join(pkgDir, 'tsconfig.types.json');
  if (!fs.existsSync(tsconfigPath)) {
    test.fail(`tsconfig.types.json not found at ${tsconfigPath} (cwd: ${process.cwd()})`);
    return;
  }

  try {
    execSync('npx tsc --project tsconfig.types.json', {
      cwd: pkgDir,
      stdio: 'pipe',
      shell: '/bin/bash',
      env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' }
    });
    test.ok();
  } catch (e) {
    const output = e.stdout?.toString() || e.stderr?.toString() || e.message;
    test.fail('TypeScript compilation failed:\n' + output);
  }
});
