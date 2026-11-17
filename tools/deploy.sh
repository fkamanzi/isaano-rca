#!/usr/bin/env bash
# Register, deploy and install Isaano RCA with the Forge CLI from any Linux shell,
# including Google Cloud Shell (no desktop keychain needed: the CLI reads
# FORGE_EMAIL and FORGE_API_TOKEN from this shell only, nothing is saved).
#
#   bash tools/deploy.sh                 asks for your Atlassian email, API token and site
#   bash tools/deploy.sh demo            same, but installs on your Forge demo site
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
cd "$(dirname "$0")/.."

command -v forge >/dev/null || sudo npm install -g @forge/cli@latest --no-audit --no-fund --loglevel=error
npm install --no-audit --no-fund --loglevel=error

read -r -p "Atlassian account email: " FORGE_EMAIL
read -r -s -p "Atlassian API token (not shown): " FORGE_API_TOKEN
echo
SITE=""
if [ "${1:-}" != demo ]; then
    read -r -p "Your Atlassian site, for example yourname.atlassian.net: " SITE
fi
export FORGE_EMAIL FORGE_API_TOKEN
forge settings set usage-analytics false >/dev/null 2>&1 || true

echo "== Checking the login"
forge whoami

if grep -q 'app/00000000-0000-0000-0000-000000000000' manifest.yml; then
    echo "== Registering the app (gives it its own app id)"
    forge register --personal --accept-terms "Isaano RCA"
fi

echo "== Deploying to the development environment"
forge deploy --non-interactive -e development

echo "== Installing on Jira"
if [ -n "$SITE" ]; then
    forge install --non-interactive -e development --product jira --site "$SITE" --confirm-scopes
else
    forge install --non-interactive -e development --product jira --demo-site --confirm-scopes
fi
unset FORGE_API_TOKEN
grep -o 'ari:cloud:ecosystem::app/[0-9a-f-]*' manifest.yml | head -1
echo "== Done. Open any Jira issue: the 'Isaano RCA (evidence-locked)' panel is under the description."
