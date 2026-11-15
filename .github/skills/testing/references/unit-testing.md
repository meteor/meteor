# Unit testing

Use this reference for isolated logic and owned adapters that can be exercised without starting Meteor. Apply the [shared value, scope, and verification guidance](../SKILL.md) first.

## Expectations

- Test a decision, transformation, or owned boundary with inputs that distinguish plausible failures. Organize cases around meaningful behavior classes, not every branch, method, or enum value.
- Derive expected results independently. Assert consequential output or effects; a stub being called does not establish correctness unless its arguments or interaction are the contract.
- Keep dependencies small while preserving the failure mechanism. A controlled filesystem or process boundary can test an adapter; a mock that removes the behavior being claimed cannot.
- Use fakes to control external inputs and failures, with behavior realistic enough to expose the owned handling. Avoid reproducing a dependency's internal test suite.
- Keep mutable fixtures, module state, clocks, and mocks isolated between cases. Restore changes and await all relevant work so a passing case cannot depend on another case's order or unfinished activity.

When proof requires the Meteor runtime, use [package-testing](../../package-testing/SKILL.md). When it requires CLI orchestration, use [self-testing](../../self-testing/SKILL.md). When it requires an assembled application's interaction across boundaries, use [e2e-testing](../../e2e-testing/SKILL.md). Do not build a fake runtime solely to keep a test in Jest.

## Repository workflow

Read [tools/unit-tests/README.md](../../../../tools/unit-tests/README.md) and [jest.config.js](../../../../tools/unit-tests/jest.config.js) for placement and discovery. Test dependencies belong in the isolated `tools/unit-tests` environment. Root dependencies help build the shipped Meteor tool; adding test dependencies there can change the product's dependency graph.

Place `tools/` and `scripts/` Jest cases beside their source as `*.test.js`. Package sources are excluded from this runner's discovery; existing package-specific unit tests use an explicit location under `tools/unit-tests/`. Follow the relevant arrangement instead of changing discovery globally. Some script tests run directly with Node's test runner and are deliberately excluded from Jest; preserve their established runner.

Commands run from the repository root:

```bash
npm run install:unit                         # Only when dependencies are needed
npm run test:unit -- tools/path/to/file.test.js
npm --prefix tools/unit-tests test -- tools/path/to/file.test.js -t 'scenario pattern'
```

Replace the illustrative path and pattern. Use the direct `--prefix` invocation when passing Jest options: the root `test:unit` script invokes another `npm test`, which can consume flags such as `-t` before Jest receives them. Confirm the expected file and case ran: the runner uses `--passWithNoTests`, so an exit code of zero can mean no matching tests. A TypeScript transform also does not imply `.test.ts` discovery; consult the configured patterns.

For CI behavior, inspect [unit-tests.yml](../../../workflows/unit-tests.yml) and the workflow owning any separately run script tests. Use the [shared regression process](../SKILL.md#describe-and-verify-regressions) to establish red/green evidence and follow the shared verification limits. A unit result only establishes the exercised boundary, not successful runtime integration.
