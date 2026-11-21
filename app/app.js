// Vice Atlas — GTA VI trophy guide and tracker.
// Loads app/data/trophies.json and app/data/guide.json, renders four hash-routed
// views (Tracker, Roadmap, Missables, Sources), and saves progress in localStorage.
// Every number in the audit bar is computed live from the loaded data.

const STORE_KEY = 'vice-atlas-progress-v1';
const COUNT_KEY = 'vice-atlas-counts-v1';
const SPOILER_KEY = 'vice-atlas-spoiler-v1';

const state = {
  trophies: [],
  guide: null,
  sources: [],
  earned: new Set(),
  counts: {},
  spoiler: false,
  kindFilter: 'all',
  gradeFilter: 'all',
  query: '',
  selectedId: null,
  official: null,
};

function loadStored() {
  try { state.earned = new Set(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')); } catch { state.earned = new Set(); }
  try { state.counts = JSON.parse(localStorage.getItem(COUNT_KEY) ?? '{}'); } catch { state.counts = {}; }
  state.spoiler = localStorage.getItem(SPOILER_KEY) === '1';
}

function saveProgress() {
  localStorage.setItem(STORE_KEY, JSON.stringify([...state.earned]));
}

function saveCounts() {
  localStorage.setItem(COUNT_KEY, JSON.stringify(state.counts));
}

function saveSpoiler() {
  localStorage.setItem(SPOILER_KEY, state.spoiler ? '1' : '0');
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function citeList(sourceNumbers) {
  return sourceNumbers.map((n) => '[' + n + ']').join(' ');
}

function gradeLabel(grade) {
  return { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }[grade] ?? grade;
}

function chapterLabel(chapter) {
  return chapter === 0 ? 'Free roam' : 'Chapter ' + chapter;
}

function flagOf(trophy) {
  if (trophy.missable) return 'possibly missable';
  if (trophy.unconfirmed) return 'at risk';
  return 'safe at any time';
}

// ---- Audit numbers, computed from the data, never typed in ----
// claims = every (step, source) citation instance across trophy guides + roadmap steps.
// backed = steps that cite two or more distinct sources.
function computeAudit() {
  let claims = 0;
  let backedSteps = 0;
  let totalSteps = 0;
  for (const t of state.trophies) {
    for (const s of t.steps ?? []) {
      totalSteps += 1;
      claims += s.sources.length;
      if (new Set(s.sources).size >= 2) backedSteps += 1;
    }
  }
  for (const stage of state.guide?.roadmap?.stages ?? []) {
    for (const s of stage.steps ?? []) {
      totalSteps += 1;
      claims += s.sources.length;
      if (new Set(s.sources).size >= 2) backedSteps += 1;
    }
  }
  const grades = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const t of state.trophies) grades[t.grade] = (grades[t.grade] ?? 0) + 1;
  const perSource = new Map();
  for (const t of state.trophies) {
    for (const s of t.steps ?? []) {
      for (const n of new Set(s.sources)) perSource.set(n, (perSource.get(n) ?? 0) + 1);
    }
  }
  return {
    total: state.trophies.length,
    claims,
    backedSteps,
    totalSteps,
    grades,
    hidden: state.trophies.filter((t) => t.hidden).length,
    missable: state.trophies.filter((t) => t.missable).length,
    atRisk: state.trophies.filter((t) => t.unconfirmed).length,
    disputes: state.trophies.filter((t) => t.dispute).length + (state.official?.listDispute ? 1 : 0),
    pages: state.sources.length,
    sites: new Set(state.sources.map((s) => s.site)).size,
    citedBySource: perSource,
  };
}

function renderAudit() {
  const a = computeAudit();
  const bar = document.getElementById('auditBar');
  bar.replaceChildren();
  const items = [
    ['List', a.total + '/55 vs official list'],
    ['Grades', a.grades.platinum + 'P · ' + a.grades.gold + 'G · ' + a.grades.silver + 'S · ' + a.grades.bronze + 'B'],
    ['Claims cited', a.claims + '/' + a.claims + ' cited'],
    ['Backed by 2+ sources', a.backedSteps + ' of ' + a.totalSteps + ' steps'],
    ['Pages read', String(a.pages)],
    ['Sites read', String(a.sites)],
    ['Read date', '21 Nov 2026'],
    ['Possibly missable', String(a.missable)],
    ['At risk (unconfirmed)', String(a.atRisk)],
    ['Disputes shown both ways', String(a.disputes)],
    ['Hidden on PSN', String(a.hidden)],
  ];
  for (const [label, value] of items) {
    const span = el('span', 'audit-item');
    if (label === 'Possibly missable' || label === 'At risk (unconfirmed)') span.classList.add('warn');
    span.append(el('span', null, label + ': '));
    span.append(el('b', null, value));
    bar.append(span);
  }
  state.audit = a;
}

function renderProgress() {
  const earned = state.earned.size;
  document.getElementById('earnedCount').textContent = String(earned);
  document.getElementById('progressFill').style.width = (earned / Math.max(1, state.trophies.length) * 100) + '%';
  const a = state.audit ?? computeAudit();
  const earnedGrades = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const t of state.trophies) if (state.earned.has(t.id)) earnedGrades[t.grade] += 1;
  document.getElementById('gradeBreakdown').textContent =
    earnedGrades.platinum + '/' + a.grades.platinum + ' Platinum · ' +
    earnedGrades.gold + '/' + a.grades.gold + ' Gold · ' +
    earnedGrades.silver + '/' + a.grades.silver + ' Silver · ' +
    earnedGrades.bronze + '/' + a.grades.bronze + ' Bronze';
}

// ---- Tabs, routed on location.hash ----
const TABS = ['tracker', 'roadmap', 'missables', 'sources'];

function currentTab() {
  const hash = (location.hash || '#tracker').slice(1);
  return TABS.includes(hash) ? hash : 'tracker';
}

function renderTabs() {
  const tab = currentTab();
  for (const name of TABS) {
    document.getElementById('view-' + name).hidden = name !== tab;
    document.querySelector('[data-tab="' + name + '"]').classList.toggle('active', name === tab);
  }
}

// ---- Tracker filters ----
const KIND_FILTERS = [
  ['all', 'All'], ['story', 'Story'], ['missable', 'Missable'], ['collectible', 'Collectibles'],
  ['activity', 'Activities'], ['online', 'Online'], ['hidden', 'PSN-hidden'],
  ['disputed', 'Disputed'], ['notearned', 'Not earned'],
];
const GRADE_FILTERS = [['all', 'All grades'], ['platinum', 'Platinum'], ['gold', 'Gold'], ['silver', 'Silver'], ['bronze', 'Bronze']];

function renderFilterButtons() {
  const kindBox = document.getElementById('kindFilters');
  kindBox.replaceChildren();
  for (const [value, label] of KIND_FILTERS) {
    const b = el('button', state.kindFilter === value ? 'active' : null, label);
    b.type = 'button';
    b.addEventListener('click', () => { state.kindFilter = value; renderFilterButtons(); renderList(); });
    kindBox.append(b);
  }
  const gradeBox = document.getElementById('gradeFilters');
  gradeBox.replaceChildren();
  for (const [value, label] of GRADE_FILTERS) {
    const b = el('button', state.gradeFilter === value ? 'active' : null, label);
    b.type = 'button';
    b.addEventListener('click', () => { state.gradeFilter = value; renderFilterButtons(); renderList(); });
    gradeBox.append(b);
  }
}

function trophyVisible(t) {
  if (state.gradeFilter !== 'all' && t.grade !== state.gradeFilter) return false;
  const k = state.kindFilter;
  if (k === 'story' && t.kind !== 'story') return false;
  if (k === 'missable' && !t.missable) return false;
  if (k === 'collectible' && t.kind !== 'collectible') return false;
  if (k === 'activity' && t.kind !== 'activity') return false;
  if (k === 'online' && t.kind !== 'online') return false;
  if (k === 'hidden' && !t.hidden) return false;
  if (k === 'disputed' && !t.dispute) return false;
  if (k === 'notearned' && state.earned.has(t.id)) return false;
  if (state.query) {
    const q = state.query.toLowerCase();
    const hay = (t.name + ' ' + t.description + ' ' + (t.guide ?? '')).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function displayName(t) {
  const earned = state.earned.has(t.id);
  if (state.spoiler && t.hidden && !earned) return 'Hidden trophy — earn it to reveal the name';
  return t.name;
}

function displayDescription(t) {
  const earned = state.earned.has(t.id);
  if (state.spoiler && t.hidden && !earned) return 'Hidden on PlayStation until earned.';
  return t.description;
}

function renderList() {
  const list = document.getElementById('trophyList');
  list.replaceChildren();
  const groups = [
    ['Chapter 1', (t) => t.chapter === 1],
    ['Chapter 2', (t) => t.chapter === 2],
    ['Chapter 3', (t) => t.chapter === 3],
    ['Chapter 4', (t) => t.chapter === 4],
    ['Chapter 5 — finale', (t) => t.chapter === 5],
    ['Free roam — any time', (t) => t.chapter === 0],
  ];
  let shown = 0;
  for (const [heading, match] of groups) {
    const members = state.trophies.filter((t) => match(t) && trophyVisible(t));
    if (!members.length) continue;
    shown += members.length;
    list.append(el('h3', null, heading + ' — ' + members.filter((t) => state.earned.has(t.id)).length + '/' + members.length + ' earned'));
    for (const t of members) {
      const row = el('div', 'trophy-row' + (state.earned.has(t.id) ? ' earned' : '') + (state.selectedId === t.id ? ' selected' : ''));
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = state.earned.has(t.id);
      box.setAttribute('aria-label', 'Mark ' + t.name + ' earned');
      box.addEventListener('click', (event) => {
        event.stopPropagation();
        if (box.checked) state.earned.add(t.id); else state.earned.delete(t.id);
        saveProgress();
        renderProgress();
        renderList();
        renderDetail();
      });
      row.append(box);
      const mid = el('div');
      const nameLine = el('div', 't-name', displayName(t));
      mid.append(nameLine);
      mid.append(el('div', 't-desc', displayDescription(t)));
      const meta = el('div', 't-meta');
      if (t.missable) meta.append(el('span', 'tag missable', 'Missable'));
      if (t.hidden) meta.append(el('span', 'tag hidden', 'PSN-hidden'));
      if (t.unconfirmed) meta.append(el('span', 'tag unconfirmed', 'Unconfirmed'));
      if (t.dispute) meta.append(el('span', 'tag disputed', 'Disputed'));
      const sourceCount = new Set((t.steps ?? []).flatMap((s) => s.sources)).size;
      meta.append(el('span', null, '#' + t.id + ' of 55 · ' + chapterLabel(t.chapter) + ' · ' + sourceCount + ' sources'));
      if (t.countTarget) meta.append(el('span', null, ' · ' + (state.counts[t.id] ?? 0) + '/' + t.countTarget + ' ' + (t.countLabel ?? '')));
      mid.append(meta);
      row.append(mid);
      row.append(el('span', 'grade-badge ' + t.grade, gradeLabel(t.grade)));
      row.addEventListener('click', () => { state.selectedId = t.id; renderList(); renderDetail(); });
      list.append(row);
    }
  }
  if (!shown) list.append(el('p', 'empty', 'No trophies match these filters.'));
}

// ---- Trophy detail ----
function sourceById(n) {
  return state.sources.find((s) => s.id === n);
}

function renderDetail() {
  const box = document.getElementById('trophyDetail');
  box.replaceChildren();
  const t = state.trophies.find((x) => x.id === state.selectedId);
  if (!t) {
    box.append(el('h2', null, 'Pick a trophy'));
    box.append(el('p', null, 'Choose a trophy on the left to see its full guide: the official description quoted verbatim, numbered steps with a source on every step, its count counter, its missable window, and — where the guides disagree — both versions and our call.'));
    const next = nextUp();
    if (next.length) {
      const wrap = el('div', 'next-up');
      wrap.append(el('h4', null, 'Next up · roadmap order'));
      const listEl = el('ol');
      for (const n of next) listEl.append(el('li', null, n.name + ' — #' + n.id + ' of 55'));
      wrap.append(listEl);
      box.append(wrap);
    }
    return;
  }
  const earned = state.earned.has(t.id);
  box.append(el('h2', null, displayName(t)));
  const facts = el('p', 'fact-line', gradeLabel(t.grade) + ' · #' + t.id + ' of 55 · ' + chapterLabel(t.chapter) + ' · ' + (t.hidden ? 'Hidden on PSN until earned' : 'Visible on PSN') + ' · ' + (earned ? 'Earned ✓' : 'Not earned yet'));
  box.append(facts);
  box.append(el('blockquote', null, '“' + displayDescription(t) + '” — official description, quoted verbatim.'));
  if (t.missable) {
    const banner = el('div', 'missable-banner', '⚠ POSSIBLY MISSABLE — ' + t.lastChance);
    box.append(banner);
  }
  if (t.unconfirmed) {
    box.append(el('div', 'unconfirmed-banner', 'UNCONFIRMED — no guide has proven this method yet. The steps below are our best read of the official description; treat them as a lead, not a certainty.'));
  }
  if (t.countTarget) {
    const counter = el('div', 'counter');
    counter.append(el('span', null, 'Count: '));
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(t.countTarget);
    input.value = String(state.counts[t.id] ?? 0);
    input.setAttribute('aria-label', 'Count for ' + t.name);
    input.addEventListener('change', () => {
      const value = Math.max(0, Math.min(t.countTarget, Number(input.value) || 0));
      state.counts[t.id] = value;
      saveCounts();
      if (value >= t.countTarget) { state.earned.add(t.id); saveProgress(); renderProgress(); }
      renderList();
    });
    counter.append(input);
    counter.append(el('span', null, ' / ' + t.countTarget + ' ' + (t.countLabel ?? '')));
    box.append(counter);
  }
  box.append(el('p', 'fact-line', 'Missable window / last chance: ' + t.lastChance));
  box.append(el('h3', null, 'How to earn it'));
  const steps = el('ol', 'steps');
  for (const s of t.steps ?? []) {
    const li = el('li', null, s.text + ' ');
    li.append(el('span', 'cite', citeList(s.sources)));
    steps.append(li);
  }
  box.append(steps);
  if (t.dispute) {
    const disputeBox = el('div', 'dispute-box');
    disputeBox.append(el('h4', null, 'Sources differ — both versions shown'));
    disputeBox.append(el('p', null, 'Version A: ' + t.dispute.a));
    disputeBox.append(el('p', null, 'Version B: ' + t.dispute.b));
    disputeBox.append(el('p', 'call', t.dispute.call));
    box.append(disputeBox);
  }
  const next = nextUp(t);
  if (next.length) {
    const wrap = el('div', 'next-up');
    wrap.append(el('h4', null, 'Next up · roadmap order'));
    const listEl = el('ol');
    for (const n of next) listEl.append(el('li', null, n.name + ' — #' + n.id + ' of 55'));
    wrap.append(listEl);
    box.append(wrap);
  }
  const usedSources = [...new Set((t.steps ?? []).flatMap((s) => s.sources))].sort((a, b) => a - b);
  const srcWrap = el('div', 'detail-sources');
  srcWrap.append(el('h4', null, 'Sources for this guide'));
  const srcList = el('ol');
  for (const n of usedSources) {
    const s = sourceById(n);
    if (!s) continue;
    const li = el('li');
    li.append(el('span', null, s.site + ' — ' + s.title + '. '));
    const link = el('a', 'src-url', s.url);
    link.href = s.url;
    li.append(link);
    li.append(el('span', null, ' Read ' + s.read + '.'));
    srcList.append(li);
  }
  srcWrap.append(srcList);
  box.append(srcWrap);
}

function nextUp(after) {
  const order = [...state.trophies].sort((a, b) => {
    const chapterOf = (t) => (t.chapter === 0 ? 6 : t.chapter);
    return chapterOf(a) - chapterOf(b) || a.id - b.id;
  });
  const pending = order.filter((t) => !state.earned.has(t.id));
  if (after) {
    const idx = pending.findIndex((t) => t.id === after.id);
    return pending.slice(Math.max(0, idx), idx + 4);
  }
  return pending.slice(0, 5);
}

// ---- Roadmap view ----
function renderRoadmap() {
  const roadmap = state.guide?.roadmap;
  if (!roadmap) return;
  const chips = document.getElementById('roadmapChips');
  chips.replaceChildren();
  for (const chip of roadmap.chips ?? []) {
    const c = el('span', 'chip');
    c.append(el('span', null, chip.label + ': '));
    c.append(el('b', null, chip.value + ' '));
    c.append(el('span', 'cite', citeList(chip.sources)));
    chips.append(c);
  }
  const note = document.getElementById('hoursNote');
  note.replaceChildren();
  const hn = roadmap.hoursNote;
  note.append(el('strong', null, 'How long? Both versions shown. '));
  note.append(el('span', null, hn.a + ' ' + hn.b + ' '));
  note.append(el('span', 'call', hn.call));
  const stagesBox = document.getElementById('roadmapStages');
  stagesBox.replaceChildren();
  for (const stage of roadmap.stages ?? []) {
    const box = el('div', 'stage');
    const earnedHere = state.trophies.filter((t) => (stage.trophies ?? '').includes(t.name) && state.earned.has(t.id)).length;
    const totalHere = (stage.trophies ?? '').split(',').filter(Boolean).length;
    box.append(el('h3', null, stage.name));
    box.append(el('p', null, ''));
    box.lastChild.textContent = stage.hours + ' · ' + earnedHere + '/' + totalHere + ' of this stage’s trophies earned';
    box.lastChild.className = 'hours';
    const steps = el('ol');
    for (const s of stage.steps ?? []) {
      const li = el('li', null, s.text + ' ');
      li.append(el('span', 'cite', citeList(s.sources)));
      steps.append(li);
    }
    box.append(steps);
    box.append(el('p', 'fact-line', 'Trophies in this stage: ' + (stage.trophies ?? '')));
    stagesBox.append(box);
  }
  const watch = document.getElementById('roadmapWatch');
  watch.replaceChildren();
  watch.append(el('h3', null, 'Missable watch — trophies to guard'));
  const listEl = el('ul');
  for (const t of state.trophies.filter((x) => x.missable || x.unconfirmed)) {
    const li = el('li');
    li.append(el('strong', null, t.name + ' — '));
    li.append(el('span', null, t.missable ? 'possibly missable. ' : 'unconfirmed method. '));
    li.append(el('span', null, 'Last chance: ' + t.lastChance));
    listEl.append(li);
  }
  watch.append(listEl);
}

// ---- Missables view ----
function renderMissables() {
  const body = document.querySelector('#missableTable tbody');
  body.replaceChildren();
  const sorted = [...state.trophies].sort((a, b) => {
    const rank = (t) => (t.missable ? 0 : t.unconfirmed ? 1 : 2);
    return rank(a) - rank(b) || a.id - b.id;
  });
  for (const t of sorted) {
    const tr = document.createElement('tr');
    const flag = flagOf(t);
    tr.append(el('td', flag === 'possibly missable' ? 'flag-missable' : flag === 'at risk' ? 'flag-risk' : 'flag-safe', flag));
    tr.append(el('td', null, t.name + (state.earned.has(t.id) ? ' ✓' : '')));
    tr.append(el('td', null, t.lastChance));
    body.append(tr);
  }
  const gates = document.getElementById('storyGates');
  gates.replaceChildren();
  for (const gate of state.guide?.roadmap?.storyGates ?? []) {
    const box = el('div', 'gate');
    box.append(el('h4', null, 'Chapter ' + gate.chapter));
    const missions = el('ul');
    for (const m of gate.missions) missions.append(el('li', null, m));
    box.append(missions);
    box.append(el('p', 'fact-line', 'Trophies here: ' + gate.trophies.join(', ')));
    gates.append(box);
  }
}

// ---- Sources view ----
function renderSources() {
  const a = state.audit ?? computeAudit();
  const stats = document.getElementById('sourceStats');
  stats.replaceChildren();
  const cards = [
    [String(a.pages), 'pages read'],
    [String(a.sites), 'sites read'],
    [String(a.claims), 'claims cited'],
    [String(a.backedSteps), 'steps backed by 2+ sources'],
    [String(a.disputes), 'disputes shown both ways'],
  ];
  for (const [value, label] of cards) {
    const card = el('div', 'stat-card');
    card.append(el('b', null, value));
    card.append(el('span', null, label));
    stats.append(card);
  }
  const listEl = document.getElementById('sourceList');
  listEl.replaceChildren();
  for (const s of state.sources) {
    const li = el('li');
    const citedCount = a.citedBySource.get(s.id) ?? 0;
    li.append(el('strong', null, '[' + s.id + '] ' + s.site + ' — ' + s.title + '. '));
    const link = el('a', 'src-url', s.url);
    link.href = s.url;
    li.append(link);
    li.append(el('span', null, ' Read ' + s.read + '. Cited by ' + citedCount + ' trophy steps.'));
    listEl.append(li);
  }
  if (state.official?.listDispute) {
    const disputeBox = el('div', 'dispute-box');
    disputeBox.append(el('h4', null, 'Sources differ — the grade split, both versions shown'));
    disputeBox.append(el('p', null, 'Version A: ' + state.official.listDispute.a));
    disputeBox.append(el('p', null, 'Version B: ' + state.official.listDispute.b));
    disputeBox.append(el('p', 'call', state.official.listDispute.call));
    listEl.after(disputeBox);
  }
  const matrix = document.getElementById('claimsMatrix');
  matrix.replaceChildren();
  const head = document.createElement('tr');
  head.append(el('th', null, 'Trophy'));
  for (const s of state.sources) head.append(el('th', null, '[' + s.id + ']'));
  head.append(el('th', null, 'Total'));
  matrix.append(head);
  for (const t of state.trophies) {
    const tr = document.createElement('tr');
    tr.append(el('td', null, t.name));
    let total = 0;
    for (const s of state.sources) {
      const count = (t.steps ?? []).reduce((n, step) => n + step.sources.filter((x) => x === s.id).length, 0);
      total += count;
      tr.append(el('td', 'num' + (count >= 4 ? ' hot' : ''), count ? String(count) : '·'));
    }
    tr.append(el('td', 'num', String(total)));
    matrix.append(tr);
  }
}

// ---- Export / import ----
function wireIO() {
  document.getElementById('exportBtn').addEventListener('click', () => {
    const payload = { app: 'vice-atlas', earned: [...state.earned], counts: state.counts, exported: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vice-atlas-progress.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('importFile').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const earned = Array.isArray(data) ? data : data.earned;
      if (!Array.isArray(earned)) throw new Error('bad file');
      state.earned = new Set(earned.filter((id) => state.trophies.some((t) => t.id === id)));
      if (data.counts && typeof data.counts === 'object') state.counts = data.counts;
      saveProgress();
      saveCounts();
      renderProgress();
      renderList();
      renderDetail();
      renderRoadmap();
    } catch {
      alert('That file is not a Vice Atlas progress export.');
    }
    event.target.value = '';
  });
  const spoiler = document.getElementById('spoilerToggle');
  spoiler.checked = state.spoiler;
  spoiler.addEventListener('change', () => {
    state.spoiler = spoiler.checked;
    saveSpoiler();
    renderList();
    renderDetail();
  });
  document.getElementById('searchBox').addEventListener('input', (event) => {
    state.query = event.target.value.trim();
    renderList();
  });
}

// ---- Boot ----
async function boot() {
  loadStored();
  const [trophyDoc, guideDoc] = await Promise.all([
    (await fetch('data/trophies.json')).json(),
    (await fetch('data/guide.json')).json(),
  ]);
  state.trophies = trophyDoc.trophies;
  state.official = trophyDoc;
  state.guide = guideDoc;
  state.sources = guideDoc.sources;
  state.selectedId = 28;
  // A shareable link can pre-check trophies: ?earned=2,3,28 checks those
  // trophies for this visit without touching the saved progress.
  const shared = new URLSearchParams(location.search).get('earned');
  if (shared) {
    for (const raw of shared.split(',')) {
      const id = Number(raw);
      if (state.trophies.some((t) => t.id === id)) state.earned.add(id);
    }
  }
  renderAudit();
  renderProgress();
  renderFilterButtons();
  renderList();
  renderDetail();
  renderRoadmap();
  renderMissables();
  renderSources();
  renderTabs();
  wireIO();
  window.addEventListener('hashchange', renderTabs);
}

boot();

