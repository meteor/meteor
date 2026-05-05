# Package Replacements

One of the biggest challenges in migrating to Meteor 3 is dealing with unmaintained Atmosphere packages. This page lists common packages that need replacement and their recommended alternatives.

::: tip
Before replacing a package, check [Packosphere](https://packosphere.com/) — many packages have already been updated for Meteor 3 compatibility. Also check the [Meteor Community Packages](https://github.com/Meteor-Community-Packages) GitHub org and the [community tracking spreadsheet](https://docs.google.com/spreadsheets/d/1JbUZmJab3owZ9LV71Ubto32YX_QWQljRypJTOQupxL8/edit?usp=sharing).
:::

## Replacement Strategy

When a package doesn't have a Meteor 3-compatible version:

1. **Check Packosphere** for an updated version or fork
2. **Check the [Community Packages](https://github.com/Meteor-Community-Packages) org** — many packages have been transferred here for ongoing maintenance
3. **Look for an npm replacement** — Meteor 3 has better npm integration, so npm packages are often viable
4. **Inline the functionality** — if the package is small, consider copying the relevant code into your project
5. **Fork and patch** — as a last resort, fork the package and make the minimum changes for Meteor 3 compatibility

## Routing

| Old Package | Replacement | Notes |
|---|---|---|
| `kadira:flow-router` | `ostrio:flow-router-extra` | Drop-in replacement with additional features |
| `iron:router` | `ostrio:flow-router-extra` or `vlasky:galvanized-iron-router` | `galvanized-iron-router` is closest to iron:router's API |

## Data & Collections

| Old Package | Replacement | Notes |
|---|---|---|
| `aldeed:collection2` | `aldeed:collection2@4.0.0` | Updated for Meteor 3; now bundles `aldeed:simple-schema` internally — remove the `simpl-schema` npm package |
| `aldeed:schema-index` | `communitypackages:schema-index` | Transferred to Community Packages |
| `aldeed:schema-deny` | `communitypackages:schema-deny` | Transferred to Community Packages |
| `konecty:mongo-counter` | Inline MongoDB `$inc` operations | Simple enough to implement directly |
| `cottz:publish-relations` | `reywood:publish-composite` or [meteor-reactive-publish](https://github.com/nachocodoner/meteor-reactive-publish) | Both support reactive joins |

## Scheduling & Background Jobs

| Old Package | Replacement | Notes |
|---|---|---|
| `percolate:synced-cron` | `quave:synced-cron` | Community-maintained fork with async support |

## HTTP & APIs

| Old Package | Replacement | Notes |
|---|---|---|
| `http` (Meteor package) | `fetch` (`meteor/fetch`) | Core Meteor package; uses the standard `fetch` API |
| `simple:json-routes` | `WebApp.handlers` (Express) | Meteor 3 uses Express — see [Breaking Changes](../breaking-changes/index.md#webapp-switches-to-express-5) |
| Restivus | `WebApp.handlers` (Express) | Build REST endpoints directly with Express routes |

## Accounts & Auth

| Old Package | Replacement | Notes |
|---|---|---|
| `useraccounts:*` | `communitypackages:*` | Community-maintained alternatives |

## UI & Templates

| Old Package | Replacement | Notes |
|---|---|---|
| `mquandalle:jade` | Remove, convert to Spacebars/HTML | Jade template support was dropped |
| `peerlibrary:blaze-components` | Native Blaze templates | Convert to standard `Template` patterns |
| `meteorhacks:subs-manager` | Remove | Not needed with modern Meteor's subscription handling |

## Build Tools & CSS

| Old Package | Replacement | Notes |
|---|---|---|
| `fourseven:scss` | Remove (if using rspack on Meteor 3.4+) | rspack has native SCSS support |

::: info
For projects on Meteor 3.4+ with rspack, many build-tool-related Atmosphere packages (SCSS, Less, etc.) are no longer needed as rspack handles these natively. See the [Meteor-Rspack integration guide](https://docs.meteor.com/about/modern-build-stack/rspack-bundler-integration.html) for setup details and supported features.
:::

## Utilities

| Old Package | Replacement | Notes |
|---|---|---|
| `ongoworks:speakingurl` | `limax` (npm) | `npm install limax` |
| `underscore` | Native JavaScript | `Array.map`, `Object.keys`, `Array.filter`, spread syntax, etc. |
| `moment` | Native `Date`, `date-fns`, or `luxon` (npm) | `moment` is in maintenance mode |

## Community Resources

- [Community Package Migration Thread](https://forums.meteor.com/t/looking-for-help-migrating-packages-to-meteor-3-0/60985) — ongoing community discussion about package migration status
- [Package Compatibility Spreadsheet](https://docs.google.com/spreadsheets/d/1JbUZmJab3owZ9LV71Ubto32YX_QWQljRypJTOQupxL8/edit?usp=sharing) — collaborative tracking of package compatibility
- [Upgrading Packages Guide](../breaking-changes/upgrading-packages.md) — how to update your own packages for Meteor 3 compatibility
