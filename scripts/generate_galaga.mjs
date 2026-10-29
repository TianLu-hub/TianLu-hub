// Render the real GitHub contribution calendar with the pinned upstream library.
// The upstream action wrapper is intentionally not used; this calls no analytics.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchCalendarData } from './calendar_data.mjs';

const username = 'TianLu-hub';
const upstreamCommit = '7332e1de7903ab780c3692a4127a59cc13872daa';
const expectedHash = 'cf182ee29d0e2bb65f961861fc5ab07585b2b3c54ca34421d4aac8c8dcf1c4f0';
const modulePath = process.argv[2];
const outputPath = resolve(process.argv[3] || 'dist');
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required for the real contribution calendar.');
if (!modulePath) throw new Error('Pass the path to the pinned arcade.mjs library.');
const moduleBytes = await readFile(modulePath);
if (createHash('sha256').update(moduleBytes).digest('hex') !== expectedHash) {
  throw new Error('Upstream renderer checksum mismatch.');
}

const { ArcadeRenderer } = await import(pathToFileURL(resolve(modulePath)).href);
let svg = '';
const renderer = new ArcadeRenderer({
  game: 'galaga',
  platform: 'github',
  username,
  gameTheme: 'github-dark',
  showMonthLabels: false,
  githubSettings: { accessToken: token },
  svgCallback: (value) => { svg = value; },
  gameOverCallback: () => {},
  pointsIncreasedCallback: () => {},
});
const store = await renderer.start();
const days = store.contributions.map(({ date, count, level }) => ({
  date: new Date(date).toISOString().slice(0, 10), count, level,
})).sort((a, b) => a.date.localeCompare(b.date));
const levels = new Set(['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE']);
if (days.length < 350 || days.length > 372 || new Set(days.map(d => d.date)).size !== days.length) {
  throw new Error('Expected a complete, unique year of GitHub contribution dates.');
}
if (days.some(d => !Number.isSafeInteger(d.count) || d.count < 0 || !levels.has(d.level))) {
  throw new Error('Invalid GitHub contribution counts or levels.');
}
if (Date.now() - Date.parse(days.at(-1).date) > 3 * 86400000) {
  throw new Error('Contribution calendar is out of date.');
}
if (!svg.includes('<svg') || !/<animate(?:Transform)?\b/.test(svg) || Buffer.byteLength(svg) > 10 * 1024 * 1024) {
  throw new Error('Expected a bounded animated SVG.');
}
if (/<script\b|<foreignObject\b|\son[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:)/i.test(svg)) {
  throw new Error('Unexpected active or external SVG content.');
}

// Keep the calendar visible when cells are empty or have been cleared by the ship.
// Only recolor the pinned renderer's calendar cells, leaving sprites and timing intact.
const emptyCellColor = '#3b424c';
let calendarCells = 0;
svg = svg.replace(/<rect x="[^"]+" y="[^"]+" width="20" height="20" rx="3" fill="transparent">[\s\S]*?<\/rect>/g, cell => {
  calendarCells += 1;
  return cell.replaceAll('transparent', emptyCellColor);
});
if (calendarCells !== 53 * 7) {
  throw new Error('Unexpected Galaga calendar layout; refusing to publish incomplete styling.');
}

// Put readable calendar axes around the original animation without moving its sprites.
const monthLabels = store.monthLabels.flatMap((label, column) => label ? [{ label, column }] : []);
if (store.monthLabels.length !== 53 || monthLabels.some(({ label }) => !/^[A-Za-z]{3}$/.test(label))) {
  throw new Error('Unexpected Galaga month labels.');
}
// A one- or two-week opening month has too little room for a separate label.
const visibleMonths = monthLabels.filter((month, index) =>
  index !== 0 || !monthLabels[1] || monthLabels[1].column - month.column >= 3);
const monthAxis = visibleMonths.map(({ label, column }) =>
  `<text x="${column > 50 ? 1214 : 50 + 22 * column}" y="24" text-anchor="${column > 50 ? 'end' : 'start'}">${label}</text>`).join('');
const weekdayAxis = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([row, label]) =>
  `<text x="40" y="${20 + 25 + 22 * row}" text-anchor="end" dominant-baseline="middle">${label}</text>`).join('');
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dateRange = `${dateFormat.format(new Date(days[0].date))} – ${dateFormat.format(new Date(days.at(-1).date))}`;
const framedAnimation = svg.replace('<svg ', '<svg x="50" y="20" ');
svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1228" height="316" viewBox="0 0 1228 316">
<rect width="1228" height="316" fill="#000000"/>
${framedAnimation}
<g font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#b1bac4">${monthAxis}${weekdayAxis}
<text x="50" y="304">${dateRange}</text></g>
</svg>`;

const total = days.reduce((sum, day) => sum + day.count, 0);
const activeDays = days.filter(day => day.count > 0).length;
const description = `Galaga generated from ${username}'s real GitHub contribution calendar: ${days[0].date} to ${days.at(-1).date}, ${total} contributions across ${activeDays} active days. Automatically played animation.`;
svg = svg.replace(/<svg\b[^>]*>/, opening => opening + '\n<title>tianlu contribution Galaga</title>\n<desc>' + description + '</desc>');
const metadata = {
  username, source: 'https://api.github.com/graphql',
  generated_at: new Date().toISOString(),
  from: days[0].date, to: days.at(-1).date,
  total_contributions: total, active_days: activeDays,
  calendar_sha256: createHash('sha256').update(JSON.stringify(days)).digest('hex'),
  renderer: 'abozanona/pacman-contribution-graph', upstream_commit: upstreamCommit,
  renderer_sha256: expectedHash,
  empty_cell_color: emptyCellColor,
  calendar_labels: { months: true, weekdays: ['Mon', 'Wed', 'Fri'], date_range: dateRange },
  svg_sha256: createHash('sha256').update(svg).digest('hex'),
};
const calendarData = await fetchCalendarData({ username, token, days });

await mkdir(outputPath, { recursive: true });
await writeFile(resolve(outputPath, 'galaga.svg'), svg);
await writeFile(resolve(outputPath, 'galaga-state.json'), JSON.stringify(metadata, null, 2) + '\n');
await writeFile(resolve(outputPath, 'calendar-data.json'), JSON.stringify(calendarData, null, 2) + '\n');
console.log(`Rendered ${username}: ${total} contributions, ${activeDays} active days (${metadata.from}–${metadata.to}).`);
