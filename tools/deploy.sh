#!/usr/bin/env bash
# Register, deploy and install Isaano RCA with the Forge CLI from any Linux shell,
# including Google Cloud Shell (no desktop keychain needed: the CLI reads
# FORGE_EMAIL and FORGE_API_TOKEN from this shell only, nothing is saved).
#
#   bash tools/deploy.sh                 installs on your Forge demo site (Jira, JSM, Rovo; provisioned if needed)
#   bash tools/deploy.sh mysite.atlassian.net   installs on an existing site instead
# Token: https://go.atlassian.com/forge-cli-api-token (API token with scopes, Forge).
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
cd "$(dirname "$0")/.."

command -v forge >/dev/null || npm install -g @forge/cli@latest --no-audit --no-fund --loglevel=error
npm install --no-audit --no-fund --loglevel=error

read -r -p "Atlassian account email: " FORGE_EMAIL
read -r -s -p "Atlassian API token (not shown): " FORGE_API_TOKEN
echo
SITE="${1:-}"
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
    echo "== Your Forge demo site (provisioned the first time; this can take a few minutes)"
    forge site provision
    forge install --non-interactive -e development --product jira --demo-site --confirm-scopes
fi
unset FORGE_API_TOKEN
grep -o 'ari:cloud:ecosystem::app/[0-9a-f-]*' manifest.yml | head -1
echo "== Done. Open any Jira issue: the 'Isaano RCA (evidence-locked)' panel is under the description."
