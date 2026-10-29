// Static SVGs stay readable inside GitHub README images without browser scripts.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WIDTH = 900;
const LEFT = 28;
const CELL_WIDTH = 112;
const CELL_HEIGHT = 106;
const GAP = 10;
const GRID_TOP = 174;
const FONT = 'Arial, Helvetica, sans-serif';

function invariant(condition, message) {
  if (!condition) throw new Error(`Monthly calendar: ${message}`);
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function parseDate(value) {
  invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'invalid date.');
  const date = new Date(`${value}T00:00:00Z`);
  invariant(Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value, 'invalid date.');
  return date;
}

function monthDate(year, month) {
  // setUTCFullYear also handles years below 100 without Date.UTC's 1900 offset.
  const date = new Date(0);
  date.setUTCFullYear(year, month, 1);
  return date;
}

function text(x, y, value, { size = 20, fill = '#9faec2', weight = 400, anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function cell({ date, day, column, row, record, to }) {
  const x = LEFT + column * (CELL_WIDTH + GAP);
  const y = GRID_TOP + row * (CELL_HEIGHT + GAP);
  const status = record ? 'available' : date > to ? 'future' : 'unavailable';
  const active = Boolean(record?.commits);
  const count = record ? record.commits : '—';
  const description = record ? `${date}: ${record.commits} public commit${record.commits === 1 ? '' : 's'}`
    : `${date}: ${status === 'future' ? 'after the latest data date' : 'no data'}`;
  const background = active ? '#11352b' : record ? '#161e2a' : '#0e1520';
  const border = active ? '#285b47' : '#283546';
  const countSize = String(count).length > 4 ? 30 : 40;
  return `<g data-date="${date}" data-status="${status}" data-column="${column}" data-row="${row}">
    <title>${escapeXml(description)}</title>
    <rect x="${x}" y="${y}" width="${CELL_WIDTH}" height="${CELL_HEIGHT}" rx="9" fill="${background}" stroke="${border}"/>
    ${text(x + 14, y + 32, day, { size: 25, fill: record ? '#f0f4fa' : '#8492a5' })}
    ${text(x + CELL_WIDTH - 14, y + 85, count, { size: countSize, fill: active ? '#83efb5' : record ? '#d5deec' : '#67778d', weight: 700, anchor: 'end' })}
  </g>`;
}

function renderMonth(data, records, month) {
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const prefix = month.toISOString().slice(0, 7);
  const heading = `${MONTHS[monthIndex]} ${year}`;
  const followingMonth = monthDate(year, monthIndex + 1);
  const dayCount = new Date(followingMonth.valueOf() - 86400000).getUTCDate();
  const startColumn = month.getUTCDay();
  const rows = Math.ceil((startColumn + dayCount) / 7);
  const gridBottom = GRID_TOP + rows * (CELL_HEIGHT + GAP) - GAP;
  const height = gridBottom + 74;
  const available = data.days.filter(day => day.date.startsWith(`${prefix}-`));
  const total = available.reduce((sum, day) => sum + day.commits, 0);
  const totalLabel = available.length ? `${total.toLocaleString('en-US')} commit${total === 1 ? '' : 's'}` : 'No data';
  const description = `${heading} public commit calendar for ${data.username}. Each cell shows its day at top left and public commit count at bottom right. Zero means no public commits. A dash means no data or a date after ${data.to}. ${available.length} of ${dayCount} dates available; ${total} recorded public commits.`;
  const cells = Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const date = `${prefix}-${String(day).padStart(2, '0')}`;
    const position = startColumn + index;
    return cell({ date, day, column: position % 7, row: Math.floor(position / 7), record: records.get(date), to: data.to });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(`${heading} · ${data.username} public commits`)}</title>
  <desc id="description">${escapeXml(description)}</desc>
  <rect width="${WIDTH}" height="${height}" rx="16" fill="#0b111b"/>
  <g font-family="${FONT}">
    ${text(LEFT, 54, heading, { size: 36, fill: '#f0f4fa', weight: 700 })}
    ${text(WIDTH - LEFT, 52, totalLabel, { size: 23, fill: '#83efb5', weight: 700, anchor: 'end' })}
    ${text(LEFT, 87, 'Public commits · updated daily', { size: 19 })}
    ${text(LEFT, 118, 'Day at top left · commit count at bottom right', { size: 19, fill: '#c4cedd' })}
    ${WEEKDAYS.map((day, column) => text(LEFT + column * (CELL_WIDTH + GAP) + CELL_WIDTH / 2, 156, day, { size: 20, weight: 700, anchor: 'middle' })).join('\n    ')}
    ${cells.join('\n    ')}
    ${text(LEFT, gridBottom + 33, '0 = no public commits · — = no data / future date', { size: 18 })}
    ${text(LEFT, gridBottom + 58, `Data through ${data.to} · GitHub contribution rules apply`, { size: 16, fill: '#8c9cb2' })}
  </g>
</svg>\n`;
}

function renderMonthLabel(month) {
  const label = `${MONTHS[month.getUTCMonth()]} ${month.getUTCFullYear()}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="42" viewBox="0 0 240 42" role="img" aria-label="${escapeXml(label)}"><title>${escapeXml(label)}</title><text x="0" y="29" font-family="${FONT}" font-size="24" font-weight="600" fill="#8b949e">${escapeXml(label)}</text></svg>\n`;
}

/**
 * Return 25 static SVG files as Map<filename, SVG string>:
 * current.svg, previous-01.svg … previous-12.svg, and label-01.svg … label-12.svg.
 * Month offsets are relative to calendarData.to, never to the viewer's timezone.
 * Missing dates and future dates display a dash; an available zero displays 0.
 */
export function renderMonthlyCalendars(calendarData) {
  invariant(calendarData && typeof calendarData.username === 'string', 'username is required.');
  const from = parseDate(calendarData.from);
  const to = parseDate(calendarData.to);
  invariant(from <= to, 'date range is reversed.');
  invariant(Array.isArray(calendarData.days), 'days must be an array.');
  const records = new Map();
  for (const day of calendarData.days) {
    parseDate(day.date);
    invariant(day.date >= calendarData.from && day.date <= calendarData.to, 'day falls outside the date range.');
    invariant(Number.isSafeInteger(day.commits) && day.commits >= 0, 'commit count must be a nonnegative safe integer.');
    invariant(!records.has(day.date), 'duplicate date.');
    records.set(day.date, day);
  }
  const results = new Map();
  for (let offset = 0; offset <= 12; offset += 1) {
    const month = monthDate(to.getUTCFullYear(), to.getUTCMonth() - offset);
    const suffix = String(offset).padStart(2, '0');
    results.set(offset === 0 ? 'current.svg' : `previous-${suffix}.svg`, renderMonth(calendarData, records, month));
    if (offset) results.set(`label-${suffix}.svg`, renderMonthLabel(month));
  }
  return results;
}
