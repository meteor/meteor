if (Package['accounts-ui'] && (Package['github-config-ui'] === undefined)) {
  console.warn("Note: You're using accounts-ui and accounts-github, but didn't");
  console.warn("install the configuration UI for GitHub OAuth.");
  console.warn("You can install it with `meteor add github-config-ui`.");
}
