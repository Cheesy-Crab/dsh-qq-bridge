#!/usr/bin/env bash
# Linux/macOS equivalent of the GitHub Actions job.
# Requires node >= 22 and pnpm on PATH (CI installs both; locally use your
# package manager or corepack).
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile
pnpm test
