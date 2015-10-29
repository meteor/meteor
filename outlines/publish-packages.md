# Publishing a Package

1. Pros/cons of publishing a package
  1. Considering what's involved in publishing a package.
  2. Do you think you'll be able to maintain it properly?
  3. Is the code complete enough to be useful, or does it need work to be made generic?
2. How to decide what's in a package / more than one
  1. Is there any core functionality that could be reused elsewhere? (e.g. route matching)
  2. Is there pure JS code that could be published to NPM?
  3. Principle of a single symbol per package could help (see structure chapter).
3. How to write great documentation.
  1. README vs longer documentation/guide
  2. Is the documentation too complicated? Maybe the package should be simpler?
  3. Maintaining a changelog
  4. Licensing
4. Testing your package now and in the future
  1. See testing chapter
  2. Use travis + special badge to test against core + devel
5. Publishing!
  1. Semvar + version number changes
  2. Tracking meteor + other package versions
  3. Changing your profile on Atmosphere
  4. Publicizing your package on forums + relevant issues on GH/forums
6. Maintaining packages
  1. Dealing with issues and PRs in a respectful and efficient way
  2. Getting help from the community + finding co-maintainers