// Default scenario (the bug, issue #10366): a lazily-compiled file under
// imports/ that fails to compile, imported here. The compile error must fail
// the build instead of being swallowed into a runtime "Cannot find module".
// The self-test rewrites this file to exercise the other scenarios.
require('/imports/broken.bork');
