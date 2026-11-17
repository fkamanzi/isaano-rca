# Forge CLI session for shells without a desktop keychain (Google Cloud Shell, CI boxes).
# Source it once per terminal tab, then run any forge command or tools/deploy.sh in that tab:
#
#   source tools/forge-env.sh you@example.com
#   bash tools/deploy.sh
#
# Token: https://go.atlassian.com/forge-cli-api-token ("API token with scopes", Forge).
# The token stays in this tab's memory only: nothing is written to disk, and closing the
# tab forgets it. Only the first pasted line is used; any other pasted lines are read and
# dropped, so the shell never runs them (or prints them back). Three tries.
# SPDX-License-Identifier: Apache-2.0

export FORGE_EMAIL="${1:-${FORGE_EMAIL:-}}"
[ -n "$FORGE_EMAIL" ] || read -r -p "Atlassian account email: " FORGE_EMAIL

# The Forge CLI needs Node 22 or 24.
_isaano_node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$_isaano_node_major" -lt 22 ]; then
    if ! command -v nvm >/dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
        . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    fi
    if command -v nvm >/dev/null 2>&1; then
        echo "== Switching to Node 22"
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

_isaano_ok=""
for _isaano_try in 1 2 3; do
    if [ -z "${FORGE_API_TOKEN:-}" ]; then
        IFS= read -r -s -p "Atlassian API token (not shown): " FORGE_API_TOKEN
        echo
        while IFS= read -r -s -t 1 _isaano_extra; do :; done
        unset _isaano_extra
        FORGE_API_TOKEN="${FORGE_API_TOKEN//$'\e'\[200~/}"
        FORGE_API_TOKEN="${FORGE_API_TOKEN//$'\e'\[201~/}"
        FORGE_API_TOKEN="${FORGE_API_TOKEN//[[:space:]]/}"
        case "$FORGE_API_TOKEN" in
            ATATT*) ;;
            *)
                echo "That was not an Atlassian API token (those start with ATATT). Copy the token and paste it again."
                unset FORGE_API_TOKEN
                continue
                ;;
        esac
    fi
    export FORGE_API_TOKEN
    if forge whoami; then
        _isaano_ok=1
        break
    fi
    echo "Atlassian did not accept that token. Copy it again, or create a new one, and paste it."
    unset FORGE_API_TOKEN
done
unset _isaano_try
if [ -n "$_isaano_ok" ]; then
    unset _isaano_ok
    echo "== Forge is ready in this tab (Node $(node -v)). Next: bash tools/deploy.sh"
else
    unset _isaano_ok
    echo "== No working token after 3 tries. When you have it: source tools/forge-env.sh $FORGE_EMAIL"
    false
fi
