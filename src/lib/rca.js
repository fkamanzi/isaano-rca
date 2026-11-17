// Isaano RCA: pure logic, no Forge calls, so it can be unit tested anywhere.
// Builds the incident timeline from a Jira issue, keeps the evidence register,
// finds the first deviating network segment, enforces the evidence lock and
// renders the RCA report (Markdown for Rovo and MCP, ADF for the Jira comment).
// SPDX-License-Identifier: Apache-2.0

export const EVIDENCE_TYPES = ['alarm', 'kpi', 'log', 'trace', 'change', 'field'];
export const SEGMENTS = ['RAN', 'Transport', 'Core', 'IMS / voice', 'Services', 'Cloud', 'Site power', 'Other'];
export const FINDING_KINDS = ['cause', 'contributing', 'excluded'];
export const CONFIDENCE = ['Proven', 'Supported', 'Unproven'];
export const TIE_WINDOW_S = 60;

export function emptyState() {
  return { version: 1, evidence: [], findings: [], actions: [], next: { E: 1, F: 1, A: 1 } };
}

// Jira writes offsets as +0200; make every timestamp strict ISO 8601 first.
export function toIso(value) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function minutesBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((Date.parse(b) - Date.parse(a)) / 60000);
}

export function formatMinutes(m) {
  if (m === null || m === undefined) return 'n/a';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function clip(s, n) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// Plain text of an Atlassian Document Format node (comment bodies).
export function adfText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(adfText).join(node.type === 'paragraph' ? '' : ' ');
}

// Ticket events from the issue, its changelog and comments.
export function ticketEvents(issue) {
  const f = issue?.fields || {};
  const out = [];
  const created = toIso(f.created);
  if (created) out.push({ at: created, source: 'ticket', label: 'Ticket created', detail: clip(f.summary, 120) });
  for (const h of issue?.changelog?.histories || []) {
    const at = toIso(h.created);
    for (const item of h.items || []) {
      if (item.field === 'status' && at) {
        out.push({ at, source: 'ticket', label: `Status: ${item.fromString} → ${item.toString}`, detail: h.author?.displayName || '' });
      }
      if (item.field === 'priority' && at) {
        out.push({ at, source: 'ticket', label: `Priority: ${item.fromString} → ${item.toString}`, detail: h.author?.displayName || '' });
      }
    }
  }
  const comments = f.comment?.comments || [];
  comments.forEach((c, i) => {
    const at = toIso(c.created);
    if (at && (i === 0 || i === comments.length - 1)) {
      out.push({ at, source: 'ticket', label: i === 0 ? 'First comment' : 'Latest comment', detail: clip(adfText(c.body), 120) });
    }
  });
  const resolved = toIso(f.resolutiondate);
  if (resolved) out.push({ at: resolved, source: 'ticket', label: 'Resolved', detail: f.resolution?.name || '' });
  return out;
}

export function metrics(issue) {
  const f = issue?.fields || {};
  const created = toIso(f.created);
  const resolved = toIso(f.resolutiondate);
  let firstResponse = null;
  for (const e of ticketEvents(issue)) {
    if (e.label === 'First comment' || e.label.startsWith('Status:')) {
      if (!firstResponse || e.at < firstResponse) firstResponse = e.at;
    }
  }
  return {
    created,
    resolved,
    toFirstResponseMin: minutesBetween(created, firstResponse),
    toRestoreMin: minutesBetween(created, resolved),
  };
}

export function timeline(issue, state) {
  const ev = (state?.evidence || []).map((e) => ({
    at: e.at,
    source: 'evidence',
    label: `${e.id} ${e.abnormal ? '⚠ ' : ''}${e.segment} ${e.type}: ${clip(e.summary, 90)}`,
    detail: e.source,
  }));
  return [...ticketEvents(issue), ...ev].filter((e) => e.at).sort((a, b) => a.at.localeCompare(b.at));
}

// Earliest abnormal evidence per segment. If the two earliest segments are within
// the tie window, the order cannot be proven at the evidence granularity.
export function firstDeviation(state, tieWindowS = TIE_WINDOW_S) {
  const abnormal = (state?.evidence || []).filter((e) => e.abnormal && e.at).sort((a, b) => a.at.localeCompare(b.at));
  if (!abnormal.length) return { found: false, message: 'No abnormal evidence yet: mark the evidence items that show a deviation.' };
  const perSegment = [];
  for (const e of abnormal) if (!perSegment.find((p) => p.segment === e.segment)) perSegment.push(e);
  const first = perSegment[0];
  const second = perSegment[1];
  const gapS = second ? (Date.parse(second.at) - Date.parse(first.at)) / 1000 : null;
  const tie = second !== undefined && gapS <= tieWindowS;
  return {
    found: true,
    segment: first.segment,
    evidenceId: first.id,
    at: first.at,
    order: perSegment.map((p) => ({ segment: p.segment, evidenceId: p.id, at: p.at })),
    tie,
    message: tie
      ? `${first.segment} (${first.id}) and ${second.segment} (${second.id}) deviate within ${Math.round(gapS)} s of each other: the order is not provable at this granularity, so check shared resources first.`
      : `First deviation: ${first.segment} at ${first.at.replace('.000Z', 'Z')} (${first.id})${second ? `, ${Math.round(gapS)} s before ${second.segment} (${second.id})` : ''}. Analyse ${first.segment} first; later segments carry the symptom until evidence shows otherwise.`,
  };
}

// The evidence lock: what must be true before the RCA can be published.
export function checkLock(state, issue) {
  const errors = [];
  const warnings = [];
  const ids = new Set((state?.evidence || []).map((e) => e.id));
  const findings = state?.findings || [];
  if (!findings.some((f) => f.kind === 'cause')) errors.push('No root cause recorded yet.');
  for (const f of findings) {
    const cited = (f.evidence || []).filter((id) => ids.has(id));
    const missing = (f.evidence || []).filter((id) => !ids.has(id));
    if (missing.length) errors.push(`${f.id} cites evidence that does not exist: ${missing.join(', ')}.`);
    if ((f.confidence === 'Proven' || f.confidence === 'Supported') && cited.length === 0) {
      errors.push(`${f.id} is ${f.confidence} but cites no evidence.`);
    }
    if (f.confidence === 'Proven') {
      const abnormal = cited.filter((id) => state.evidence.find((e) => e.id === id)?.abnormal);
      if (!abnormal.length) errors.push(`${f.id} is Proven but none of its evidence shows a deviation.`);
      if (!String(f.counterfactual || '').trim()) errors.push(`${f.id} is Proven without a counterfactual (what changed when the cause was removed).`);
    }
    if (f.kind === 'cause' && f.confidence === 'Unproven') warnings.push(`${f.id} is still a hypothesis: it will be published as unproven.`);
  }
  for (const e of state?.evidence || []) {
    if (!toIso(e.at)) errors.push(`${e.id} has no valid UTC time.`);
  }
  const actions = state?.actions || [];
  if (!actions.length) warnings.push('No corrective action yet.');
  for (const a of actions) {
    if (!String(a.owner || '').trim() || !String(a.due || '').trim()) errors.push(`${a.id} needs an owner and a due date.`);
    if (!String(a.verify || '').trim()) warnings.push(`${a.id} has no verification step.`);
  }
  if (issue && !toIso(issue.fields?.resolutiondate)) warnings.push('The ticket is not resolved yet: time to restore is open.');
  return { ok: errors.length === 0, errors, warnings };
}

function idCounter(state, letter) {
  state.next = state.next || { E: 1, F: 1, A: 1 };
  const n = state.next[letter] || 1;
  state.next[letter] = n + 1;
  return `${letter}${n}`;
}

export function addEvidence(state, input, who) {
  const at = toIso(input.at);
  if (!at) throw new Error('Give the evidence time in UTC, for example 2026-11-17T08:42:00Z.');
  if (!String(input.summary || '').trim()) throw new Error('Describe what the evidence shows.');
  const item = {
    id: idCounter(state, 'E'),
    type: EVIDENCE_TYPES.includes(input.type) ? input.type : 'log',
    segment: SEGMENTS.includes(input.segment) ? input.segment : 'Other',
    source: clip(input.source || 'unspecified', 120),
    at,
    abnormal: input.abnormal === true || input.abnormal === 'true',
    summary: clip(input.summary, 400),
    link: clip(input.link || '', 300),
    addedBy: who || null,
  };
  state.evidence.push(item);
  return item;
}

export function parseIds(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
  return String(value || '').split(/[\s,;]+/).map((v) => v.trim().toUpperCase()).filter(Boolean);
}

export function addFinding(state, input) {
  if (!String(input.text || '').trim()) throw new Error('State the finding.');
  const item = {
    id: idCounter(state, 'F'),
    kind: FINDING_KINDS.includes(input.kind) ? input.kind : 'cause',
    text: clip(input.text, 400),
    confidence: CONFIDENCE.includes(input.confidence) ? input.confidence : 'Unproven',
    evidence: parseIds(input.evidence),
    counterfactual: clip(input.counterfactual || '', 300),
  };
  state.findings.push(item);
  return item;
}

export function addAction(state, input) {
  if (!String(input.what || '').trim()) throw new Error('Describe the action.');
  const item = {
    id: idCounter(state, 'A'),
    what: clip(input.what, 300),
    owner: clip(input.owner || '', 80),
    due: clip(input.due || '', 20),
    verify: clip(input.verify || '', 200),
  };
  state.actions.push(item);
  return item;
}

export function removeItem(state, id) {
  const key = { E: 'evidence', F: 'findings', A: 'actions' }[String(id).charAt(0)];
  if (!key) return false;
  const before = state[key].length;
  state[key] = state[key].filter((x) => x.id !== id);
  if (key === 'evidence') for (const f of state.findings) f.evidence = f.evidence.filter((e) => e !== id);
  return state[key].length < before;
}

// ---------------------------------------------------------------- report
function sections(issue, state) {
  const f = issue?.fields || {};
  const m = metrics(issue);
  const fd = firstDeviation(state);
  const lock = checkLock(state, issue);
  const byKind = (k) => (state.findings || []).filter((x) => x.kind === k);
  const cite = (x) => (x.evidence?.length ? ` [${x.evidence.join(', ')}]` : '');
  const causes = byKind('cause');
  return [
    ['Summary', [`${issue?.key || ''} ${f.summary || ''}`.trim(),
      causes.length ? `Root cause: ${causes.map((c) => `${c.text} (${c.confidence})${cite(c)}`).join('; ')}` : 'Root cause: not established yet.']],
    ['Impact and timing', [
      `Priority: ${f.priority?.name || 'n/a'}; status: ${f.status?.name || 'n/a'}`,
      `Time to first response: ${formatMinutes(m.toFirstResponseMin)}; time to restore: ${formatMinutes(m.toRestoreMin)}`]],
    ['Timeline (UTC)', timeline(issue, state).map((e) => `${e.at.replace('.000Z', 'Z')}  ${e.label}${e.detail ? ` (${clip(e.detail, 60)})` : ''}`)],
    ['First deviation', [fd.message]],
    ['Root cause', causes.length ? causes.map((c) => `${c.id} ${c.text}: ${c.confidence}${cite(c)}${c.counterfactual ? `. Counterfactual: ${c.counterfactual}` : ''}`) : ['None recorded.']],
    ['Contributing factors', byKind('contributing').length ? byKind('contributing').map((c) => `${c.id} ${c.text}: ${c.confidence}${cite(c)}`) : ['None recorded.']],
    ['Excluded hypotheses', byKind('excluded').length ? byKind('excluded').map((c) => `${c.id} ${c.text}${cite(c)}`) : ['None recorded.']],
    ['Corrective actions', (state.actions || []).length ? state.actions.map((a) => `${a.id} ${a.what}; owner ${a.owner || 'n/a'}; due ${a.due || 'n/a'}${a.verify ? `; verified by: ${a.verify}` : ''}`) : ['None recorded.']],
    ['Evidence register', (state.evidence || []).length ? state.evidence.map((e) => `${e.id} ${e.at.replace('.000Z', 'Z')} ${e.segment} ${e.type}${e.abnormal ? ' (deviation)' : ''}: ${e.summary} (source: ${e.source})`) : ['None recorded.']],
    ['Open items', [...lock.errors.map((x) => `Blocking: ${x}`), ...lock.warnings].length ? [...lock.errors.map((x) => `Blocking: ${x}`), ...lock.warnings] : ['None: every cause cites its evidence.']],
  ];
}

export function reportMarkdown(issue, state) {
  const parts = [`# RCA ${issue?.key || ''}`.trim()];
  sections(issue, state).forEach(([title, lines], i) => {
    parts.push(`\n## ${i + 1}. ${title}`);
    for (const l of lines) parts.push(`- ${l}`);
  });
  parts.push('\nGenerated by Isaano RCA: every cause cites its evidence.');
  return parts.join('\n');
}

const t = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text });

export function reportAdf(issue, state) {
  const content = [{ type: 'heading', attrs: { level: 2 }, content: [t(`RCA ${issue?.key || ''}`.trim())] }];
  sections(issue, state).forEach(([title, lines], i) => {
    content.push({ type: 'heading', attrs: { level: 3 }, content: [t(`${i + 1}. ${title}`)] });
    content.push({
      type: 'bulletList',
      content: lines.map((l) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [t(String(l) || ' ')] }] })),
    });
  });
  content.push({ type: 'paragraph', content: [t('Generated by Isaano RCA: every cause cites its evidence.', [{ type: 'em' }])] });
  return { type: 'doc', version: 1, content };
}
