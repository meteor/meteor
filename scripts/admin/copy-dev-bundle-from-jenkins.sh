#!/usr/bin/env bash

# Requires awscli and an appropriate ~/.aws/config.
# Usage: copy-dev-bundle-from-jenkins.sh [--prod] BUILDNUMBER
# BUILDNUMBER can also be an Actions run-number--commit identifier.
set -euo pipefail

cd "$(dirname "$0")"
source ./copy-dev-bundle-common.sh
copy_dev_bundle "" "$@"
