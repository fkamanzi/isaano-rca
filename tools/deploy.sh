#!/usr/bin/env bash
# Register, deploy and install Isaano RCA with the Forge CLI from any Linux shell,
# including Google Cloud Shell (no desktop keychain needed).
#
#   source tools/forge-env.sh you@example.com     once per terminal tab (asks for the token)
#   bash tools/deploy.sh                           installs on your Forge demo site (Jira, JSM, Rovo)
#   bash tools/deploy.sh mysite.atlassian.net      installs on an existing site instead
#
# Deploys to the production environment by default, because only production
# deployments can be shared with an installation link. FORGE_ENVIRONMENT=development
# deploys to development instead.
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${FORGE_API_TOKEN:-}" ] || [ -z "${FORGE_EMAIL:-}" ]; then
    echo "Run this first in the same tab:  source tools/forge-env.sh you@example.com"
    exit 1
fi
ENVIRONMENT="${FORGE_ENVIRONMENT:-production}"
SITE="${1:-}"

npm install --no-audit --no-fund --loglevel=error

echo "== Login"
forge whoami

if grep -q 'app/00000000-0000-0000-0000-000000000000' manifest.yml; then
    echo "== Registering the app in your Developer Space (gives it its own app id)"
    forge register --accept-terms "Isaano RCA"
fi
APP_ID="$(grep -o 'ari:cloud:ecosystem::app/[0-9a-f-]*' manifest.yml | head -1)"
echo "App id: $APP_ID"

echo "== Deploying to $ENVIRONMENT"
forge deploy --non-interactive -e "$ENVIRONMENT"

if [ -n "$SITE" ]; then
    TARGET=(--site "$SITE")
else
    echo "== Demo site (Jira, Jira Service Management and Rovo; the first time takes a few minutes)"
    forge site provision || echo "(site provision returned an error; trying the install anyway)"
    TARGET=(--demo-site)
fi

echo "== Installing on Jira"
if ! forge install --non-interactive -e "$ENVIRONMENT" --product jira "${TARGET[@]}" --confirm-scopes; then
    echo "== Install returned an error; upgrading an existing installation instead"
    forge install --non-interactive -e "$ENVIRONMENT" --product jira "${TARGET[@]}" --upgrade --confirm-scopes
fi
forge install list -e "$ENVIRONMENT" || true
echo "== Done ($APP_ID). Open any Jira issue: the 'Isaano RCA (evidence-locked)' panel is under the description."
