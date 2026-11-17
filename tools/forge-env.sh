# Forge CLI session for shells without a desktop keychain (Google Cloud Shell, CI boxes).
# Source it once per terminal tab, then run any forge command or tools/deploy.sh in that tab:
#
#   source tools/forge-env.sh you@example.com
#   bash tools/deploy.sh
#
# It asks for the Atlassian API token first (https://go.atlassian.com/forge-cli-api-token,
# "API token with scopes", Forge). The token stays in this tab's memory only: nothing is
# written to disk, and closing the tab forgets it. It then switches to Node 22 (the Forge
# CLI needs Node 22 or 24) and installs the Forge CLI if needed.
# SPDX-License-Identifier: Apache-2.0

export FORGE_EMAIL="${1:-${FORGE_EMAIL:-}}"
[ -n "$FORGE_EMAIL" ] || read -r -p "Atlassian account email: " FORGE_EMAIL
if [ -z "${FORGE_API_TOKEN:-}" ]; then
    read -r -s -p "Atlassian API token (not shown): " FORGE_API_TOKEN
    echo
fi
export FORGE_API_TOKEN

_isaano_node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$_isaano_node_major" -lt 22 ]; then
    if ! command -v nvm >/dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
        . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    fi
    if command -v nvm >/dev/null 2>&1; then
        echo "== Switching to Node 22 (Forge CLI needs 22 or 24)"
        nvm install 22 >/dev/null 2>&1 || true
        nvm use 22 >/dev/null 2>&1 || true
    else
        echo "Node $(node -v 2>/dev/null) found and nvm is missing: install Node 22 or 24 for the Forge CLI."
    fi
fi
unset _isaano_node_major

if ! command -v forge >/dev/null 2>&1; then
    echo "== Installing the Forge CLI"
    npm install -g @forge/cli@latest --no-audit --no-fund --loglevel=error
fi
forge settings set usage-analytics false >/dev/null 2>&1 || true

if forge whoami; then
    echo "== Forge is ready in this tab (Node $(node -v)). Next: bash tools/deploy.sh"
else
    echo "== Login failed: check the email, or create a new token and source this file again."
    unset FORGE_API_TOKEN
    false
fi
