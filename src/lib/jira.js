// Jira REST calls, made as the user so their permissions apply.
// SPDX-License-Identifier: Apache-2.0
import api, { route } from '@forge/api';

const FIELDS = 'summary,created,resolutiondate,resolution,status,priority,issuetype,comment';

export async function getIssue(issueKeyOrId) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKeyOrId}?expand=changelog&fields=${FIELDS}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jira returned ${res.status} for ${issueKeyOrId}`);
  return res.json();
}

// Internal comment on Jira Service Management tickets (customers do not see it).
export async function addInternalComment(issueKeyOrId, adfBody) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKeyOrId}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: adfBody, properties: [{ key: 'sd.public.comment', value: { internal: true } }] }),
  });
  if (!res.ok) throw new Error(`Jira returned ${res.status} when adding the RCA comment`);
  return res.json();
}
