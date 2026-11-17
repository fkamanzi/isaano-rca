// Per-issue RCA state in Forge storage (KVS): data stays on Atlassian.
// SPDX-License-Identifier: Apache-2.0
import { kvs } from '@forge/kvs';
import { emptyState } from './rca.js';

const key = (issueId) => `rca-${issueId}`;

export async function loadState(issueId) {
  const s = await kvs.get(key(issueId));
  return s && s.version ? s : emptyState();
}

export async function saveState(issueId, state) {
  await kvs.set(key(issueId), state);
  return state;
}
