import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultManifestPath = path.resolve(__dirname, "../ci-groups.json");

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*");

  return new RegExp(`^${escaped}$`);
}

function matchesPath(globs, filename) {
  return globs.some((glob) => globToRegExp(glob).test(filename));
}

function allSlices(manifest) {
  return manifest.checks.flatMap((check) =>
    check.slices.map((slice) => ({ check: check.check, ...slice }))
  );
}

function selectSliceIds(manifest, selectors) {
  const slices = allSlices(manifest);

  if (selectors.some((selector) => selector.group === "all")) {
    return new Set(slices.map((slice) => slice.id));
  }

  const selected = new Set();
  for (const selector of selectors) {
    for (const slice of slices) {
      if (selector.kind && slice.kind === selector.kind) {
        selected.add(slice.id);
      }
      if (selector.id && slice.id === selector.id) {
        selected.add(slice.id);
      }
      if (selector.check && slice.check === selector.check) {
        selected.add(slice.id);
      }
    }
  }

  return selected;
}

function matrixForSelectedSlices(manifest, selectedIds) {
  const include = [];

  for (const check of manifest.checks) {
    const selectedSlices = check.slices.filter((slice) => selectedIds.has(slice.id));

    if (selectedSlices.length === 0) {
      continue;
    }

    include.push({
      check: check.check,
      sliceIds: selectedSlices.map((slice) => slice.id).join(","),
      jestArgsJson: JSON.stringify(selectedSlices.map((slice) => slice.jestArgs))
    });
  }

  return { include };
}

function noopMatrixForMissingChecks(manifest, realMatrix) {
  const realChecks = new Set(realMatrix.include.map((item) => item.check));

  return {
    include: manifest.checks
      .filter((check) => !realChecks.has(check.check))
      .map((check) => ({ check: check.check }))
  };
}

export function resolveCiPlan({
  manifest,
  labels = [],
  changedFiles = [],
  isDraft = false,
  action = "",
  addedLabel = null
}) {
  const knownLabels = new Set(Object.keys(manifest.labels));
  const knownE2ELabelWasAdded = action === "labeled" && knownLabels.has(addedLabel);
  const ignoredLabelEvent = action === "labeled" && !knownE2ELabelWasAdded;

  if (ignoredLabelEvent) {
    return {
      emitChecks: false,
      runE2E: false,
      reason: `ignored label ${addedLabel}`,
      realMatrix: { include: [] },
      noopMatrix: { include: [] }
    };
  }

  const selectedIds = new Set();
  const reasons = [];

  for (const [label, config] of Object.entries(manifest.labels)) {
    const labelWasAdded = addedLabel === label;
    const managedSynchronizeLabel =
      action === "synchronize" && config.managed === true && !labelWasAdded;
    const labelIsActive = labels.includes(label) && !managedSynchronizeLabel;

    if (labelIsActive || labelWasAdded) {
      for (const id of selectSliceIds(manifest, config.select)) {
        selectedIds.add(id);
      }
      reasons.push(`selected by label: ${label}`);
    }
  }

  for (const rule of manifest.pathRules) {
    if (changedFiles.some((file) => matchesPath(rule.paths, file))) {
      for (const id of selectSliceIds(manifest, rule.select)) {
        selectedIds.add(id);
      }
      reasons.push(`selected by path rule: ${rule.name}`);
    }
  }

  const realMatrix = isDraft ? { include: [] } : matrixForSelectedSlices(manifest, selectedIds);
  const noopMatrix = noopMatrixForMissingChecks(manifest, realMatrix);

  return {
    emitChecks: true,
    runE2E: realMatrix.include.length > 0,
    reason: isDraft ? "draft pull request" : reasons[0] || "no E2E selection",
    realMatrix,
    noopMatrix
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    console.log(`${name}=${value}`);
    return;
  }

  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
}

export function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Usage: node tools/e2e-tests/scripts/resolve-ci-plan.mjs <input-json>");
  }

  const input = readJson(inputPath);
  const manifest = readJson(input.manifestPath || defaultManifestPath);
  const plan = resolveCiPlan({ manifest, ...input });

  writeOutput("real_count", String(plan.realMatrix.include.length));
  writeOutput("noop_count", String(plan.noopMatrix.include.length));
  writeOutput("emit_checks", plan.emitChecks ? "true" : "false");
  writeOutput("run_e2e", plan.runE2E ? "true" : "false");
  writeOutput("reason", plan.reason);
  writeOutput("real_matrix", JSON.stringify(plan.realMatrix));
  writeOutput("noop_matrix", JSON.stringify(plan.noopMatrix));
}

if (process.argv[1] === __filename) {
  main();
}
