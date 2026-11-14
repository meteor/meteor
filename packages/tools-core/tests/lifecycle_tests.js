import {
  createMeteorToolContext,
  runToolScenarios,
  scenario,
  step,
  when,
} from "../lib/lifecycle.js";

Tinytest.add('tools-core - lifecycle - context keeps provider state', function (test) {
  const state = { selectedTarget: 'emulator-5554' };
  const context = createMeteorToolContext({
    appDir: '/tmp/app',
    command: 'run',
    provider: 'capacitor',
    platform: 'android',
    isRun: true,
    isNative: true,
    state,
  });

  test.equal(context.appDir, '/tmp/app');
  test.equal(context.command, 'run');
  test.equal(context.provider, 'capacitor');
  test.equal(context.platform, 'android');
  test.equal(context.isRun, true);
  test.equal(context.isNative, true);
  test.equal(context.state, state);
});

Tinytest.add('tools-core - lifecycle - context exposes derived mobile server url', function (test) {
  const meteorGlobal = Package.meteor.global;
  const previousCommand = meteorGlobal.currentCommand;

  try {
    meteorGlobal.currentCommand = {
      name: 'run',
      options: { 'mobile-server': 'raw.example:3000' },
      mobileServerUrl: 'http://canonical.example:3000/',
    };

    const context = createMeteorToolContext();

    test.equal(context.mobileServerUrl, 'http://canonical.example:3000/');
    test.equal(context.options['mobile-server'], 'raw.example:3000');
  } finally {
    meteorGlobal.currentCommand = previousCommand;
  }
});

Tinytest.addAsync('tools-core - lifecycle - scenario run receives context', async function (test) {
  const calls = [];
  const context = createMeteorToolContext({
    command: 'run',
    isRun: true,
    state: {},
  });

  await runToolScenarios({
    context,
    setup: async ctx => {
      ctx.state.ready = true;
      calls.push('setup');
    },
    scenarios: [
      scenario('run', {
        when: ctx => ctx.isRun,
        run: async ctx => {
          calls.push(`run:${ctx.state.ready}`);
        },
      }),
    ],
  });

  test.equal(calls, ['setup', 'run:true']);
});

Tinytest.addAsync('tools-core - lifecycle - steps are ordered run sugar', async function (test) {
  const calls = [];
  const context = createMeteorToolContext({ isBuild: true, state: {} });

  await runToolScenarios({
    context,
    scenarios: [
      scenario('build', {
        when: ctx => ctx.isBuild,
        steps: [
          step('prepare', async ctx => {
            ctx.state.prepared = true;
            calls.push('prepare');
          }),
          async ctx => {
            calls.push(`build:${ctx.state.prepared}`);
          },
        ],
      }),
    ],
  });

  test.equal(calls, ['prepare', 'build:true']);
});

Tinytest.addAsync('tools-core - lifecycle - when gates steps', async function (test) {
  const calls = [];
  const context = createMeteorToolContext({ isRun: true, isNative: false });

  await runToolScenarios({
    context,
    scenarios: [
      scenario('run', {
        when: ctx => ctx.isRun,
        steps: [
          when(ctx => ctx.isNative, async () => {
            calls.push('native');
          }),
          when(ctx => !ctx.isNative, async () => {
            calls.push('web');
          }),
        ],
      }),
    ],
  });

  test.equal(calls, ['web']);
});

Tinytest.addAsync('tools-core - lifecycle - errors include scenario and step', async function (test) {
  const context = createMeteorToolContext({ isBuild: true });

  try {
    await runToolScenarios({
      context,
      scenarios: [
        scenario('build', {
          when: ctx => ctx.isBuild,
          steps: [
            step('compile', async () => {
              throw new Error('failed');
            }),
          ],
        }),
      ],
    });
    test.fail('Expected lifecycle error');
  } catch (error) {
    test.matches(error.message, /build/);
    test.matches(error.message, /compile/);
    test.matches(error.message, /failed/);
  }
});
