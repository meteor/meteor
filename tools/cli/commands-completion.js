const main = require("./main.js");
const { Console } = require("../console/console.js");
const files = require("../fs/files");
const catalog = require("../packaging/catalog/catalog.js");
const { ProjectContext } = require("../project-context.js");

const GLOBAL_OPTION_SUGGESTIONS = ["--release", "--help", "-h"];
const MOBILE_PLATFORMS = ["ios", "android"];
const COMPLETION_FILENAME = "meteor-completion.sh";
const COMPLETION_MARKER = "# Meteor autocompletion";
const TOP_LEVEL_COMMANDS_PLACEHOLDER = "__METEOR_TOP_LEVEL_COMMANDS__";
const COMPLETION_SOURCE_LINE =
  '[ -f "$HOME/.meteor/meteor-completion.sh" ] && source "$HOME/.meteor/meteor-completion.sh"';

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function isCommandNode(node) {
  return Boolean(node && typeof node.func === "function");
}

function mergeUnique(...lists) {
  return [...new Set(lists.flat())];
}

function excludeItems(items, itemsToExclude) {
  const excludedItems = new Set(itemsToExclude);
  return items.filter((item) => !excludedItems.has(item));
}

function intersectItems(items, allowedItems) {
  const allowedItemsSet = new Set(allowedItems);
  return items.filter((item) => allowedItemsSet.has(item));
}

function readMeteorProjectFile(appDir, fileName) {
  if (!appDir) {
    return null;
  }

  const filePath = files.pathJoin(appDir, ".meteor", fileName);
  if (!files.exists(filePath)) {
    return null;
  }

  return files.readFile(filePath, "utf8");
}

function getInstalledPackages(appDir) {
  const content = readMeteorProjectFile(appDir, "packages");
  if (content === null) {
    return [];
  }

  return content
    .split("\n")
    .map((line) => line.split("#")[0].trim())
    .filter(Boolean)
    .map((line) => line.split("@")[0].trim())
    .filter(Boolean);
}

function getInstalledPlatforms(appDir) {
  const content = readMeteorProjectFile(appDir, "platforms");
  if (content === null) {
    return [];
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function printCompletions(suggestions, currentWord) {
  const visibleSuggestions = [...new Set(suggestions)]
    .sort()
    .filter((suggestion) => !currentWord || suggestion.startsWith(currentWord));

  for (const suggestion of visibleSuggestions) {
    Console.rawInfo(`${suggestion}\n`);
  }
}

function detectShell() {
  const shellEnv = process.env.SHELL || "";
  return shellEnv.includes("zsh") ? "zsh" : "bash";
}

function quoteShellWord(word) {
  return `'${String(word).replace(/'/g, `'\\''`)}'`;
}

function getTopLevelCommandsLiteral() {
  return main.getTopLevelCommandNames().map(quoteShellWord).join(" ");
}

function getScriptContent(shellType) {
  const filename = shellType === "zsh" ? "completion.zsh" : "completion.bash";
  const scriptPath = files.pathJoin(
    files.convertToStandardPath(__dirname),
    filename
  );

  return files
    .readFile(scriptPath, "utf8")
    .replace(TOP_LEVEL_COMMANDS_PLACEHOLDER, getTopLevelCommandsLiteral());
}

function getRcPaths(shellType, home) {
  if (shellType === "zsh") {
    return [files.pathJoin(home, ".zshrc")];
  }

  if (process.platform === "darwin") {
    const rcPaths = [files.pathJoin(home, ".bash_profile")];
    const bashrc = files.pathJoin(home, ".bashrc");
    if (files.exists(bashrc)) {
      rcPaths.push(bashrc);
    }

    return rcPaths;
  }

  return [files.pathJoin(home, ".bashrc")];
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripCompletionBlock(content) {
  const completionBlockPattern = new RegExp(
    `\\n?${escapeRegExp(COMPLETION_MARKER)}\\n${escapeRegExp(
      COMPLETION_SOURCE_LINE
    )}\\n?`,
    "g"
  );

  let updatedContent = content.replace(completionBlockPattern, "\n");
  updatedContent = updatedContent.replace(/\n{3,}/g, "\n\n");

  if (!updatedContent.endsWith("\n") && content.endsWith("\n")) {
    updatedContent += "\n";
  }

  return updatedContent;
}

function ensureCompletionConfigured(rcPath) {
  const completionSnippet = `\n${COMPLETION_MARKER}\n${COMPLETION_SOURCE_LINE}\n`;

  if (files.exists(rcPath)) {
    const content = files.readFile(rcPath, "utf8");
    if (content.includes(COMPLETION_FILENAME)) {
      Console.info(`Already configured in ${rcPath}`);
      return;
    }

    files.writeFile(rcPath, content + completionSnippet, "utf8");
  } else {
    files.writeFile(rcPath, completionSnippet, "utf8");
  }

  Console.info(`Configured completion in ${rcPath}`);
}

function removeCompletionConfiguration(rcPath) {
  if (!files.exists(rcPath)) {
    return;
  }

  const content = files.readFile(rcPath, "utf8");
  if (!content.includes(COMPLETION_FILENAME)) {
    return;
  }

  files.writeFile(rcPath, stripCompletionBlock(content), "utf8");
  Console.info(`Removed configuration from ${rcPath}`);
}

function installCompletion(shellType) {
  const home = files.getHomeDir();
  const meteorDir = files.pathJoin(home, ".meteor");
  if (!files.exists(meteorDir)) {
    files.mkdir_p(meteorDir);
  }

  const autocompletePath = files.pathJoin(meteorDir, COMPLETION_FILENAME);
  files.writeFile(autocompletePath, getScriptContent(shellType), "utf8");

  for (const rcPath of getRcPaths(shellType, home)) {
    ensureCompletionConfigured(rcPath);
  }

  Console.info("\nSuccessfully installed Meteor autocomplete!");
  Console.info(
    "Please run the following command to activate it in your current terminal session:"
  );
  Console.info(Console.command(`source ${autocompletePath}`));
  Console.info(
    "Re-run this command after updating your Meteor checkout to refresh the embedded top-level command list."
  );
}

function uninstallCompletion() {
  const home = files.getHomeDir();
  const autocompletePath = files.pathJoin(home, ".meteor", COMPLETION_FILENAME);

  if (files.exists(autocompletePath)) {
    files.unlink(autocompletePath);
    Console.info(`Removed ${autocompletePath}`);
  }

  const rcPaths = [
    files.pathJoin(home, ".zshrc"),
    files.pathJoin(home, ".bashrc"),
    files.pathJoin(home, ".bash_profile"),
  ];

  for (const rcPath of rcPaths) {
    removeCompletionConfiguration(rcPath);
  }

  Console.info("Successfully uninstalled completion.");
}

function getOptionConfig(command, word) {
  if (!command || !command.options || typeof word !== "string") {
    return null;
  }

  const optionName = word.replace(/^--?/, "");
  if (hasOwn(command.options, optionName)) {
    return command.options[optionName];
  }

  return (
    Object.values(command.options).find(
      (option) => option.short === optionName
    ) || null
  );
}

function optionTakesValue(command, word) {
  const optionConfig = getOptionConfig(command, word);
  return Boolean(optionConfig && optionConfig.type !== Boolean);
}

function getOptionCommand(node, word) {
  if (!word.startsWith("--")) {
    return null;
  }

  const optionCommands = node && node["--"];
  const optionCommandName = word.slice(2);
  if (!optionCommands || !hasOwn(optionCommands, optionCommandName)) {
    return null;
  }

  return optionCommands[optionCommandName];
}

function isCompletingOptionValue(words, index, command) {
  const previousWord = words[index - 1];
  if (!previousWord || !previousWord.startsWith("-") || !command) {
    return false;
  }

  return optionTakesValue(command, previousWord);
}

function walkCommandTree(words, index) {
  let node = main.commands;
  let matchedCommand = null;

  for (let position = 1; position < index; position += 1) {
    const word = words[position];

    if (word === "--release") {
      position += 1;
      continue;
    }

    if (word.startsWith("-")) {
      const optionCommand = getOptionCommand(node, word);
      if (optionCommand) {
        node = optionCommand;
        if (isCommandNode(node)) {
          matchedCommand = node;
        }

        break;
      }

      if (optionTakesValue(matchedCommand, word)) {
        position += 1;
      }

      continue;
    }

    if (!hasOwn(node, word)) {
      break;
    }

    node = node[word];
    if (isCommandNode(node)) {
      matchedCommand = node;
    }
  }

  return { node, matchedCommand };
}

function getCommandSuggestions(node, prefix = "") {
  if (!node) {
    return [];
  }

  let suggestions = [];

  for (const [key, value] of Object.entries(node)) {
    if (key === "--" || !value) {
      continue;
    }

    const fullName = prefix ? `${prefix} ${key}` : key;
    if (isCommandNode(value)) {
      if (!value.hidden) {
        suggestions.push(fullName);
      }

      continue;
    }

    suggestions.push(fullName);
    suggestions = suggestions.concat(getCommandSuggestions(value, fullName));
  }

  return suggestions;
}

async function getOfficialPackageNames() {
  try {
    return await catalog.official.getAllPackageNames();
  } catch {
    return [];
  }
}

async function getLocalPackageNames(appDir) {
  try {
    const projectContext = new ProjectContext({ projectDir: appDir });
    await projectContext.initializeCatalog();
    return projectContext.localCatalog.getAllPackageNames();
  } catch {
    return [];
  }
}

async function getAddPackageSuggestions(appDir) {
  let packageNames = await getOfficialPackageNames();

  if (!appDir) {
    return packageNames;
  }

  packageNames = mergeUnique(packageNames, await getLocalPackageNames(appDir));
  return excludeItems(packageNames, getInstalledPackages(appDir));
}

function getAddPlatformSuggestions(appDir) {
  if (!appDir) {
    return [...MOBILE_PLATFORMS];
  }

  return excludeItems(MOBILE_PLATFORMS, getInstalledPlatforms(appDir));
}

function getRemovePlatformSuggestions(appDir) {
  return intersectItems(getInstalledPlatforms(appDir), MOBILE_PLATFORMS);
}

async function getArgumentSuggestions(commandName, options) {
  switch (commandName) {
    case "add":
      return getAddPackageSuggestions(options.appDir);
    case "remove":
      return options.appDir ? getInstalledPackages(options.appDir) : [];
    case "add-platform":
      return getAddPlatformSuggestions(options.appDir);
    case "remove-platform":
      return options.appDir ? getRemovePlatformSuggestions(options.appDir) : [];
    case "help":
      return getCommandSuggestions(main.commands);
    default:
      return [];
  }
}

function getCommandOptionSuggestions(command) {
  const suggestions = [];

  for (const [optionName, optionConfig] of Object.entries(
    command.options || {}
  )) {
    suggestions.push(`--${optionName}`);
    if (optionConfig.short) {
      suggestions.push(`-${optionConfig.short}`);
    }
  }

  return suggestions.concat(GLOBAL_OPTION_SUGGESTIONS);
}

function getGlobalSuggestions(node) {
  const suggestions = [...GLOBAL_OPTION_SUGGESTIONS];
  const optionCommands = node && node["--"];

  if (!optionCommands) {
    return suggestions;
  }

  for (const [optionName, optionCommand] of Object.entries(optionCommands)) {
    if (!optionCommand.hidden) {
      suggestions.push(`--${optionName}`);
    }
  }

  return suggestions;
}

function getSubcommandSuggestions(node) {
  if (!node) {
    return [];
  }

  const suggestions = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "--" || !value) {
      continue;
    }

    if (isCommandNode(value)) {
      if (!value.hidden) {
        suggestions.push(key);
      }

      continue;
    }

    suggestions.push(key);
  }

  return suggestions;
}

async function getSuggestions(commandContext, currentWord, options) {
  if (commandContext.matchedCommand) {
    if (currentWord.startsWith("-")) {
      return getCommandOptionSuggestions(commandContext.matchedCommand);
    }

    return getArgumentSuggestions(commandContext.matchedCommand.name, options);
  }

  if (currentWord.startsWith("-")) {
    return getGlobalSuggestions(commandContext.node);
  }

  if (commandContext.node === main.commands) {
    return main.getTopLevelCommandNames();
  }

  return getSubcommandSuggestions(commandContext.node);
}

function printUsage() {
  Console.info("Meteor Shell Completion Tool");
  Console.info("Usage:");
  Console.info("  meteor shell-completion --install [--shell bash|zsh]");
  Console.info("  meteor shell-completion --uninstall");
  Console.info("  meteor shell-completion --script [--shell bash|zsh]");
}

async function handleCompletionQuery(options) {
  const words = options.args ?? [];
  const index = options.index;
  const currentWord = words[index] ?? "";
  const commandContext = walkCommandTree(words, index);

  if (isCompletingOptionValue(words, index, commandContext.matchedCommand)) {
    return 0;
  }

  const suggestions = await getSuggestions(
    commandContext,
    currentWord,
    options
  );
  printCompletions(suggestions, currentWord);
  return 0;
}

function shellCompletionCommand(options) {
  if (options.uninstall) {
    uninstallCompletion();
    return 0;
  }

  const shellType = options.shell || detectShell();

  if (options.install) {
    installCompletion(shellType);
    return 0;
  }

  if (options.script) {
    Console.rawInfo(getScriptContent(shellType));
    return 0;
  }

  if (options.index === undefined) {
    printUsage();
    return 0;
  }

  return handleCompletionQuery(options);
}

main.registerCommand(
  {
    name: "shell-completion",
    options: {
      index: { type: Number },
      install: { type: Boolean },
      uninstall: { type: Boolean },
      script: { type: Boolean },
      shell: { type: String },
    },
    minArgs: 0,
    maxArgs: Infinity,
    catalogRefresh: new catalog.Refresh.Never(),
    requiresRelease: false,
    hidden: true,
  },
  shellCompletionCommand
);
