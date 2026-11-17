// Unit tests for the RCA logic: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAction, addEvidence, addFinding, checkLock, emptyState, firstDeviation, metrics, removeItem,
  reportAdf, reportMarkdown, timeline, toIso,
} from '../src/lib/rca.js';

const issue = {
  id: '10042',
  key: 'INC-7',
  fields: {
    summary: 'Voice and data down for 31 sites in Kigali North',
    created: '2026-11-17T10:44:00.000+0200',
    resolutiondate: '2026-11-17T11:31:00.000+0200',
    resolution: { name: 'Done' },
    status: { name: 'Resolved' },
    priority: { name: 'Highest' },
    comment: {
      comments: [
        { created: '2026-11-17T10:49:00.000+0200', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'NOC: S1 drops on 31 eNBs' }] }] } },
        { created: '2026-11-17T11:30:00.000+0200', body: 'Primary ring restored' },
      ],
    },
  },
  changelog: {
    histories: [
      { created: '2026-11-17T10:47:00.000+0200', items: [{ field: 'status', fromString: 'Open', toString: 'In Progress' }] },
      { created: '2026-11-17T11:31:00.000+0200', items: [{ field: 'status', fromString: 'In Progress', toString: 'Resolved' }] },
    ],
  },
};

function demoState() {
  const s = emptyState();
  addEvidence(s, { type: 'alarm', segment: 'Transport', source: 'MW ring R7 NMS', at: '2026-11-17T08:38:10Z', summary: 'Ring R7 protection switch to 1G backup', abnormal: true });
  addEvidence(s, { type: 'alarm', segment: 'RAN', source: 'eNB alarm log', at: '2026-11-17T08:42:03Z', summary: 'S1 link down on 31 eNBs', abnormal: true });
  addEvidence(s, { type: 'kpi', segment: 'Core', source: 'MME KPI', at: '2026-11-17T08:43:00Z', summary: 'Attach success 99.6% to 71%', abnormal: true });
  addEvidence(s, { type: 'change', segment: 'Transport', source: 'Change calendar', at: '2026-11-17T08:30:00Z', summary: 'Fibre works on ring R7 span 3', abnormal: false });
  return s;
}

test('timestamps with +0200 offsets become UTC ISO', () => {
  assert.equal(toIso('2026-11-17T10:44:00.000+0200'), '2026-11-17T08:44:00.000Z');
  assert.equal(toIso('nonsense'), null);
});

test('metrics: first response and time to restore from the ticket', () => {
  const m = metrics(issue);
  assert.equal(m.toFirstResponseMin, 3);   // status change at 10:47 local
  assert.equal(m.toRestoreMin, 47);
});

test('timeline merges ticket events and evidence in UTC order', () => {
  const tl = timeline(issue, demoState());
  const times = tl.map((e) => e.at);
  assert.deepEqual([...times].sort(), times);
  assert.equal(tl[0].label.startsWith('E4'), true);   // 08:30 change record comes first
  assert.ok(tl.some((e) => e.label === 'Ticket created'));
  assert.ok(tl.some((e) => e.label === 'Resolved'));
});

test('first deviation is the earliest abnormal segment; ties are not ordered', () => {
  const s = demoState();
  const fd = firstDeviation(s);
  assert.equal(fd.segment, 'Transport');
  assert.equal(fd.evidenceId, 'E1');
  assert.equal(fd.tie, false);
  const t = emptyState();
  addEvidence(t, { type: 'alarm', segment: 'RAN', source: 'a', at: '2026-11-17T08:42:03Z', summary: 'x', abnormal: true });
  addEvidence(t, { type: 'alarm', segment: 'Core', source: 'b', at: '2026-11-17T08:42:40Z', summary: 'y', abnormal: true });
  assert.equal(firstDeviation(t).tie, true);
  assert.equal(firstDeviation(emptyState()).found, false);
});

test('evidence lock blocks uncited, unproven-as-proven and owner-less items', () => {
  const s = demoState();
  addFinding(s, { kind: 'cause', text: 'Ring R7 ran on the 1G backup after the span 3 cut', confidence: 'Proven', evidence: 'E1, E4' });
  let lock = checkLock(s, issue);
  assert.equal(lock.ok, false);
  assert.ok(lock.errors.some((e) => /counterfactual/.test(e)));
  s.findings[0].counterfactual = 'Restoring span 3 cleared the S1 drops within 2 min';
  addFinding(s, { kind: 'contributing', text: 'Backup link too small for peak', confidence: 'Supported', evidence: '' });
  lock = checkLock(s, issue);
  assert.ok(lock.errors.some((e) => /F2 is Supported but cites no evidence/.test(e)));
  removeItem(s, 'F2');
  addFinding(s, { kind: 'contributing', text: 'Backup link too small for peak', confidence: 'Supported', evidence: 'E3' });
  addAction(s, { what: 'Upgrade the R7 backup to 10G', owner: '', due: '' });
  lock = checkLock(s, issue);
  assert.ok(lock.errors.some((e) => /owner and a due date/.test(e)));
  s.actions[0].owner = 'Transport team';
  s.actions[0].due = '2026-12-01';
  s.actions[0].verify = 'No S1 drops on the next protection switch';
  lock = checkLock(s, issue);
  assert.equal(lock.ok, true, lock.errors.join('; '));
});

test('removing evidence removes its citations', () => {
  const s = demoState();
  addFinding(s, { kind: 'cause', text: 'x', confidence: 'Supported', evidence: 'E2,E3' });
  removeItem(s, 'E3');
  assert.deepEqual(s.findings[0].evidence, ['E2']);
});

test('report has ten sections in Markdown and valid ADF', () => {
  const s = demoState();
  addFinding(s, { kind: 'cause', text: 'Ring R7 on backup', confidence: 'Supported', evidence: 'E1' });
  const md = reportMarkdown(issue, s);
  assert.equal((md.match(/^## /gm) || []).length, 10);
  assert.match(md, /\[E1\]/);
  const adf = reportAdf(issue, s);
  assert.equal(adf.type, 'doc');
  const headings = adf.content.filter((n) => n.type === 'heading' && n.attrs.level === 3);
  assert.equal(headings.length, 10);
  for (const n of adf.content.filter((x) => x.type === 'bulletList')) {
    for (const li of n.content) assert.ok(li.content[0].content[0].text.length > 0);
  }
});

test('bad input is refused with a clear message', () => {
  const s = emptyState();
  assert.throws(() => addEvidence(s, { at: 'yesterday', summary: 'x' }), /UTC/);
  assert.throws(() => addFinding(s, { text: '' }), /State the finding/);
});
