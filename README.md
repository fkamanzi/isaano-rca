# Isaano RCA: evidence-locked incident root-cause analysis for Jira Service Management

A Forge app for network operations and IT teams. On every incident ticket it builds the timeline in UTC, keeps an evidence register (alarms, KPIs, logs, traces, change records, field reports), finds the network segment that deviated first, and will not let anyone publish a root cause that does not cite its evidence. A Rovo agent works the same way in chat, and the read-only actions are exposed as MCP tools.

Category: **Apps for Specialized Industries** (telecom network operations). Bonus tracks: **Rovo agents** (`rovo:agent` with `action` modules) and **Atlassian MCP** (`rovo:mcp`).

## Why

After a major outage the root-cause report is written from memory, under pressure, by the people who fixed it. Causes get asserted, not shown; the segment that failed first gets confused with the one that alarmed loudest; corrective actions have no owner. Isaano RCA turns the habits of a careful incident engineer into rules the tool enforces.

## What it does

- **Timeline (UTC):** ticket created, status and priority changes, first and latest comment, resolution, merged with every evidence item, all normalised to UTC. Time to first response and time to restore are computed from the ticket.
- **Paste rows from an export:** alarm lists, PM reports and change calendars paste straight in as CSV or tab-separated rows (time, segment, type, source, what it shows, abnormal); bad rows are reported, not guessed.
- **Evidence register:** each item has a type, network segment (RAN, Transport, Core, IMS / voice, Services, Cloud, Site power, Other), source system, UTC time, what it shows and whether it shows a deviation.
- **First deviation:** the earliest abnormal evidence per segment. If two segments deviate within 60 s of each other, it says the order cannot be proven at that granularity and points to shared resources instead of guessing.
- **Evidence lock:** a finding that is *Proven* or *Supported* must cite existing evidence; *Proven* also needs evidence that shows a deviation and a counterfactual (what changed when the cause was removed); corrective actions need an owner and a due date. Until the lock passes, the Publish button stays disabled.
- **Publish:** posts a ten-section RCA to the ticket as an internal comment (summary, timing, timeline, first deviation, root cause, contributing factors, excluded hypotheses, corrective actions, evidence register, open items).
- **Rovo agent, Isaano RCA Investigator:** builds the timeline, names the first deviating segment, checks the lock and drafts the report, citing evidence IDs like [E3] after every factual statement. It adds evidence or findings only when asked, after repeating the values back.
- **MCP tools:** `get-incident-timeline`, `list-evidence`, `check-evidence-lock` and `draft-rca` are exposed through `rovo:mcp`, so an MCP client can read an incident's evidence-locked state.
- **Runs on Atlassian:** data stays in Forge storage (KVS); the app makes no calls outside Atlassian.

## How it is built

| Part | Forge | Where |
| --- | --- | --- |
| Issue panel | `jira:issuePanel`, UI Kit (`@forge/react`), resolver | `src/frontend/index.jsx`, `src/index.js` (`handler`) |
| Agent | `rovo:agent` with six `action` modules | `manifest.yml` |
| MCP | `rovo:mcp` with four read-only tools | `manifest.yml` |
| Actions | one shared function routed on module key | `src/index.js` (`runAction`) |
| Jira data | `requestJira` as the user: issue, changelog, comments; internal comment | `src/lib/jira.js` |
| Storage | `@forge/kvs`, one record per incident | `src/lib/store.js` |
| Logic | timeline, first deviation, evidence lock, report (Markdown and ADF) | `src/lib/rca.js` |

The logic in `src/lib/rca.js` has no Forge calls, so it is unit tested with Node: `npm test` (8 tests).

## Install and run

```sh
npm install -g @forge/cli
npm install
forge login                     # Atlassian email and API token
forge register                  # once, creates the app id
forge deploy
forge install --site <your-site>.atlassian.net --product jira
```

From a shell without a desktop keychain (Google Cloud Shell, a CI box), `source tools/forge-env.sh you@example.com` asks for the API token once for that terminal tab, then `bash tools/deploy.sh` registers, deploys to production and installs on your Forge demo site.

Open an incident in a Jira Service Management project: the **Isaano RCA (evidence-locked)** panel is under the issue. In Rovo chat, pick **Isaano RCA Investigator** from the agents.

## Privacy and terms

The app stores only what users enter (evidence, findings, actions) in its Forge storage, stores no account IDs and makes no calls outside Atlassian: see [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md).

## Licence

Apache-2.0
