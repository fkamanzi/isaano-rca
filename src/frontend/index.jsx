// Isaano RCA issue panel (UI Kit). SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, Checkbox, DynamicTable, Heading, Inline, Label, Lozenge, SectionMessage, Select, Spinner, Stack,
  Tab, TabList, TabPanel, Tabs, Text, TextArea, Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const opts = (list) => (list || []).map((v) => ({ label: v, value: v }));
const short = (iso) => (iso ? iso.replace('T', ' ').replace(/(\.\d+)?Z$/, ' UTC') : 'n/a');
const mins = (m) => (m === null || m === undefined ? 'n/a' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
// head: list of [label, width %]
const table = (head, rows) => ({
  head: { cells: head.map(([h, w], i) => ({ key: `h${i}`, content: h, width: w })) },
  rows: rows.map((r, i) => ({ key: `r${i}`, cells: r.map((c, j) => ({ key: `c${i}-${j}`, content: c })) })),
});

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ev, setEv] = useState({ type: 'alarm', segment: 'RAN', source: '', at: '', summary: '', abnormal: true });
  const [fd, setFd] = useState({ kind: 'cause', text: '', confidence: 'Supported', evidence: '', counterfactual: '' });
  const [ac, setAc] = useState({ what: '', owner: '', due: '', verify: '' });
  const [notice, setNotice] = useState('');
  const [paste, setPaste] = useState('');
  // Text inputs are uncontrolled (remounted through a key to clear them): with native UI Kit
  // rendering, a controlled value can overwrite keystrokes that are still in flight.
  const [keys, setKeys] = useState({ ev: 0, fd: 0, ac: 0, up: 0, paste: 0 });
  const bump = (k) => setKeys((p) => ({ ...p, [k]: p[k] + 1 }));
  const [up, setUp] = useState({ id: '', confidence: '', evidence: '', counterfactual: '' });
  const [importResult, setImportResult] = useState(null);

  const call = async (name, payload) => {
    setBusy(true);
    setError('');
    try {
      const res = await invoke(name, payload);
      if (res && res.state) setData(res);
      return res;
    } catch (e) {
      setError(e.message || String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { call('load'); }, []);

  if (!data) return error ? <SectionMessage appearance="error" title="Could not load the RCA">{error}</SectionMessage> : <Spinner label="Loading the incident" />;

  const { metrics, timeline, firstDeviation, lock, state, options } = data;
  const remove = (id) => call('remove', { id });

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Lozenge appearance={lock.ok ? 'success' : 'removed'} isBold>{lock.ok ? 'Evidence lock: ready' : `Evidence lock: ${lock.errors.length} blocking`}</Lozenge>
        <Lozenge appearance="default">First response {mins(metrics.toFirstResponseMin)}</Lozenge>
        <Lozenge appearance="default">Time to restore {mins(metrics.toRestoreMin)}</Lozenge>
        <Lozenge appearance="inprogress">{state.evidence.length} evidence · {state.findings.length} findings · {state.actions.length} actions</Lozenge>
        {busy ? <Spinner size="small" /> : null}
      </Inline>
      {error ? <SectionMessage appearance="error">{error}</SectionMessage> : null}
      <SectionMessage appearance={firstDeviation.found ? (firstDeviation.tie ? 'warning' : 'discovery') : 'information'} title="First deviation">
        <Text>{firstDeviation.message}</Text>
      </SectionMessage>

      <Tabs id="rca-tabs">
        <TabList>
          <Tab>Timeline</Tab>
          <Tab>Evidence</Tab>
          <Tab>Findings</Tab>
          <Tab>Actions</Tab>
          <Tab>Publish</Tab>
        </TabList>

        <TabPanel>
          <Box padding="space.100">
            <DynamicTable {...table([['Time (UTC)', 24], ['Event', 50], ['Detail', 26]], timeline.map((e) => [short(e.at), e.label, e.detail || '']))} rowsPerPage={12} />
          </Box>
        </TabPanel>

        <TabPanel>
          <Stack space="space.150">
            <DynamicTable {...table([['ID', 5], ['Time (UTC)', 15], ['Segment', 11], ['Type', 8], ['What it shows', 38], ['Source', 15], ['', 8]],
              state.evidence.map((e) => [e.id, short(e.at), e.segment, e.abnormal ? `${e.type} ⚠` : e.type, e.summary, e.source,
                <Button appearance="subtle" onClick={() => remove(e.id)}>Remove</Button>]))} rowsPerPage={8} />
            <Heading size="small">Add evidence</Heading>
            <Inline space="space.100" shouldWrap>
              <Box><Label labelFor="ev-type">Type</Label><Select inputId="ev-type" options={opts(options.EVIDENCE_TYPES)} value={{ label: ev.type, value: ev.type }} onChange={(o) => setEv((p) => ({ ...p, type: o.value }))} /></Box>
              <Box><Label labelFor="ev-seg">Segment</Label><Select inputId="ev-seg" options={opts(options.SEGMENTS)} value={{ label: ev.segment, value: ev.segment }} onChange={(o) => setEv((p) => ({ ...p, segment: o.value }))} /></Box>
              <Box><Label labelFor="ev-at">Time (UTC)</Label><Textfield id="ev-at" placeholder="2026-11-17T08:42:00Z" key={`ev-at-${keys.ev}`} onChange={(e) => setEv((p) => ({ ...p, at: e.target.value }))} /></Box>
              <Box><Label labelFor="ev-src">Source</Label><Textfield id="ev-src" placeholder="alarm log of eNB-1042" key={`ev-source-${keys.ev}`} onChange={(e) => setEv((p) => ({ ...p, source: e.target.value }))} /></Box>
            </Inline>
            <Label labelFor="ev-sum">What it shows</Label>
            <TextArea id="ev-sum" placeholder="S1 link down to MME pool, 08:42:03 to 08:57:10" key={`ev-summary-${keys.ev}`} onChange={(e) => setEv((p) => ({ ...p, summary: e.target.value }))} />
            <Checkbox label="Shows a deviation (abnormal)" isChecked={ev.abnormal} onChange={(e) => setEv((p) => ({ ...p, abnormal: e.target.checked }))} />
            <Inline><Button appearance="primary" isDisabled={busy} onClick={async () => { const r = await call('addEvidence', ev); if (r) { setEv((p) => ({ ...p, at: '', summary: '', source: '' })); bump('ev'); } }}>Add evidence</Button></Inline>
            <Heading size="small">Paste rows from an export</Heading>
            <Text>One row per item, comma, semicolon or tab separated: {(options.IMPORT_COLUMNS || []).join(', ')}. Abnormal is yes or no; a header row is skipped.</Text>
            <TextArea id="ev-import" placeholder="2026-11-17T06:01:00Z, Transport, kpi, AGG-KGL-01 PM, EF queue drops 0% to 2.1%, yes" key={`paste-${keys.paste}`} onChange={(e) => setPaste(e.target.value)} />
            <Inline><Button isDisabled={busy || !paste.trim()} onClick={async () => {
              const r = await call('importEvidence', { text: paste });
              if (r) {
                setImportResult({ count: r.imported, errors: r.importErrors || [] });
                if (!(r.importErrors || []).length) { setPaste(''); bump('paste'); }
              }
            }}>Import rows</Button></Inline>
            {importResult ? (
              <SectionMessage appearance={importResult.errors.length ? 'warning' : 'success'} title={`${importResult.count} evidence item(s) imported`}>
                {importResult.errors.map((x, i) => <Text key={`ie${i}`}>{x}</Text>)}
              </SectionMessage>
            ) : null}
          </Stack>
        </TabPanel>

        <TabPanel>
          <Stack space="space.150">
            <DynamicTable {...table([['ID', 5], ['Kind', 11], ['Finding', 38], ['Confidence', 11], ['Evidence', 10], ['Counterfactual', 17], ['', 8]],
              state.findings.map((f) => [f.id, f.kind, f.text, f.confidence, f.evidence.join(', ') || 'none', f.counterfactual || '',
                <Button appearance="subtle" onClick={() => remove(f.id)}>Remove</Button>]))} rowsPerPage={8} />
            <Heading size="small">Add a finding</Heading>
            <Inline space="space.100" shouldWrap>
              <Box><Label labelFor="f-kind">Kind</Label><Select inputId="f-kind" options={opts(options.FINDING_KINDS)} value={{ label: fd.kind, value: fd.kind }} onChange={(o) => setFd((p) => ({ ...p, kind: o.value }))} /></Box>
              <Box><Label labelFor="f-conf">Confidence</Label><Select inputId="f-conf" options={opts(options.CONFIDENCE)} value={{ label: fd.confidence, value: fd.confidence }} onChange={(o) => setFd((p) => ({ ...p, confidence: o.value }))} /></Box>
              <Box><Label labelFor="f-ev">Evidence IDs</Label><Textfield id="f-ev" placeholder="E1, E3" key={`fd-evidence-${keys.fd}`} onChange={(e) => setFd((p) => ({ ...p, evidence: e.target.value }))} /></Box>
            </Inline>
            <Label labelFor="f-text">Finding</Label>
            <TextArea id="f-text" placeholder="Transport ring failover left the S1 path on a 1 Gbit/s backup link" key={`fd-text-${keys.fd}`} onChange={(e) => setFd((p) => ({ ...p, text: e.target.value }))} />
            <Label labelFor="f-cf">Counterfactual (needed for Proven)</Label>
            <Textfield id="f-cf" placeholder="Restoring the primary ring path cleared the S1 drops within 2 min" key={`fd-counterfactual-${keys.fd}`} onChange={(e) => setFd((p) => ({ ...p, counterfactual: e.target.value }))} />
            <Inline><Button appearance="primary" isDisabled={busy} onClick={async () => { const r = await call('addFinding', fd); if (r) { setFd((p) => ({ ...p, text: '', evidence: '', counterfactual: '' })); bump('fd'); } }}>Add finding</Button></Inline>
            {state.findings.length ? (
              <Stack space="space.100">
                <Heading size="small">Update a finding as evidence arrives</Heading>
                <Inline space="space.100" shouldWrap>
                  <Box><Label labelFor="u-id">Finding</Label><Select inputId="u-id" options={opts(state.findings.map((f) => f.id))} value={up.id ? { label: up.id, value: up.id } : null} onChange={(o) => setUp((p) => ({ ...p, id: o.value }))} /></Box>
                  <Box><Label labelFor="u-conf">New confidence</Label><Select inputId="u-conf" options={opts(options.CONFIDENCE)} value={up.confidence ? { label: up.confidence, value: up.confidence } : null} onChange={(o) => setUp((p) => ({ ...p, confidence: o.value }))} /></Box>
                  <Box><Label labelFor="u-ev">Evidence IDs (replace)</Label><Textfield id="u-ev" placeholder="E1, E2, E8" key={`up-evidence-${keys.up}`} onChange={(e) => setUp((p) => ({ ...p, evidence: e.target.value }))} /></Box>
                </Inline>
                <Label labelFor="u-cf">Counterfactual</Label>
                <Textfield id="u-cf" placeholder="Rolling back the change cleared the drops within 2 min" key={`up-counterfactual-${keys.up}`} onChange={(e) => setUp((p) => ({ ...p, counterfactual: e.target.value }))} />
                <Inline><Button isDisabled={busy || !up.id} onClick={async () => { const r = await call('updateFinding', up); if (r) { setUp({ id: '', confidence: '', evidence: '', counterfactual: '' }); bump('up'); } }}>Update finding</Button></Inline>
              </Stack>
            ) : null}
          </Stack>
        </TabPanel>

        <TabPanel>
          <Stack space="space.150">
            <DynamicTable {...table([['ID', 5], ['Action', 37], ['Owner', 16], ['Due', 11], ['Verified by', 23], ['', 8]],
              state.actions.map((a) => [a.id, a.what, a.owner, a.due, a.verify, <Button appearance="subtle" onClick={() => remove(a.id)}>Remove</Button>]))} rowsPerPage={8} />
            <Heading size="small">Add a corrective action</Heading>
            <Label labelFor="a-what">Action</Label>
            <Textfield id="a-what" key={`ac-what-${keys.ac}`} onChange={(e) => setAc((p) => ({ ...p, what: e.target.value }))} />
            <Inline space="space.100" shouldWrap>
              <Box><Label labelFor="a-owner">Owner</Label><Textfield id="a-owner" key={`ac-owner-${keys.ac}`} onChange={(e) => setAc((p) => ({ ...p, owner: e.target.value }))} /></Box>
              <Box><Label labelFor="a-due">Due</Label><Textfield id="a-due" placeholder="2026-11-24" key={`ac-due-${keys.ac}`} onChange={(e) => setAc((p) => ({ ...p, due: e.target.value }))} /></Box>
            </Inline>
            <Label labelFor="a-verify">Verification</Label>
            <Textfield id="a-verify" placeholder="No S1 drops for 7 days after the change" key={`ac-verify-${keys.ac}`} onChange={(e) => setAc((p) => ({ ...p, verify: e.target.value }))} />
            <Inline><Button appearance="primary" isDisabled={busy} onClick={async () => { const r = await call('addAction', ac); if (r) { setAc({ what: '', owner: '', due: '', verify: '' }); bump('ac'); } }}>Add action</Button></Inline>
          </Stack>
        </TabPanel>

        <TabPanel>
          <Stack space="space.150">
            {lock.errors.length ? (
              <SectionMessage appearance="error" title="Blocking: fix these before publishing">
                {lock.errors.map((x, i) => <Text key={`e${i}`}>{x}</Text>)}
              </SectionMessage>
            ) : <SectionMessage appearance="success" title="Every cause cites its evidence" />}
            {lock.warnings.length ? (
              <SectionMessage appearance="warning" title="Open items (published as such)">
                {lock.warnings.map((x, i) => <Text key={`w${i}`}>{x}</Text>)}
              </SectionMessage>
            ) : null}
            {state.publishedAt ? <Text>Last published {short(state.publishedAt)}</Text> : null}
            {notice ? <SectionMessage appearance="success">{notice}</SectionMessage> : null}
            <Inline>
              <Button appearance="primary" isDisabled={!lock.ok || busy} onClick={async () => {
                const r = await call('publish');
                if (r && r.published) setNotice('RCA posted to this ticket as an internal comment.');
              }}>Publish RCA to the ticket</Button>
            </Inline>
          </Stack>
        </TabPanel>
      </Tabs>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
