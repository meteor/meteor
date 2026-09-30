// Interactive picker for `meteor remove`. Lists packages currently in
// `.meteor/packages`, filters them by a live substring match as the user
// types, and returns the selected names for the existing remove pipeline
// to handle.
//
// Simpler than commands-packages-search.js: no DDP, no debounce, no
// pagination. The installed list is small and already in memory.

const inquirer = require('inquirer');
const checkboxPlus = require('inquirer-checkbox-plus-prompt');
const chalk = require('chalk');
const Console = require('../console/console.js').Console;
const {
  MeteorSearchAbortedError,
  attachDetailHotkey,
} = require('./commands-packages-search.js');

function createPromptModuleWithCheckboxPlus() {
  const prompt = inquirer.createPromptModule();
  prompt.registerPrompt('checkbox-plus', checkboxPlus);
  return prompt;
}

function renderChoiceLabel(name) {
  return chalk.green(name);
}

function buildAllChoices(installed) {
  return Array.from(installed).sort().map(function (name) {
    return {
      name: renderChoiceLabel(name),
      value: name,
      short: name,
    };
  });
}

function filter(choices, rawInput) {
  const input = (rawInput || '').trim().toLowerCase();
  if (!input) return choices;
  return choices.filter(function (c) {
    return c.value.toLowerCase().includes(input);
  });
}

async function runRemovePrompt(installed, initialQuery) {
  const allChoices = buildAllChoices(installed);
  const prompt = createPromptModuleWithCheckboxPlus();
  const promptPromise = prompt([
    {
      type: 'checkbox-plus',
      name: 'picks',
      message:
        'Select packages to remove (type to filter, <space> to toggle, ? for details, <enter> to confirm):',
      pageSize: 20,
      highlight: true,
      searchable: true,
      source: function (_answersSoFar, input) {
        const matches = filter(allChoices, input);
        if (matches.length === 0) {
          const trimmed = (input || '').trim();
          return Promise.resolve([
            new inquirer.Separator(
              trimmed
                ? 'No installed packages match "' + trimmed + '".'
                : 'No packages installed.'
            ),
          ]);
        }
        return Promise.resolve(matches);
      },
    },
  ]);

  if (promptPromise && promptPromise.ui) {
    setImmediate(function () {
      const active = promptPromise.ui.activePrompt;
      if (!active) return;
      if (initialQuery && active.rl && typeof active.rl.write === 'function') {
        active.rl.write(initialQuery);
      }
      attachDetailHotkey(active, function () {
        const choice = active.choices && active.choices.getChoice(active.pointer);
        return choice && choice.value;
      });
    });
  }

  const answers = await promptPromise;
  return Array.isArray(answers.picks) ? answers.picks : [];
}

// Returns Promise<string[]> of package names selected for removal. Throws
// MeteorSearchAbortedError on Ctrl-C or EOF on stdin.
exports.runInteractiveRemoveSelection = async function (opts) {
  opts = opts || {};
  const installed = opts.installed || new Set();

  Console.enableProgressDisplay(false);
  try {
    return await runRemovePrompt(installed, opts.initialQuery);
  } catch (err) {
    if (err && (err.isTtyError || err.name === 'ExitPromptError')) {
      throw new MeteorSearchAbortedError();
    }
    throw err;
  } finally {
    Console.enableProgressDisplay(true);
  }
};
