// Render the real GitHub contribution calendar with the pinned upstream library.
// The upstream action wrapper is intentionally not used; this calls no analytics.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  svg_sha256: createHash('sha256').update(svg).digest('hex'),
};

await mkdir(outputPath, { recursive: true });
await writeFile(resolve(outputPath, 'galaga.svg'), svg);
await writeFile(resolve(outputPath, 'galaga-state.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(`Rendered ${username}: ${total} contributions, ${activeDays} active days (${metadata.from}–${metadata.to}).`);
