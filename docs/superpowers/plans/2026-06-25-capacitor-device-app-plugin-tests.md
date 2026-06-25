# Capacitor Device and App Plugin Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify official Capacitor `Device` and `App` plugins in Meteor's native Maestro tests and web E2E Capacitor fixture.

**Architecture:** Native coverage lives in `tools/native-tests/apps/capacitor-tests` and is asserted by Maestro visible text after real native plugin sync/build/launch. Web coverage lives in existing `tools/e2e-tests/apps/native-react` and is asserted by Playwright during the skipped-native Capacitor web lifecycle. Both fixtures import the same official plugins but assert different stable runtime contracts.

**Tech Stack:** Meteor, Capacitor 7, `@capacitor/device@^7.0.5`, `@capacitor/app@^7.1.2`, Maestro, Jest, Playwright, React.

## Global Constraints

- Use `@capacitor/device@^7.0.5`.
- Use `@capacitor/app@^7.1.2`.
- Native tests assert `Device plugin ready: native`.
- Native tests assert `App plugin ready: com.meteor.capacitortests`.
- Web E2E tests assert `Device plugin ready: web`.
- Web E2E tests assert `App plugin unavailable on web`.
- Do not assert volatile values such as OS version, device model, memory usage, app version, or build number.
- Keep plugin failures isolated to plugin-specific status text.
- Update `dev/modern-tools/rspack/E2E_COVERAGE.md` for new E2E app assertions and npm package compatibility.

---

## File Map

- Modify `tools/e2e-tests/apps/native-react/package.json`: add browser runtime plugin dependencies.
- Modify `tools/e2e-tests/apps/native-react/imports/ui/App.jsx`: render web plugin statuses.
- Modify `tools/e2e-tests/capacitor.test.js`: assert web plugin statuses.
- Modify `tools/native-tests/apps/capacitor-tests/package.json`: add native runtime plugin dependencies.
- Modify `tools/native-tests/apps/capacitor-tests/client/main.html`: add native plugin status nodes.
- Modify `tools/native-tests/apps/capacitor-tests/client/main.js`: call native plugins and render stable status text.
- Modify `tools/native-tests/flows/capacitor-tests.yaml`: assert native plugin statuses.
- Modify `tools/native-tests/flows/capacitor-tests-livereload-initial.yaml`: assert native plugin statuses.
- Modify `tools/native-tests/flows/capacitor-tests-livereload.yaml`: assert native plugin statuses.
- Modify `tools/native-tests/flows/capacitor-tests-hcp-initial.yaml`: assert native plugin statuses.
- Modify `tools/native-tests/flows/capacitor-tests-hcp.yaml`: assert native plugin statuses.
- Modify `tools/native-tests/README.md`: document new visible strings.
- Modify `dev/modern-tools/rspack/E2E_COVERAGE.md`: document E2E coverage and compatibility entries.

---

### Task 1: Add Web E2E Plugin Assertion And Fixture UI

**Files:**
- Modify: `tools/e2e-tests/capacitor.test.js`
- Modify: `tools/e2e-tests/apps/native-react/package.json`
- Modify: `tools/e2e-tests/apps/native-react/imports/ui/App.jsx`

**Interfaces:**
- Consumes: Playwright global `page` and existing `assertNativeReactApp(port)`.
- Produces: `[data-testid="native-device-plugin"]` text `Device plugin ready: web`.
- Produces: `[data-testid="native-app-plugin"]` text `App plugin unavailable on web`.

- [ ] **Step 1: Write the failing E2E assertion**

In `tools/e2e-tests/capacitor.test.js`, inside `assertNativeReactApp(port)`, after the existing `native-context` assertion, add:

```js
    await page.waitForFunction(() => (
      document.querySelector('[data-testid="native-device-plugin"]')?.textContent ===
      'Device plugin ready: web'
    ));
    await page.waitForFunction(() => (
      document.querySelector('[data-testid="native-app-plugin"]')?.textContent ===
      'App plugin unavailable on web'
    ));
```

- [ ] **Step 2: Run focused E2E test to verify failure**

Run from `tools/e2e-tests`:

```bash
rtk npm test -- --runTestsByPath capacitor.test.js -t '"meteor run android" serves web app and prepares Capacitor webDir'
```

Expected: FAIL with a Playwright wait timeout because `native-device-plugin` and `native-app-plugin` do not exist yet.

- [ ] **Step 3: Add web fixture dependencies**

In `tools/e2e-tests/apps/native-react/package.json`, add these entries under `dependencies`:

```json
    "@capacitor/app": "^7.1.2",
    "@capacitor/device": "^7.0.5",
```

The dependency block should remain alphabetized near the other `@...` packages:

```json
  "dependencies": {
    "@babel/runtime": "^7.23.5",
    "@capacitor/app": "^7.1.2",
    "@capacitor/device": "^7.0.5",
    "@swc/helpers": "^0.5.17",
    "meteor-node-stubs": "^1.2.12",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
```

- [ ] **Step 4: Implement web fixture plugin rendering**

Replace `tools/e2e-tests/apps/native-react/imports/ui/App.jsx` with:

```jsx
import React, { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Device } from '@capacitor/device';

import './main.css';

function getErrorMessage(error) {
  return error?.message || String(error);
}

export const App = () => {
  const [devicePluginStatus, setDevicePluginStatus] = useState('Device plugin pending');
  const [appPluginStatus, setAppPluginStatus] = useState('App plugin pending');

  useEffect(() => {
    let active = true;

    async function checkDevicePlugin() {
      try {
        const info = await Device.getInfo();
        if (!active) return;

        setDevicePluginStatus(
          info?.platform === 'web'
            ? 'Device plugin ready: web'
            : `Device plugin unexpected platform: ${info?.platform || 'unknown'}`
        );
      } catch (error) {
        if (active) {
          setDevicePluginStatus(`Device plugin error: ${getErrorMessage(error)}`);
        }
      }
    }

    async function checkAppPlugin() {
      try {
        await CapacitorApp.getInfo();
        if (active) {
          setAppPluginStatus('App plugin unexpectedly available on web');
        }
      } catch (error) {
        if (!active) return;

        const message = getErrorMessage(error);
        setAppPluginStatus(
          /not implemented on web/i.test(message)
            ? 'App plugin unavailable on web'
            : `App plugin error: ${message}`
        );
      }
    }

    checkDevicePlugin();
    checkAppPlugin();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main data-testid="native-react-root" className="native-react">
      <h1>Welcome to Meteor Native React</h1>
      <p data-testid="native-context">Rspack and Capacitor fixture</p>
      <p data-testid="native-device-plugin">{devicePluginStatus}</p>
      <p data-testid="native-app-plugin">{appPluginStatus}</p>
    </main>
  );
};
```

- [ ] **Step 5: Run focused E2E test to verify pass**

Run from `tools/e2e-tests`:

```bash
rtk npm test -- --runTestsByPath capacitor.test.js -t '"meteor run android" serves web app and prepares Capacitor webDir'
```

Expected: PASS. Browser console errors and page errors remain empty because expected `App.getInfo()` web rejection is caught.

- [ ] **Step 6: Commit web E2E task**

Run:

```bash
rtk git add tools/e2e-tests/capacitor.test.js tools/e2e-tests/apps/native-react/package.json tools/e2e-tests/apps/native-react/imports/ui/App.jsx
rtk git commit -m "Test Capacitor plugins in web E2E fixture"
```

---

### Task 2: Add Native Fixture Plugin Rendering And Maestro Assertions

**Files:**
- Modify: `tools/native-tests/apps/capacitor-tests/package.json`
- Modify: `tools/native-tests/apps/capacitor-tests/client/main.html`
- Modify: `tools/native-tests/apps/capacitor-tests/client/main.js`
- Modify: `tools/native-tests/flows/capacitor-tests.yaml`
- Modify: `tools/native-tests/flows/capacitor-tests-livereload-initial.yaml`
- Modify: `tools/native-tests/flows/capacitor-tests-livereload.yaml`
- Modify: `tools/native-tests/flows/capacitor-tests-hcp-initial.yaml`
- Modify: `tools/native-tests/flows/capacitor-tests-hcp.yaml`
- Modify: `tools/native-tests/README.md`

**Interfaces:**
- Consumes: `setStatus(id, text)` in `client/main.js`.
- Produces: `#device-plugin-status` text `Device plugin ready: native`.
- Produces: `#device-plugin-platform-status` text `Device plugin platform: android` or `Device plugin platform: ios`.
- Produces: `#app-plugin-status` text `App plugin ready: com.meteor.capacitortests`.

- [ ] **Step 1: Write failing Maestro assertions**

In each Capacitor flow, add these assertions immediately after `Capacitor native platform ready`:

```yaml
- extendedWaitUntil:
    visible: "Device plugin ready: native"
    timeout: 60000
- extendedWaitUntil:
    visible: "App plugin ready: com.meteor.capacitortests"
    timeout: 60000
```

Files:

- `tools/native-tests/flows/capacitor-tests.yaml`
- `tools/native-tests/flows/capacitor-tests-livereload-initial.yaml`
- `tools/native-tests/flows/capacitor-tests-livereload.yaml`
- `tools/native-tests/flows/capacitor-tests-hcp-initial.yaml`
- `tools/native-tests/flows/capacitor-tests-hcp.yaml`

- [ ] **Step 2: Verify assertion exists before implementation**

Run:

```bash
rtk rg -n "Device plugin ready: native|App plugin ready: com.meteor.capacitortests" tools/native-tests/flows
```

Expected: both strings appear in all five Capacitor flow files. A real native run would fail at this point because the fixture does not render the strings yet.

- [ ] **Step 3: Add native fixture dependencies**

In `tools/native-tests/apps/capacitor-tests/package.json`, add these entries under `dependencies`:

```json
    "@capacitor/app": "^7.1.2",
    "@capacitor/device": "^7.0.5",
```

The dependency block should be:

```json
  "dependencies": {
    "@babel/runtime": "^7.23.5",
    "@capacitor/app": "^7.1.2",
    "@capacitor/device": "^7.0.5",
    "meteor-node-stubs": "^1.2.12"
  },
```

- [ ] **Step 4: Add native fixture status nodes**

In `tools/native-tests/apps/capacitor-tests/client/main.html`, after:

```html
    <p id="native-platform-status">Capacitor native platform pending</p>
```

add:

```html
    <p id="device-plugin-status">Device plugin pending</p>
    <p id="device-plugin-platform-status">Device plugin platform pending</p>
    <p id="app-plugin-status">App plugin pending</p>
```

- [ ] **Step 5: Import plugins in native fixture**

At the top of `tools/native-tests/apps/capacitor-tests/client/main.js`, add:

```js
import { App as CapacitorApp } from "@capacitor/app";
import { Device } from "@capacitor/device";
```

The imports should appear before Meteor imports:

```js
import { App as CapacitorApp } from "@capacitor/app";
import { Device } from "@capacitor/device";
import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";
```

- [ ] **Step 6: Add native plugin helpers**

In `tools/native-tests/apps/capacitor-tests/client/main.js`, after `setStatus(id, text)`, add:

```js
function getErrorMessage(error) {
  return error?.message || String(error);
}

function withPluginTimeout(promise, label, timeoutMs = 15000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error(`${label} timed out`)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}
```

- [ ] **Step 7: Add native plugin checks**

In `tools/native-tests/apps/capacitor-tests/client/main.js`, after `checkCapacitorNativePlatform()`, add:

```js
async function checkDevicePlugin() {
  try {
    const info = await withPluginTimeout(Device.getInfo(), "Device.getInfo");
    if (info?.platform === "android" || info?.platform === "ios") {
      setStatus("device-plugin-status", "Device plugin ready: native");
      setStatus("device-plugin-platform-status", `Device plugin platform: ${info.platform}`);
    } else {
      setStatus(
        "device-plugin-status",
        `Device plugin unexpected platform: ${info?.platform || "unknown"}`
      );
    }
  } catch (error) {
    setStatus("device-plugin-status", `Device plugin error: ${getErrorMessage(error)}`);
  }
}

async function checkAppPlugin() {
  try {
    const info = await withPluginTimeout(CapacitorApp.getInfo(), "App.getInfo");
    if (info?.id === "com.meteor.capacitortests") {
      setStatus("app-plugin-status", "App plugin ready: com.meteor.capacitortests");
    } else {
      setStatus("app-plugin-status", `App plugin unexpected id: ${info?.id || "unknown"}`);
    }
  } catch (error) {
    setStatus("app-plugin-status", `App plugin error: ${getErrorMessage(error)}`);
  }
}

function checkCapacitorPlugins() {
  checkDevicePlugin();
  checkAppPlugin();
}
```

- [ ] **Step 8: Run native plugin checks during startup**

In `Meteor.startup(() => { ... })`, after:

```js
  checkCapacitorNativePlatform();
```

add:

```js
  checkCapacitorPlugins();
```

- [ ] **Step 9: Update native README visible strings**

In `tools/native-tests/README.md`, under **Default app assertions**, add these bullets after `Capacitor native platform ready`:

```markdown
- `Device plugin ready: native`
- `App plugin ready: com.meteor.capacitortests`
```

- [ ] **Step 10: Run native script unit tests**

Run:

```bash
rtk node --test tools/native-tests/scripts/*.test.js
```

Expected: PASS. These unit tests do not launch simulators but catch accidental native-test script regressions.

- [ ] **Step 11: Run optional native smoke if prerequisites exist**

Run Android when emulator and Maestro are available:

```bash
rtk npm run test:native:capacitor:android
```

Expected: PASS with Maestro seeing `Device plugin ready: native` and `App plugin ready: com.meteor.capacitortests`.

Run iOS when Xcode Simulator and Maestro are available:

```bash
rtk npm run test:native:capacitor:ios
```

Expected: PASS with same visible plugin assertions.

- [ ] **Step 12: Commit native task**

Run:

```bash
rtk git add tools/native-tests/apps/capacitor-tests/package.json tools/native-tests/apps/capacitor-tests/client/main.html tools/native-tests/apps/capacitor-tests/client/main.js tools/native-tests/flows/capacitor-tests.yaml tools/native-tests/flows/capacitor-tests-livereload-initial.yaml tools/native-tests/flows/capacitor-tests-livereload.yaml tools/native-tests/flows/capacitor-tests-hcp-initial.yaml tools/native-tests/flows/capacitor-tests-hcp.yaml tools/native-tests/README.md
rtk git commit -m "Test Capacitor plugins in native fixture"
```

---

### Task 3: Update E2E Coverage Documentation

**Files:**
- Modify: `dev/modern-tools/rspack/E2E_COVERAGE.md`

**Interfaces:**
- Consumes: final web E2E behavior from Task 1.
- Produces: coverage rows for `@capacitor/device`, `@capacitor/app`, and official plugin runtime behavior.

- [ ] **Step 1: Verify coverage doc is missing new package entries**

Run:

```bash
rtk rg -n "@capacitor/device|@capacitor/app|Capacitor official plugin" dev/modern-tools/rspack/E2E_COVERAGE.md
```

Expected: no matches for `@capacitor/device`, `@capacitor/app`, or `Capacitor official plugin`.

- [ ] **Step 2: Add native-react app coverage row**

In `dev/modern-tools/rspack/E2E_COVERAGE.md`, under `### native-react`, add this row:

```markdown
| Official Capacitor plugin imports and web runtime behavior (`Device.getInfo()` web success, `App.getInfo()` web unavailable) | Run, Prod |
```

- [ ] **Step 3: Add npm compatibility entries**

In `dev/modern-tools/rspack/E2E_COVERAGE.md`, under `### native-react (`apps/native-react/capacitor.config.js`)`, add:

```markdown
| `@capacitor/device` | Official Capacitor plugin import and web implementation (`Device.getInfo()` returns `platform: "web"`) |
| `@capacitor/app` | Official Capacitor plugin import and handled web unavailability for `App.getInfo()` |
```

- [ ] **Step 4: Add feature matrix row**

In `dev/modern-tools/rspack/E2E_COVERAGE.md`, under **Feature Coverage Matrix**, add:

```markdown
| Official Capacitor plugin import/runtime behavior | native-react | |
```

- [ ] **Step 5: Verify coverage doc entries**

Run:

```bash
rtk rg -n "@capacitor/device|@capacitor/app|Official Capacitor plugin import/runtime behavior" dev/modern-tools/rspack/E2E_COVERAGE.md
```

Expected: one package entry for each plugin and one feature matrix row.

- [ ] **Step 6: Commit docs task**

Run:

```bash
rtk git add dev/modern-tools/rspack/E2E_COVERAGE.md
rtk git commit -m "Document Capacitor plugin E2E coverage"
```

---

### Task 4: Final Verification

**Files:**
- No new files. Verifies all implementation changes.

**Interfaces:**
- Consumes: Tasks 1 through 3.
- Produces: final confidence report with commands run and any skipped native simulator coverage.

- [ ] **Step 1: Run native script unit tests**

Run:

```bash
rtk node --test tools/native-tests/scripts/*.test.js
```

Expected: PASS.

- [ ] **Step 2: Run focused Capacitor web E2E test**

Run from `tools/e2e-tests`:

```bash
rtk npm test -- --runTestsByPath capacitor.test.js -t '"meteor run android" serves web app and prepares Capacitor webDir'
```

Expected: PASS.

- [ ] **Step 3: Run optional native simulator tests when available**

Run:

```bash
rtk npm run test:native:capacitor:android
rtk npm run test:native:capacitor:ios
```

Expected: PASS if local Android emulator, iOS Simulator, and Maestro prerequisites are available. If unavailable, report exact skipped reason and rely on unit/E2E verification.

- [ ] **Step 4: Check final diff**

Run:

```bash
rtk git status --short
rtk git diff --stat HEAD
```

Expected: only intended files changed after last implementation commit, or clean tree if every task commit already landed.
