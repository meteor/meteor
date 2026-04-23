// Interactive Atmosphere package search for `meteor add`. Presents a live
// checkbox-plus prompt: the user types a query, results stream in from the
// Atmosphere DDP endpoint (`Search.query`) with debounced calls, and any
// number of packages can be toggled with <space>. <enter> commits the
// selection and hands the chosen names back to the `add` command.

const inquirer = require('inquirer');
const checkboxPlus = require('inquirer-checkbox-plus-prompt');
const chalk = require('chalk');
const authClient = require('../meteor-services/auth-client.js');
const config = require('../meteor-services/config.js');
const Console = require('../console/console.js').Console;

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 250;

function createPromptModuleWithCheckboxPlus() {
  // `inquirer.createPromptModule()` builds a fresh module that only has the
  // built-in prompt types. `inquirer.registerPrompt` mutates the default
  // shared module, not ours. Register on our module so `type: 'checkbox-plus'`
  // resolves to the plugin.
  const prompt = inquirer.createPromptModule();
  prompt.registerPrompt('checkbox-plus', checkboxPlus);
  return prompt;
}

function MeteorSearchAbortedError() {}
MeteorSearchAbortedError.prototype = Object.create(Error.prototype);
exports.MeteorSearchAbortedError = MeteorSearchAbortedError;

function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  if (max <= 3) return str.slice(0, max);
  return str.slice(0, max - 3) + '...';
}

function pad(str, width) {
  if (str.length >= width) return str;
  return str + ' '.repeat(width - str.length);
}

function renderChoiceLabel(pkg, termWidth) {
  // Layout: name (padded) │ description (star-suffix if any)
  // Atmosphere nests description/flags under `latestVersion`.
  const description = (pkg.latestVersion && pkg.latestVersion.description) || '';
  const NAME_COL = 34;
  const name = pkg.name.length > NAME_COL
    ? pkg.name.slice(0, NAME_COL - 1) + '...'
    : pad(pkg.name, NAME_COL);
  const separator = chalk.dim(' │ ');
  const starSuffix = pkg.starCount > 0
    ? chalk.dim(' (' + pkg.starCount + '★)')
    : '';
  // Separator and star suffix contain ANSI escapes; size the description
  // budget against the *visible* widths.
  const visibleFixed = name.length + 3 /* ' │ ' */ + (pkg.starCount > 0
    ? (' (' + pkg.starCount + '★)').length : 0);
  // checkbox-plus adds a ~4-char "[ ] " prefix on the left, leave headroom.
  const budget = Math.max(10, termWidth - visibleFixed - 8);
  const desc = truncate(description || '(no description)', budget);
  return name + separator + desc + starSuffix;
}

function filterPackages(packages) {
  if (!Array.isArray(packages)) return [];
  return packages.filter(function (p) {
    if (!p || !p.name) return false;
    const lv = p.latestVersion || {};
    return !lv.flagged && !lv.deprecated && !lv.unmigrated;
  });
}

function buildChoices(pkgs, termWidth) {
  return pkgs.map(function (pkg) {
    return {
      name: renderChoiceLabel(pkg, termWidth),
      value: pkg.name,
      short: pkg.name,
    };
  });
}

function placeholderChoice() {
  return [new inquirer.Separator('Type to search Atmosphere...')];
}

function noResultsChoice(input) {
  return [new inquirer.Separator('No results for "' + input + '".')];
}

function errorChoice(err) {
  return [new inquirer.Separator(
    'Search error: ' + (err && err.message ? err.message : err)
  )];
}

// Per-call timeline tracking. We keep a monotonically increasing generation
// id; the debounce timer only fires an RPC if it's still the latest gen at
// the moment the timer elapses. The plugin itself discards stale results
// via its own lastSourcePromise check, but we still want to avoid
// ServiceConnection's "can't wait on two things at once" race, so we
// serialize RPC starts through `rpcInFlight`.
function makeDebouncedSearcher(conn) {
  let generation = 0;
  let rpcInFlight = null;
  let activeTimer = null;

  async function runRpc(input) {
    if (rpcInFlight) {
      // ServiceConnection disallows concurrent apply()s, so serialize.
      try { await rpcInFlight; } catch (_e) { /* ignore */ }
    }
    const p = (async function () {
      const result = await conn.call('Search.query', input, 0, PAGE_SIZE);
      return filterPackages(result && result.packages);
    })();
    rpcInFlight = p;
    try {
      // `return await` (not `return`) so `finally` runs after p settles;
      // otherwise rpcInFlight clears too early and a concurrent call slips
      // through, tripping ServiceConnection's "one wait at a time" guard.
      return await p;
    } finally {
      if (rpcInFlight === p) rpcInFlight = null;
    }
  }

  return function search(rawInput) {
    const input = (rawInput || '').trim();
    const myGen = ++generation;

    if (input.length === 0) {
      if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
      return Promise.resolve(placeholderChoice());
    }

    return new Promise(function (resolve) {
      if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
      activeTimer = setTimeout(async function () {
        activeTimer = null;
        if (myGen !== generation) {
          resolve([]);
          return;
        }
        try {
          const pkgs = await runRpc(input);
          if (myGen !== generation) {
            resolve([]);
            return;
          }
          const choices = buildChoices(pkgs, Console.width());
          resolve(choices.length === 0 ? noResultsChoice(input) : choices);
        } catch (err) {
          if (myGen !== generation) {
            resolve([]);
            return;
          }
          resolve(errorChoice(err));
        }
      }, DEBOUNCE_MS);
    });
  };
}

async function runSearchPrompt(conn, initialQuery) {
  const search = makeDebouncedSearcher(conn);
  const prompt = createPromptModuleWithCheckboxPlus();
  const promptPromise = prompt([
    {
      type: 'checkbox-plus',
      name: 'picks',
      message: 'Search Atmosphere (type to filter, <space> to toggle, <enter> to install):',
      pageSize: Math.min(20, PAGE_SIZE),
      highlight: true,
      searchable: true,
      source: function (_answersSoFar, input) {
        return search(input);
      },
    },
  ]);

  // Pre-fill the readline input with --search query, if provided.
  // inquirer's prompt() returns a thenable with a .ui side-channel; the
  // active prompt's readline isn't attached synchronously, so defer.
  if (initialQuery && promptPromise && promptPromise.ui) {
    setImmediate(function () {
      const active = promptPromise.ui.activePrompt;
      if (active && active.rl && typeof active.rl.write === 'function') {
        active.rl.write(initialQuery);
      }
    });
  }

  const answers = await promptPromise;
  return Array.isArray(answers.picks) ? answers.picks : [];
}

// Returns Promise<string[]> of package names. Throws
// MeteorSearchAbortedError on Ctrl-C or EOF on stdin.
exports.runInteractivePackageSearch = async function (opts) {
  opts = opts || {};
  const url = config.getAtmosphereUrl();

  // The command-framework catalog refresh leaves a progress spinner
  // active when our handler starts; inquirer's redraw collides with it.
  Console.enableProgressDisplay(false);

  let conn;
  try {
    conn = await authClient.openServiceConnection(url);
  } catch (err) {
    throw new Error(
      'Could not connect to Atmosphere at ' + url + ': '
      + (err && err.message ? err.message : err)
    );
  }

  try {
    return await runSearchPrompt(conn, opts.initialQuery);
  } catch (err) {
    if (err && (err.isTtyError || err.name === 'ExitPromptError')) {
      throw new MeteorSearchAbortedError();
    }
    throw err;
  } finally {
    try { conn.close(); } catch (_e) { /* ignore */ }
    // Re-enable for the install phase that runs after we return, so the
    // constraint-solve/download/build steps show their usual progress.
    Console.enableProgressDisplay(true);
  }
};
