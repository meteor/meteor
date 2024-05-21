# Strict Mode

Meteor 3 introduces enhanced support for strict mode, aligning with modern JavaScript standards. This document outlines the changes related to module execution in strict mode, focusing on the use of top-level await (TLA) and module syntax (`import` and `export`).

Strict mode is a restricted variant of JavaScript that eliminates some of the language's silent errors and fixes mistakes that make it difficult for JavaScript engines to perform optimizations. Modules are designed to run in strict mode by default.

### Changes in Meteor 3

With the introduction of Meteor 3, modules will automatically run in strict mode under certain conditions:

1. **Top-Level Await (TLA):** Modules using top-level await will be executed in strict mode.
2. **Import Syntax:** Modules using the `import` statement will be executed in strict mode.
3. **Export Syntax:** Modules using the `export` statement should also run in strict mode.

### Background

Initially, there was a bug in the TLA implementation of Reify, a module used by Meteor. By default, Reify does not enforce strict mode for modules. However, the TLA implementation in Meteor did not fully adhere to this behavior, leading to modules running in strict mode when using TLA.

A decision was made to retain this behavior to ensure Meteor's compliance with the ECMAScript specification. Consequently, modules will continue to run in strict mode in specific situations, enhancing spec compliance and improving the overall consistency of the development experience.

While this change aims to bring Meteor more in line with the JavaScript specification, developers might notice some inconsistencies or changes in the user experience. It is important to review your code to ensure compatibility with strict mode, especially if your modules rely on defining globals or other behaviors not permitted in strict mode.

The enforcement of strict mode in certain scenarios in Meteor 3 represents a step towards greater specification compliance and modernization. Developers should adapt their code to accommodate these changes, ensuring a smooth transition to Meteor 3.

For further details and support, please refer to the official Meteor documentation or reach out to the Meteor community.
