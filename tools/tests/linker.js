const selftest = require('../tool-testing/selftest.js');
const Sandbox = selftest.Sandbox;
const files = require('../fs/files.js');

selftest.define('linker - remove non deterministic modules package.json\'s fields', function () {
    const s = new Sandbox();
    let run;

    // Using the `shell` app as it meets the criteria. No need to create another one just for this test.
    s.createApp('myapp', 'shell');
    s.cd('myapp');

    const buildDir = '../build';

    run = s.run('build', '--directory', buildDir);
    run.waitSecs(300);

    run.expectExit(0);

    const programJsonPath = files.pathJoin(s.cwd, buildDir, 'bundle/programs/web.browser/program.json');
    const program = JSON.parse(files.readFile(programJsonPath, 'utf-8'));
    const file = program.manifest[0].path;
    const filePath = files.pathJoin(s.cwd, buildDir, 'bundle/programs/web.browser', file);
    const fileContents = files.readFile(filePath, 'utf-8');

    // Checking for the fields which should not be in the bundle. For the test app this is fine as we know those strings
    // are not used anywhere else in the app code.
    selftest.expectEqual(fileContents.includes('_where'), false);
    selftest.expectEqual(fileContents.includes('_args'), false);
});

