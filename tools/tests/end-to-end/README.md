# End-to-End Testing with testRigor

This directory contains the end-to-end testing infrastructure for the Meteor project using testRigor.

## Overview

testRigor is an AI-powered end-to-end testing platform that allows you to write tests in plain English. This setup enables automated testing of the Meteor application's user interface and functionality from a user's perspective.

## How it Works

1. **Test Application**: A sample Meteor app in `../test-app/` serves as the testing target
2. **GitHub Actions**: Automated workflow in `.github/workflows/end-to-end.yml` that:
   - Starts the Meteor test app locally
   - Runs testRigor test suites against `localhost:3000`
   - Uses GitHub secrets for authentication (`CI_TOKEN` and `SUITE_ID`)
3. **testRigor CLI**: Executes test suites written in natural language on the testRigor platform

## Usage

### Local Testing
```bash
# Start the test app
cd tools/tests/end-to-end/test-app
meteor

# Run testRigor tests (requires valid tokens)
testrigor test-suite run <SUITE_ID> --token <CI_TOKEN> --localhost --url http://localhost:3000
```

### CI/CD Testing
Tests automatically run via GitHub Actions

## Configuration

Set these on the GitHub repository:
- `CI_TOKEN`: Your testRigor authentication token secret
- `SUITE_ID`: The testRigor test suite identifier variable

## Learn More

- [testRigor Documentation](https://testrigor.com/docs/)
- [testRigor CLI Reference](https://testrigor.com/command-line)
