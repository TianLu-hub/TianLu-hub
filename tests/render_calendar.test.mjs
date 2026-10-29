import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMonthlyCalendars } from '../scripts/render_calendar.mjs';

function fixture(overrides = {}) {
  return { username: 'TianLu-hub', generatedAt: '2024-03-01T01:00:00Z', from: '2024-02-01', to: '2024-02-29', days: [], ...overrides };
}

function getCell(svg, date) {
  return svg.match(new RegExp(`<g data-date="${date}"[\\s\\S]*?<\\/g>`))?.[0];
}

test('renders leap day with correct Thursday alignment and 13 calendar months plus 12 heading labels', () => {
  const files = renderMonthlyCalendars(fixture({ days: [{ date: '2024-02-29', commits: 3 }] }));
  assert.equal(files.size, 25);
  assert.match(files.get('current.svg'), /February 2024/);
  assert.match(getCell(files.get('current.svg'), '2024-02-29'), /data-column="4" data-row="4"/);
  assert.equal(getCell(files.get('current.svg'), '2024-02-30'), undefined);
  assert.match(files.get('previous-01.svg'), /January 2024/);
  assert.match(files.get('previous-12.svg'), /February 2023/);
  assert.match(files.get('label-01.svg'), /January 2024/);
  assert.match(files.get('label-12.svg'), /February 2023/);
});

test('keeps available zero, missing data, and future dates distinct without inventing counts', () => {
  const files = renderMonthlyCalendars(fixture({ from: '2026-10-26', to: '2026-10-28', days: [
    { date: '2026-10-26', commits: 0, contributions: 2 },
    { date: '2026-10-28', commits: 4, contributions: 9 },
  ] }));
  const svg = files.get('current.svg');
  assert.match(getCell(svg, '2026-10-26'), /data-status="available"/);
  assert.match(getCell(svg, '2026-10-26'), />0<\/text>/);
  assert.match(getCell(svg, '2026-10-27'), /data-status="unavailable"/);
  assert.match(getCell(svg, '2026-10-27'), />—<\/text>/);
  assert.match(getCell(svg, '2026-10-29'), /data-status="future"/);
  assert.match(getCell(svg, '2026-10-29'), />—<\/text>/);
  assert.match(svg, />4 commits<\/text>/);
  assert.match(svg, /2 of 31 dates available; 4 recorded public commits/);
});

test('preserves six-week months and Sunday-first placement across a year boundary', () => {
  const files = renderMonthlyCalendars(fixture({ from: '2025-01-01', to: '2026-01-01' }));
  assert.match(files.get('previous-01.svg'), /December 2025/);
  const march = files.get('previous-10.svg');
  assert.match(march, /March 2025/);
  assert.match(getCell(march, '2025-03-01'), /data-column="6" data-row="0"/);
  assert.match(getCell(march, '2025-03-30'), /data-column="0" data-row="5"/);
  assert.match(getCell(march, '2025-03-31'), /data-column="1" data-row="5"/);
  assert.match(march, /viewBox="0 0 900 934"/);
});

test('escapes untrusted text and emits static self-contained images only', () => {
  const files = renderMonthlyCalendars(fixture({ username: '<script>&"\'' }));
  for (const svg of files.values()) {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.doesNotMatch(svg, /<script|<foreignObject|<animate|\bon\w+=|(?:href|src)=/);
  }
  assert.match(files.get('current.svg'), /&lt;script&gt;&amp;&quot;&apos;/);
});

test('rejects dates or counts that could silently misrepresent the data', () => {
  for (const day of [{ date: '2024-02-30', commits: 0 }, { date: '2024-03-01', commits: 0 },
    { date: '2024-02-01', commits: -1 }, { date: '2024-02-01', commits: 1.5 }]) {
    assert.throws(() => renderMonthlyCalendars(fixture({ days: [day] })), /Monthly calendar:/);
  }
  assert.throws(() => renderMonthlyCalendars(fixture({ days: [
    { date: '2024-02-01', commits: 0 }, { date: '2024-02-01', commits: 1 },
  ] })), /duplicate date/);
});
