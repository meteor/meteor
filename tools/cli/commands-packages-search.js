const inquirer = require('inquirer');
const checkboxPlus = require('inquirer-checkbox-plus-prompt');
const chalk = require('chalk');
const authClient = require('../meteor-services/auth-client.js');
const config = require('../meteor-services/config.js');
const Console = require('../console/console.js').Console;
const files = require('../fs/files');
const catalog = require('../packaging/catalog/catalog.js');
const httpHelpers = require('../utils/http-helpers.js');

const README_PREVIEW_LINES = 18;
// Hash-keyed so multiple versions of the same package don't collide.
const readmeCache = new Map();

// Read .meteor/packages before ProjectContext is initialized; that happens
// after the picker returns.
exports.readInstalledPackageNames = function (projectDir) {
  const installed = new Set();
  if (!projectDir) return installed;
  const path = files.pathJoin(projectDir, '.meteor', 'packages');
  let raw;
  try {
    raw = files.readFile(path, 'utf8');
  } catch (_e) {
    return installed;
  }
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const name = line.split(/[@\s]/)[0];
    if (name) installed.add(name);
  }
  return installed;
};

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 250;
const DEBUG = !!process.env.METEOR_ATMOSPHERE_DEBUG;

const STALE_THRESHOLD_MONTHS = 24;
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

const CORE_RECOMMENDED = [
  'accounts-password',
  'accounts-google',
  'accounts-2fa',
  'accounts-passwordless',
  'email',
  'check',
  'typescript',
  'rspack',
  'roles',
  'react-meteor-data',
];
const MOST_USED_FETCH_SIZE = 50;
const MAX_COMMUNITY_TOP = 10;

function debugLog(msg) {
  if (!DEBUG) return;
  try {
    process.stderr.write(
      '[atmosphere-search ' + (Date.now() % 100000) + '] ' + msg + '\n'
    );
  } catch (_e) {}
}

function createPromptModuleWithCheckboxPlus() {
  // inquirer.registerPrompt mutates the shared default module, not ours;
  // register on the fresh module so `type: 'checkbox-plus'` resolves.
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

function formatAge(isoDate) {
  if (!isoDate) return null;
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return null;
  const months = Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24 * 30.4375)));
  if (months <= 0) return 'today';
  if (months < 24) return months + 'mo ago';
  return Math.floor(months / 12) + 'y ago';
}

// Packages missing from the local mirror are left without age data and
// ranked as fresh in reorderByFreshness, so a brand-new publish that
// hasn't synced yet isn't penalized.
async function hydrateFreshness(pkgs) {
  if (!Array.isArray(pkgs) || pkgs.length === 0) return pkgs;
  await Promise.all(pkgs.map(async function (pkg) {
    try {
      const v = await catalog.official.getLatestVersion(pkg.name);
      const iso = v && (v.lastUpdated || v.published);
      if (!iso) return;
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) return;
      pkg._ageMonths = (Date.now() - t) / MS_PER_MONTH;
      pkg._ageLabel = formatAge(iso);
    } catch (_e) {}
  }));
  return pkgs;
}

// Two-tier sort: stale packages drop below fresh ones; the index tiebreak
// makes it stable so Atmosphere's relevance order is preserved within each
// tier. Packages without _ageMonths count as fresh.
function reorderByFreshness(pkgs) {
  if (!Array.isArray(pkgs)) return pkgs;
  const withIndex = pkgs.map(function (pkg, i) { return { pkg, i }; });
  withIndex.sort(function (a, b) {
    const aStale = typeof a.pkg._ageMonths === 'number' && a.pkg._ageMonths > STALE_THRESHOLD_MONTHS;
    const bStale = typeof b.pkg._ageMonths === 'number' && b.pkg._ageMonths > STALE_THRESHOLD_MONTHS;
    if (aStale !== bStale) return aStale ? 1 : -1;
    return a.i - b.i;
  });
  return withIndex.map(function (x) { return x.pkg; });
}

function renderChoiceLabel(pkg, termWidth, installed) {
  const description = (pkg.latestVersion && pkg.latestVersion.description) || '';
  const isInstalled = installed && installed.has(pkg.name);
  const NAME_COL = 34;
  const fittedName = pkg.name.length > NAME_COL
    ? pkg.name.slice(0, NAME_COL - 3) + '...'
    : pad(pkg.name, NAME_COL);
  const displayName = isInstalled ? chalk.green(fittedName) : fittedName;
  const separator = chalk.dim(' │ ');
  const installedTag = isInstalled ? chalk.green(' [installed]') : '';
  const ageSuffix = pkg._ageLabel
    ? chalk.dim(' (' + pkg._ageLabel + ')')
    : '';
  const starSuffix = pkg.starCount > 0
    ? chalk.dim(' (' + pkg.starCount + '★)')
    : '';
  // Suffixes contain ANSI escapes, so budget against visible widths only.
  // The trailing -8 reserves space for checkbox-plus's "[ ] " prefix.
  const visibleFixed = NAME_COL
    + 3
    + (isInstalled ? ' [installed]'.length : 0)
    + (pkg._ageLabel ? (' (' + pkg._ageLabel + ')').length : 0)
    + (pkg.starCount > 0 ? (' (' + pkg.starCount + '★)').length : 0);
  const budget = Math.max(10, termWidth - visibleFixed - 8);
  const desc = truncate(description || '(no description)', budget);
  return displayName + separator + desc + installedTag + ageSuffix + starSuffix;
}

function filterPackages(packages) {
  if (!Array.isArray(packages)) return [];
  return packages.filter(function (p) {
    if (!p || !p.name) return false;
    const lv = p.latestVersion || {};
    return !lv.flagged && !lv.deprecated && !lv.unmigrated;
  });
}

function buildChoices(pkgs, termWidth, installed) {
  return pkgs.map(function (pkg) {
    return {
      name: renderChoiceLabel(pkg, termWidth, installed),
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

// Hydrate one CORE_RECOMMENDED name from the local catalog. Returns null
// for missing, deprecated, or unmigrated rows.
async function hydrateCoreName(name, index) {
  try {
    const v = await catalog.official.getLatestVersion(name);
    if (!v || v.deprecated || v.unmigrated) return null;
    const iso = v.lastUpdated || v.published;
    const ageMonths = iso ? (Date.now() - Date.parse(iso)) / MS_PER_MONTH : null;
    return {
      name,
      latestVersion: {
        description: v.description || '',
        flagged: false,
        deprecated: false,
        unmigrated: false,
      },
      _ageMonths: ageMonths,
      _ageLabel: formatAge(iso),
      _coreIndex: index,
    };
  } catch (_e) {
    return null;
  }
}

// DDP unmarshals EJSON dates into JS Date objects; older clients leave them
// as {$date: <ms>}; pass plain numbers/strings through too just in case.
function parsePublished(raw) {
  if (!raw) return null;
  let d;
  if (raw instanceof Date) d = raw;
  else if (typeof raw === 'number') d = new Date(raw);
  else if (raw.$date != null) d = new Date(raw.$date);
  else d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// Build a renderable record from one packages/mostUsed doc.
function mostUsedToPkg(doc) {
  const baseName = doc.baseName;
  if (!baseName) return null;
  const name = doc.authorName ? doc.authorName + ':' + baseName : baseName;
  const lv = doc.latestVersion || {};
  if (lv.deprecated) return null;
  const iso = parsePublished(lv.published);
  const ageMonths = iso ? (Date.now() - Date.parse(iso)) / MS_PER_MONTH : null;
  return {
    name,
    latestVersion: {
      description: lv.description || '',
      flagged: false,
      deprecated: false,
      unmigrated: false,
    },
    _ageMonths: ageMonths,
    _ageLabel: formatAge(iso),
    _installsPerMonth: doc['installs-per-month'] || 0,
  };
}

async function buildTrendingChoices(termWidth, installed, mostUsed) {
  const coreResults = await Promise.all(CORE_RECOMMENDED.map(hydrateCoreName));
  const core = coreResults.filter(Boolean);
  core.sort(function (a, b) { return a._coreIndex - b._coreIndex; });
  const coreNames = new Set(core.map(function (p) { return p.name; }));

  const dynamic = [];
  const seen = new Set(coreNames);
  const ranked = (mostUsed || []).slice().sort(function (a, b) {
    return (b['installs-per-month'] || 0) - (a['installs-per-month'] || 0);
  });
  for (const doc of ranked) {
    if (dynamic.length >= MAX_COMMUNITY_TOP) break;
    // Skip core (no namespace prefix) so this section is community-only.
    if (!doc.authorName) continue;
    const pkg = mostUsedToPkg(doc);
    if (!pkg || seen.has(pkg.name)) continue;
    // Drop unmaintained packages: keep only those updated within the
    // freshness window. Unknown age counts as stale here (we have a
    // published date on every mostUsed doc, so this is the rare bad data).
    if (typeof pkg._ageMonths !== 'number' || pkg._ageMonths > STALE_THRESHOLD_MONTHS) continue;
    seen.add(pkg.name);
    dynamic.push(pkg);
  }

  if (core.length === 0 && dynamic.length === 0) return null;

  // inquirer.Separator wraps its `line` in chalk.dim() at construction, so
  // assigning .line after the fact bypasses that and lets the cyan show.
  const searchHint = new inquirer.Separator();
  searchHint.line = chalk.cyan.bold('Type to search Atmosphere...');
  const choices = [searchHint];
  if (core.length > 0) {
    choices.push(new inquirer.Separator(chalk.dim('Core recommended')));
    for (const c of buildChoices(core, termWidth, installed)) choices.push(c);
  }
  if (dynamic.length > 0) {
    choices.push(new inquirer.Separator(chalk.dim('Top community-maintained packages')));
    for (const c of buildChoices(dynamic, termWidth, installed)) choices.push(c);
  }
  return choices;
}

// `generation` lets the debounce timer drop callbacks whose query has been
// superseded. `rpcInFlight` serializes RPCs because ServiceConnection
// rejects concurrent apply()s.
function makeDebouncedSearcher(conn, installed, mostUsed) {
  let generation = 0;
  let rpcInFlight = null;
  let activeTimer = null;
  let trendingCache = null;
  let trendingPromise = null;

  function getTrending() {
    if (trendingCache) return Promise.resolve(trendingCache);
    if (trendingPromise) return trendingPromise;
    trendingPromise = buildTrendingChoices(Console.width(), installed, mostUsed)
      .then(function (choices) {
        trendingCache = choices || placeholderChoice();
        trendingPromise = null;
        return trendingCache;
      })
      .catch(function () {
        trendingPromise = null;
        return placeholderChoice();
      });
    return trendingPromise;
  }

  async function runRpc(input) {
    if (rpcInFlight) {
      try { await rpcInFlight; } catch (_e) {}
    }
    const rpcStart = Date.now();
    debugLog('rpc start query=' + JSON.stringify(input));
    const p = (async function () {
      const result = await conn.call('Search.query', input, 0, PAGE_SIZE);
      const filtered = filterPackages(result && result.packages);
      await hydrateFreshness(filtered);
      return reorderByFreshness(filtered);
    })().then(function (pkgs) {
      debugLog('rpc ok query=' + JSON.stringify(input)
        + ' results=' + pkgs.length
        + ' took=' + (Date.now() - rpcStart) + 'ms');
      return pkgs;
    }, function (err) {
      debugLog('rpc err query=' + JSON.stringify(input)
        + ' after=' + (Date.now() - rpcStart) + 'ms'
        + ' err=' + (err && err.message ? err.message : err));
      throw err;
    });
    rpcInFlight = p;
    try {
      // `return await` so finally fires after p settles, otherwise a
      // concurrent call slips through ServiceConnection's one-wait guard.
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
      return getTrending();
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
          const choices = buildChoices(pkgs, Console.width(), installed);
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

// Subscribe to packages/mostUsed, snapshot the docs after `ready`, then
// stop. Snapshot must happen *before* stop: stopping triggers `removed`
// messages that drain the store.
async function fetchMostUsed(conn) {
  const docs = new Map();
  await conn.connection.registerStoreServer('packages', {
    update: function (msg) {
      if (msg.msg === 'added') {
        docs.set(msg.id, Object.assign({ _id: msg.id }, msg.fields));
      } else if (msg.msg === 'changed') {
        const existing = docs.get(msg.id);
        if (existing) Object.assign(existing, msg.fields);
      } else if (msg.msg === 'removed') {
        docs.delete(msg.id);
      }
    },
  });
  const sub = await conn.subscribeAndWait('packages/mostUsed', 'month', MOST_USED_FETCH_SIZE);
  const snapshot = [...docs.values()];
  try { sub.stop(); } catch (_e) {}
  return snapshot;
}

// The catalog only stores {hash, url}, not the README body; fetch and cache
// by hash so revisits in the same session are free. Returns a short
// preview (raw markdown trimmed) or null on any failure.
async function fetchReadmePreview(versionRecord) {
  const r = versionRecord && versionRecord.readme;
  if (!r || !r.url) return null;
  const key = r.hash || r.url;
  if (readmeCache.has(key)) return readmeCache.get(key);
  let body;
  try {
    body = await httpHelpers.getUrl(r.url);
  } catch (_e) {
    readmeCache.set(key, null);
    return null;
  }
  const preview = formatReadmePreview(body);
  readmeCache.set(key, preview);
  return preview;
}

// Atmosphere routes /<author>/<basename> for community packages and
// /meteor/<name> for the core namespace, mirroring how `meteor add` names
// them. Used to give the README preview a "Read more" link to the rendered
// page.
function atmosphereUrlForPackage(name) {
  if (!name) return null;
  const baseUrl = (config.getAtmosphereUrl() || 'https://atmospherejs.com')
    .replace(/\/+$/, '');
  const idx = name.indexOf(':');
  if (idx > 0) {
    return baseUrl + '/' + name.slice(0, idx) + '/' + name.slice(idx + 1);
  }
  return baseUrl + '/meteor/' + name;
}

function formatReadmePreview(body) {
  if (!body || typeof body !== 'string') return null;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  // Skip leading H1 (almost always the package name) and any blank lines
  // right after it.
  let i = 0;
  while (i < lines.length && /^\s*$/.test(lines[i])) i++;
  if (i < lines.length && /^#\s/.test(lines[i])) {
    i++;
    while (i < lines.length && /^\s*$/.test(lines[i])) i++;
  }
  const kept = [];
  const maxWidth = Math.max(40, Console.width() - 2);
  for (; i < lines.length && kept.length < README_PREVIEW_LINES; i++) {
    kept.push(truncate(lines[i], maxWidth));
  }
  while (kept.length && /^\s*$/.test(kept[kept.length - 1])) kept.pop();
  if (kept.length === 0) return null;
  if (i < lines.length) kept.push(chalk.dim('...'));
  return kept.join('\n');
}

async function loadPackageDetail(name) {
  let pkgRecord;
  let versionRecord;
  try {
    pkgRecord = await catalog.official.getPackage(name);
    versionRecord = await catalog.official.getLatestVersion(name);
  } catch (_e) {
    return null;
  }
  if (!versionRecord && !pkgRecord) return null;

  const readmePreview = versionRecord ? await fetchReadmePreview(versionRecord) : null;

  const lines = [];
  lines.push(chalk.dim('─── ') + chalk.bold(name) + chalk.dim(' ──────────'));
  if (versionRecord && versionRecord.version) {
    let versionLine = chalk.dim('version: ') + versionRecord.version;
    const iso = versionRecord.lastUpdated || versionRecord.published;
    const age = formatAge(iso);
    if (age) versionLine += chalk.dim('  (' + age + ')');
    if (versionRecord.deprecated) versionLine += '  ' + chalk.red('[deprecated]');
    lines.push(versionLine);
  }
  if (versionRecord && versionRecord.description) {
    lines.push(versionRecord.description);
  }
  if (versionRecord && versionRecord.git) {
    lines.push(chalk.dim('git:     ') + versionRecord.git);
  }
  if (pkgRecord && Array.isArray(pkgRecord.maintainers) && pkgRecord.maintainers.length) {
    const names = pkgRecord.maintainers.map(function (m) { return m.username; }).join(', ');
    lines.push(chalk.dim('authors: ') + names);
  }
  if (readmePreview) {
    lines.push(chalk.dim('─ README ─'));
    lines.push(readmePreview);
    const url = atmosphereUrlForPackage(name);
    if (url) lines.push(chalk.dim('Read more: ') + url);
  }
  lines.push(chalk.dim('(press any key to dismiss)'));
  return lines.join('\n');
}
exports.loadPackageDetail = loadPackageDetail;

// Patch checkbox-plus's onKeypress rather than listening on rl.input. A
// prepended listener on rl.input would fire BEFORE readline appends the
// character to rl.line, leaving nothing to strip. Inside onKeypress
// rl.line already ends with `?`, so we can rewrite it before render/source
// reads it. Guarded on the prototype to stay idempotent.
// The patch must install before checkbox-plus's _run subscribes to keypress
// events. _run captures `onKeypress` via .bind(self) at subscribe time, so
// any later replacement of the prototype method has no effect on already-
// bound listeners. Subscribe time is "after `source()` resolves"; for the
// add picker source is async (Atmosphere RPC + catalog reads) so a
// setImmediate-attached patch wins, but the remove picker's source is
// synchronous (Promise.resolve(matches)), so its microtask drains the
// .then-of-executeSource and binds before our setImmediate ever fires.
// Installing at module load sidesteps the race.
(function patchCheckboxPlusForDetailHook() {
  if (checkboxPlus.prototype._meteorDetailPatchInstalled) return;
  checkboxPlus.prototype._meteorDetailPatchInstalled = true;

  const origOnKeypress = checkboxPlus.prototype.onKeypress;
  checkboxPlus.prototype.onKeypress = function () {
    const hook = this._meteorDetailHook;
    if (!hook) {
      return origOnKeypress.call(this);
    }

    if (this.rl.line.endsWith('?')) {
      this.rl.line = this.rl.line.slice(0, -1);
      this.rl.cursor = this.rl.line.length;
      hook.onQuestion(this);
      // With `searchable: true`, checkbox-plus subscribes to keypress
      // twice and fires onKeypress twice per physical key. The companion
      // call must not be treated as "some other key", or it would
      // invalidate the in-flight detail load.
      this._meteorPendingQuestionAck = true;
      this.render();
      return;
    }
    if (this._meteorPendingQuestionAck) {
      this._meteorPendingQuestionAck = false;
      return origOnKeypress.call(this);
    }
    hook.onOtherKey(this);
    return origOnKeypress.call(this);
  };
})();

exports.attachDetailHotkey = function (activePrompt, getValueAtPointer) {
  if (!activePrompt || !activePrompt.rl || !activePrompt.screen) return;

  let detailContent = null;
  let loadToken = 0;

  const origScreenRender = activePrompt.screen.render.bind(activePrompt.screen);
  activePrompt.screen.render = function (message, bottomContent) {
    if (detailContent) {
      bottomContent = (bottomContent ? bottomContent + '\n' : '') + detailContent;
    }
    return origScreenRender(message, bottomContent);
  };

  activePrompt._meteorDetailHook = {
    onQuestion: function (prompt) {
      const name = getValueAtPointer && getValueAtPointer();
      if (!name) return;
      const myToken = ++loadToken;
      detailContent = chalk.dim('Loading details for ' + name + '...');
      Promise.resolve(loadPackageDetail(name)).then(function (text) {
        if (myToken !== loadToken) return;
        detailContent = text || chalk.dim('No details available for ' + name + '.');
        prompt.render();
      }, function () {
        if (myToken !== loadToken) return;
        detailContent = chalk.dim('Could not load details for ' + name + '.');
        prompt.render();
      });
    },
    onOtherKey: function () {
      if (detailContent) {
        detailContent = null;
        loadToken++;
      }
    },
  };
};

async function runSearchPrompt(conn, initialQuery, installed, mostUsed) {
  const search = makeDebouncedSearcher(conn, installed, mostUsed);
  const prompt = createPromptModuleWithCheckboxPlus();
  const promptPromise = prompt([
    {
      type: 'checkbox-plus',
      name: 'picks',
      message: 'Search Atmosphere (type to search, <space> to toggle, ? for details, <enter> to install):',
      // Use most of the terminal height; reserve ~8 rows for the prompt
      // header, search line, bottom hints, and the optional detail panel.
      pageSize: Math.max(15, (process.stdout.rows || 30) - 8),
      highlight: true,
      searchable: true,
      source: function (_answersSoFar, input) {
        return search(input);
      },
    },
  ]);

  // activePrompt is wired asynchronously, so defer the pre-fill + hotkey
  // attach to the next tick.
  if (promptPromise && promptPromise.ui) {
    setImmediate(function () {
      const active = promptPromise.ui.activePrompt;
      if (!active) return;
      if (initialQuery && active.rl && typeof active.rl.write === 'function') {
        active.rl.write(initialQuery);
      }
      exports.attachDetailHotkey(active, function () {
        const choice = active.choices && active.choices.getChoice(active.pointer);
        return choice && choice.value;
      });
    });
  }

  const answers = await promptPromise;
  return Array.isArray(answers.picks) ? answers.picks : [];
}

// Throws MeteorSearchAbortedError on Ctrl-C / EOF.
exports.runInteractivePackageSearch = async function (opts) {
  opts = opts || {};
  const url = config.getAtmosphereUrl();

  // The catalog-refresh spinner collides with inquirer's redraw.
  Console.enableProgressDisplay(false);

  Console.info('Connecting to Atmosphere...');
  debugLog('connect start url=' + url);
  const connectStart = Date.now();

  let conn;
  try {
    try {
      conn = await authClient.openServiceConnection(url);
    } catch (err) {
      debugLog('connect failed after ' + (Date.now() - connectStart) + 'ms');
      throw new Error(
        'Could not connect to Atmosphere at ' + url + ': '
        + (err && err.message ? err.message : err)
      );
    }
    debugLog('connected in ' + (Date.now() - connectStart) + 'ms');

    let mostUsed = [];
    try {
      const t0 = Date.now();
      mostUsed = await fetchMostUsed(conn);
      debugLog('mostUsed ready count=' + mostUsed.length + ' took=' + (Date.now() - t0) + 'ms');
    } catch (err) {
      debugLog('mostUsed err=' + (err && err.message ? err.message : err));
    }

    try {
      return await runSearchPrompt(conn, opts.initialQuery, opts.installed, mostUsed);
    } catch (err) {
      if (err && (err.isTtyError || err.name === 'ExitPromptError')) {
        throw new MeteorSearchAbortedError();
      }
      throw err;
    }
  } finally {
    if (conn) {
      try { conn.close(); } catch (_e) {}
    }
    Console.enableProgressDisplay(true);
  }
};
