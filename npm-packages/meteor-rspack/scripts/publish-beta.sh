#!/usr/bin/env bash
set -euo pipefail

npm publish --tag beta "$@"
