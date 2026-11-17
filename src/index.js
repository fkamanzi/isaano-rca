// Isaano RCA: backend for the issue panel (resolver) and for the Rovo agent,
// Rovo skills and MCP tools (one shared action handler routed on module key).
// SPDX-License-Identifier: Apache-2.0
import Resolver from '@forge/resolver';
import { getIssue, addInternalComment } from './lib/jira.js';
import { loadState, saveState } from './lib/store.js';
import {
  addAction, addEvidence, addFinding, checkLock, firstDeviation, importEvidence, metrics, removeItem, updateFinding,
  reportAdf, reportMarkdown, timeline, EVIDENCE_TYPES, SEGMENTS, FINDING_KINDS, CONFIDENCE, IMPORT_COLUMNS,
} from './lib/rca.js';

async function snapshot(issueKeyOrId) {
  const issue = await getIssue(issueKeyOrId);
  const state = await loadState(issue.id);
  return { issue, state };
}

function view(issue, state) {
  return {
    issueKey: issue.key,
    summary: issue.fields?.summary || '',
    metrics: metrics(issue),
    timeline: timeline(issue, state),
    firstDeviation: firstDeviation(state),
    lock: checkLock(state, issue),
    state,
    options: { EVIDENCE_TYPES, SEGMENTS, FINDING_KINDS, CONFIDENCE, IMPORT_COLUMNS },
  };
}

// ---------------------------------------------------------------- issue panel
const resolver = new Resolver();
const issueOf = (context) => context?.extension?.issue?.id || context?.extension?.issue?.key;

resolver.define('load', async ({ context }) => {
  const { issue, state } = await snapshot(issueOf(context));
  return view(issue, state);
});

async function mutate(context, change) {
  const { issue, state } = await snapshot(issueOf(context));
  change(state);
  await saveState(issue.id, state);
  return view(issue, state);
}

resolver.define('addEvidence', ({ payload, context }) => mutate(context, (s) => addEvidence(s, payload)));
resolver.define('addFinding', ({ payload, context }) => mutate(context, (s) => addFinding(s, payload)));
resolver.define('updateFinding', ({ payload, context }) => mutate(context, (s) => updateFinding(s, payload)));
resolver.define('addAction', ({ payload, context }) => mutate(context, (s) => addAction(s, payload)));
resolver.define('remove', ({ payload, context }) => mutate(context, (s) => removeItem(s, payload.id)));

resolver.define('importEvidence', async ({ payload, context }) => {
  const { issue, state } = await snapshot(issueOf(context));
  const result = importEvidence(state, payload?.text);
  if (result.added.length) await saveState(issue.id, state);
  return { ...view(issue, state), imported: result.added.length, importErrors: result.errors };
});

resolver.define('publish', async ({ context }) => {
  const { issue, state } = await snapshot(issueOf(context));
  const lock = checkLock(state, issue);
  if (!lock.ok) return { published: false, lock };
  await addInternalComment(issue.key, reportAdf(issue, state));
  state.publishedAt = new Date().toISOString();
  await saveState(issue.id, state);
  return { published: true, ...view(issue, state) };
});

export const handler = resolver.getDefinitions();

// ---------------------------------------------------------------- Rovo actions and MCP tools
function issueFromAction(payload) {
  const key = String(payload?.issueKey || '').trim();
  return key || payload?.context?.jira?.issueKey || payload?.context?.jira?.issueId;
}

const ACTIONS = {
  'get-incident-timeline': async (p) => {
    const { issue, state } = await snapshot(issueFromAction(p));
    return { issueKey: issue.key, summary: issue.fields?.summary, metrics: metrics(issue), timeline: timeline(issue, state) };
  },
  'list-evidence': async (p) => {
    const { issue, state } = await snapshot(issueFromAction(p));
    return { issueKey: issue.key, evidence: state.evidence, findings: state.findings, actions: state.actions, firstDeviation: firstDeviation(state) };
  },
  'check-evidence-lock': async (p) => {
    const { issue, state } = await snapshot(issueFromAction(p));
    return { issueKey: issue.key, ...checkLock(state, issue) };
  },
  'draft-rca': async (p) => {
    const { issue, state } = await snapshot(issueFromAction(p));
    return reportMarkdown(issue, state);
  },
  'add-evidence': async (p) => {
    const { issue, state } = await snapshot(issueFromAction(p));
    const item = addEvidence(state, p);
    await saveState(issue.id, state);
    return { added: item, firstDeviation: firstDeviation(state) };
  },
  'update-finding': async (p) => {
    const { issue, state } = await snapshot(issueFromAction(p));
    const item = updateFinding(state, p);
    await saveState(issue.id, state);
    return { updated: item, lock: checkLock(state, issue) };
  },
  'add-finding': async (p) => {
    const { issue, state } = await snapshot(issueFromAction(p));
    const item = addFinding(state, p);
    await saveState(issue.id, state);
    return { added: item, lock: checkLock(state, issue) };
  },
};

export async function runAction(payload) {
  const key = payload?.context?.moduleKey;
  const fn = ACTIONS[key];
  if (!fn) return `Unknown action ${key}`;
  if (!issueFromAction(payload)) return 'Open an incident ticket or give its issue key, for example INC-12.';
  try {
    return await fn(payload);
  } catch (err) {
    return `Could not complete ${key}: ${err.message}`;
  }
}
