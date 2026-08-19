#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.resolve(
  process.argv[2] ||
    path.join(__dirname, "../../.github/workflows/test-tools.yml"),
);

const DEV_BUNDLE_PATHS = ["~/.npm", ".meteor", ".babel-cache", "dev_bundle"];
const PACKAGE_NPM_PATHS = ["packages/**/.npm"];
const DEV_BUNDLE_KEY =
  "${{ runner.os }}-node-24-meteor-tools-${{ hashFiles('meteor', 'package-lock.json', 'tools/package-lock.json', 'tools/package.json') }}";
const PACKAGE_NPM_KEY =
  "${{ runner.os }}-node-24-pkg-npm-${{ hashFiles('packages/**/npm-shrinkwrap.json') }}";
const DEV_BUNDLE_RESTORE_KEYS = [
  "${{ runner.os }}-node-24-meteor-tools-",
  "${{ runner.os }}-node-24-meteor-",
];
const PACKAGE_NPM_RESTORE_KEYS = [
  "${{ runner.os }}-node-24-pkg-npm-",
];
const JOB_IDS = [
  "setup",
  "isolated-tests",
  ...Array.from({ length: 12 }, (_, index) => `test-group-${index}`),
];
const CONTAINER_IMAGE = "meteor/circleci:2025.07.8-android-35-node-22";
const DEFAULT_CONTAINER_OPTIONS = "--init --user root";
const LARGE_CONTAINER_OPTIONS =
  "--init --user root --cpus 4 --memory 16g --security-opt seccomp=unconfined";

function indentation(line) {
  return line.match(/^ */)[0].length;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseWorkflow(source) {
  const lines = source.split(/\r?\n/);
  const jobsLine = lines.findIndex(line => line === "jobs:");

  assert.notEqual(jobsLine, -1, "workflow must contain a top-level jobs mapping");

  const jobs = new Map();
  let currentJob;
  let currentStep;

  for (let index = jobsLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const jobMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (jobMatch) {
      currentJob = {
        id: jobMatch[1],
        lines: [],
        steps: [],
      };
      currentStep = null;
      jobs.set(currentJob.id, currentJob);
      continue;
    }

    if (!currentJob) {
      continue;
    }

    if (line && indentation(line) < 4) {
      currentJob = null;
      currentStep = null;
      continue;
    }

    currentJob.lines.push(line);

    const stepMatch = line.match(/^      - name:\s*(.+?)\s*$/);
    if (stepMatch) {
      currentStep = {
        name: unquote(stepMatch[1]),
        lines: [],
      };
      currentJob.steps.push(currentStep);
      continue;
    }

    if (currentStep) {
      if (line && indentation(line) <= 6) {
        currentStep = null;
      } else {
        currentStep.lines.push(line);
      }
    }
  }

  return jobs;
}

function readScalar(lines, indent, key) {
  const prefix = `${" ".repeat(indent)}${key}:`;
  const line = lines.find(candidate => candidate.startsWith(prefix));

  return line ? unquote(line.slice(prefix.length).trim()) : undefined;
}

function readBlock(lines, indent, key) {
  const prefix = `${" ".repeat(indent)}${key}:`;
  const start = lines.findIndex(candidate => candidate.startsWith(prefix));

  if (start === -1) {
    return [];
  }

  const inline = lines[start].slice(prefix.length).trim();
  if (inline && inline !== "|") {
    return [unquote(inline)];
  }

  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && indentation(line) <= indent) {
      break;
    }
    if (line.trim()) {
      values.push(unquote(line.trim()));
    }
  }

  return values;
}

function expectedUses(jobId) {
  const cacheAction = jobId === "setup"
    ? "actions/cache@v4"
    : "actions/cache/restore@v4";
  const uses = ["actions/checkout@v4", cacheAction, cacheAction];

  if (jobId !== "setup") {
    uses.push("actions/upload-artifact@v7");
  }

  return uses.sort();
}

function validateCacheStep(step, expected) {
  assert.equal(
    readScalar(step.lines, 8, "uses"),
    expected.action,
    `${expected.jobId}: ${step.name} must use ${expected.action}`,
  );
  assert.deepEqual(
    readBlock(step.lines, 10, "path"),
    expected.paths,
    `${expected.jobId}: ${step.name} has incorrect paths`,
  );
  assert.equal(
    readScalar(step.lines, 10, "key"),
    expected.key,
    `${expected.jobId}: ${step.name} has an incorrect key`,
  );
  assert.deepEqual(
    readBlock(step.lines, 10, "restore-keys"),
    expected.restoreKeys,
    `${expected.jobId}: ${step.name} has incorrect restore keys`,
  );
}

function validateWorkflow(source) {
  const jobs = parseWorkflow(source);

  assert.deepEqual(
    [...jobs.keys()],
    JOB_IDS,
    "Test Tools jobs changed unexpectedly",
  );

  for (const jobId of JOB_IDS) {
    const job = jobs.get(jobId);
    const expectedOptions = ["test-group-0", "test-group-5"].includes(jobId)
      ? LARGE_CONTAINER_OPTIONS
      : DEFAULT_CONTAINER_OPTIONS;

    assert.equal(
      readScalar(job.lines, 4, "runs-on"),
      "oss-vm",
      `${jobId}: runner must remain oss-vm`,
    );
    assert.equal(
      readScalar(job.lines, 6, "image"),
      CONTAINER_IMAGE,
      `${jobId}: container image changed unexpectedly`,
    );
    assert.equal(
      readScalar(job.lines, 6, "options"),
      expectedOptions,
      `${jobId}: container options changed unexpectedly`,
    );

    const uses = job.steps
      .map(step => readScalar(step.lines, 8, "uses"))
      .filter(Boolean)
      .sort();
    assert.deepEqual(
      uses,
      expectedUses(jobId),
      `${jobId}: action versions or action count changed unexpectedly`,
    );

    const cacheAction = jobId === "setup"
      ? "actions/cache@v4"
      : "actions/cache/restore@v4";
    const devBundleStep = job.steps.find(
      step => step.name === "Restore dev bundle cache",
    );
    const packageNpmStep = job.steps.find(
      step => step.name === "Restore package npm cache",
    );

    assert.ok(devBundleStep, `${jobId}: missing dev bundle cache step`);
    assert.ok(packageNpmStep, `${jobId}: missing package npm cache step`);

    validateCacheStep(devBundleStep, {
      action: cacheAction,
      jobId,
      key: DEV_BUNDLE_KEY,
      paths: DEV_BUNDLE_PATHS,
      restoreKeys: DEV_BUNDLE_RESTORE_KEYS,
    });
    validateCacheStep(packageNpmStep, {
      action: cacheAction,
      jobId,
      key: PACKAGE_NPM_KEY,
      paths: PACKAGE_NPM_PATHS,
      restoreKeys: PACKAGE_NPM_RESTORE_KEYS,
    });
  }
}

try {
  validateWorkflow(fs.readFileSync(workflowPath, "utf8"));
  console.log(`Validated split Node 24 caches in ${workflowPath}`);
} catch (error) {
  console.error(`Invalid Test Tools cache configuration: ${error.message}`);
  process.exitCode = 1;
}
