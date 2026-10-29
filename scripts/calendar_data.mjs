// Counts come from GitHub's contribution model, not repository commit searches.
// https://docs.github.com/en/graphql/reference/users#createdcommitcontribution
// Private repository identifiers and counts are never included in the output.
const API = 'https://api.github.com/graphql';
const DAY = 86400000;
const LEVELS = new Set(['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE']);
const QUERY = `query CalendarCommitDays($username: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $username) {
    contributionsCollection(from: $from, to: $to) {
      startedAt endedAt totalCommitContributions totalRepositoriesWithContributedCommits
      commitContributionsByRepository(maxRepositories: 100) {
        repository { id isPrivate }
        contributions(first: 100) {
          totalCount
          pageInfo { hasNextPage }
          nodes { occurredAt commitCount isRestricted }
        }
      }
    }
  }
}`;

function invariant(condition, message) {
  if (!condition) throw new Error(`Commit calendar: ${message}`);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function dateMillis(date) {
  invariant(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), 'invalid calendar date.');
  const time = Date.parse(`${date}T00:00:00Z`);
  invariant(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date, 'invalid calendar date.');
  return time;
}

function monthlyRanges(days) {
  const ranges = [];
  for (const day of days) {
    const last = ranges.at(-1);
    if (last?.from.slice(0, 7) === day.date.slice(0, 7)) last.to = day.date;
    else ranges.push({ from: day.date, to: day.date });
  }
  return ranges;
}

async function queryMonth({ username, token, from, to }) {
  const variables = { username, from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ query: QUERY, variables }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      if (attempt === 2) throw new Error('Commit calendar: GitHub request failed after three attempts.');
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    invariant(response.ok, `GitHub returned HTTP ${response.status}.`);
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('Commit calendar: GitHub returned invalid JSON.'); }
    // Error details can contain repository identifiers; do not log the response.
    invariant(!payload.errors?.length, 'GitHub returned GraphQL errors; no partial data will be published.');
    const collection = payload.data?.user?.contributionsCollection;
    invariant(collection, 'GitHub returned no contribution collection.');
    invariant(Date.parse(collection.startedAt) === Date.parse(variables.from)
      && Date.parse(collection.endedAt) === Date.parse(variables.to), 'GitHub returned a different date interval.');
    return collection;
  }
  throw new Error('Commit calendar: GitHub request did not complete.');
}

function readPublicCommitDays(collection, range) {
  const repositories = collection.commitContributionsByRepository;
  invariant(Array.isArray(repositories) && isCount(collection.totalRepositoriesWithContributedCommits)
    && repositories.length === collection.totalRepositoriesWithContributedCommits,
  'repository list is truncated or inconsistent.');
  invariant(isCount(collection.totalCommitContributions), 'invalid total commit count.');
  const ids = new Set();
  const publicDays = new Map();
  let allCommits = 0;
  for (const group of repositories) {
    const repository = group.repository;
    invariant(repository && typeof repository.id === 'string' && repository.id.length > 0
      && typeof repository.isPrivate === 'boolean' && !ids.has(repository.id), 'invalid or duplicate repository.');
    ids.add(repository.id);
    const contributions = group.contributions;
    invariant(contributions?.pageInfo?.hasNextPage === false && Array.isArray(contributions.nodes),
      'daily commit connection is truncated.');
    invariant(isCount(contributions.totalCount), 'invalid repository commit count.');
    const seenDates = new Set();
    let repositoryCommits = 0;
    for (const node of contributions.nodes) {
      invariant(node && typeof node.occurredAt === 'string'
        && Number.isFinite(Date.parse(node.occurredAt)) && typeof node.isRestricted === 'boolean'
        && isCount(node.commitCount) && node.commitCount > 0, 'invalid daily commit record.');
      // GitHub supplies one record per repository/day. Retain the date from that
      // record instead of interpreting commit timestamps in the viewer's zone.
      const date = node.occurredAt.slice(0, 10);
      dateMillis(date);
      invariant(date >= range.from && date <= range.to && !seenDates.has(date), 'out-of-range or duplicate commit day.');
      seenDates.add(date);
      repositoryCommits += node.commitCount;
      if (!repository.isPrivate) {
        invariant(!node.isRestricted, 'a public commit record is restricted.');
        publicDays.set(date, (publicDays.get(date) || 0) + node.commitCount);
      }
    }
    // Unlike most GraphQL connections, totalCount here counts commits, not nodes.
    invariant(repositoryCommits === contributions.totalCount, 'repository daily counts do not match its total.');
    allCommits += repositoryCommits;
  }
  invariant(allCommits === collection.totalCommitContributions, 'repository totals do not cover the contribution collection.');
  return publicDays;
}

/** Fetch complete public commit contributions for the supplied contribution calendar. */
export async function fetchCalendarData({ username, token, days }) {
  invariant(typeof username === 'string' && /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(username), 'invalid GitHub username.');
  invariant(typeof token === 'string' && token.trim().length > 0, 'GITHUB_TOKEN is required.');
  invariant(Array.isArray(days) && days.length > 0 && days.length <= 372, 'expected a bounded contribution calendar.');
  const normalized = days.map(day => ({ date: day.date, count: day.count, level: day.level }))
    .sort((a, b) => a.date.localeCompare(b.date));
  normalized.forEach((day, index) => {
    const time = dateMillis(day.date);
    invariant(isCount(day.count) && LEVELS.has(day.level), 'invalid contribution count or level.');
    if (index > 0) invariant(time - dateMillis(normalized[index - 1].date) === DAY, 'calendar dates are missing or duplicated.');
  });
  const ranges = monthlyRanges(normalized);
  const results = new Array(ranges.length);
  let cursor = 0;
  // At most three GitHub requests in flight, including each worker's retries.
  await Promise.all(Array.from({ length: Math.min(3, ranges.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= ranges.length) return;
      const range = ranges[index];
      const collection = await queryMonth({ username, token, ...range });
      results[index] = readPublicCommitDays(collection, range);
    }
  }));
  const commitsByDate = new Map(results.flatMap(result => [...result]));
  const outputDays = normalized.map(day => {
    const commits = commitsByDate.get(day.date) || 0;
    invariant(isCount(commits) && commits <= day.count,
      'public commits exceed the contribution snapshot; refresh the calendar and retry.');
    return { date: day.date, commits, contributions: day.count, level: day.level };
  });
  return {
    username, generatedAt: new Date().toISOString(),
    source: API,
    commitScope: 'Public commit contributions recognized by GitHub; excludes private repositories and commits outside GitHub contribution rules.',
    from: normalized[0].date, to: normalized.at(-1).date,
    totals: {
      commits: outputDays.reduce((sum, day) => sum + day.commits, 0),
      contributions: outputDays.reduce((sum, day) => sum + day.contributions, 0),
    },
    days: outputDays,
  };
}
