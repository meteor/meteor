import { Tinytest } from 'meteor/tinytest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Find the Meteor source checkout directory
function findSourceCheckout() {
  // Check METEOR_PACKAGE_DIRS environment variable first
  if (process.env.METEOR_PACKAGE_DIRS) {
    const dirs = process.env.METEOR_PACKAGE_DIRS.split(':');
    for (const dir of dirs) {
      const mongoDir = path.join(dir, 'mongo');
      if (fs.existsSync(path.join(mongoDir, 'tsconfig.types.json'))) {
        return mongoDir;
      }
    }
  }

  // Try common Meteor source checkout locations
  const possibleRoots = [
    process.env.METEOR_CHECKOUT_DIR,
    path.join(process.env.HOME || '', 'Projects/meteor'),
  ].filter(Boolean);

  for (const root of possibleRoots) {
    const mongoDir = path.join(root, 'packages/mongo');
    if (fs.existsSync(path.join(mongoDir, 'tsconfig.types.json'))) {
      return mongoDir;
    }
  }

  return null;
}

Tinytest.add('mongo - type definitions compile', function (test) {
  const pkgDir = findSourceCheckout();

  if (!pkgDir) {
    // Skip test if we can't find the source checkout
    // This can happen in CI or when running from a release build
    console.log('Skipping type definition test: source checkout not found');
    test.ok();
    return;
  }

  const tsconfigPath = path.join(pkgDir, 'tsconfig.types.json');
  if (!fs.existsSync(tsconfigPath)) {
    test.fail(`tsconfig.types.json not found at ${tsconfigPath}`);
    return;
  }

  try {
    execSync('npx tsc --project tsconfig.types.json', {
      cwd: pkgDir,
      stdio: 'pipe'
    });
    test.ok();
  } catch (e) {
    const output = e.stdout?.toString() || e.stderr?.toString() || e.message;
    test.fail('TypeScript compilation failed:\n' + output);
  }
});
