#!/usr/bin/env bash

cd ../..

./meteor self-test \
  "css hot code push|custom minifier - devel vs prod|versioning hot code push|javascript hot code push|add packages client archs" \
  --browserstack \
  --retries 2 \
  --headless
