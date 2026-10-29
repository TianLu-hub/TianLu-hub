import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCalendarData } from '../scripts/calendar_data.mjs';

const username = 'TianLu-hub';
const token = 'fixture-token-never-published';
const day = (date, count = 0) => ({ date, count, level: count ? 'FIRST_QUARTILE' : 'NONE' });
const node = (date, commitCount) => ({ occurredAt: `${date}T07:00:00Z`, commitCount, isRestricted: false });
const group = (id, nodes, isPrivate = false) => ({
  repository: { id, isPrivate },
  contributions: {
    totalCount: nodes.reduce((sum, item) => sum + item.commitCount, 0),
    pageInfo: { hasNextPage: false }, nodes,
  },
});
function collection(variables, groups = []) {
  return {
    startedAt: variables.from, endedAt: variables.to,
    totalCommitContributions: groups.reduce((sum, item) => sum + item.contributions.totalCount, 0),
    totalRepositoriesWithContributedCommits: groups.length,
    commitContributionsByRepository: groups,
  };
}
function installFetch(t, handler) {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.github.com/graphql');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    const request = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => handler(request.variables, request.query) };
  });
}
function payload(value) { return { data: { user: { contributionsCollection: value } } }; }

test('sums per-day public commit counts separately from all contribution types and private commits', async t => {
  const requests = [];
  installFetch(t, (variables, query) => {
    requests.push(variables);
    assert.match(query, /maxRepositories: 100/);
    assert.match(query, /contributions\(first: 100\)/);
    const groups = variables.from.startsWith('2026-01')
      ? [group('public-one', [node('2026-01-31', 3)]), group('private-identifier', [node('2026-01-31', 2)], true)]
      : [group('public-one', [node('2026-02-01', 1)]), group('public-two', [node('2026-02-01', 1)])];
    return payload(collection(variables, groups));
  });
  const result = await fetchCalendarData({ username, token, days: [day('2026-01-30'), day('2026-01-31', 5), day('2026-02-01', 4)] });
  assert.deepEqual(result.totals, { commits: 5, contributions: 9 });
  assert.deepEqual(result.days.map(item => [item.date, item.commits, item.contributions]), [
    ['2026-01-30', 0, 0], ['2026-01-31', 3, 5], ['2026-02-01', 2, 4],
  ]);
  assert.deepEqual(requests.map(item => [item.from, item.to]), [
    ['2026-01-30T00:00:00Z', '2026-01-31T23:59:59Z'],
    ['2026-02-01T00:00:00Z', '2026-02-01T23:59:59Z'],
  ]);
  assert.match(result.generatedAt, /Z$/);
  assert.match(result.commitScope, /Public commit contributions/);
  assert.doesNotMatch(JSON.stringify(result), /private-identifier|public-one|fixture-token/);
});

test('does not confuse commit connection totalCount with day-node count', async t => {
  installFetch(t, variables => payload(collection(variables, [group('repo', [node('2026-01-01', 105)])])));
  const result = await fetchCalendarData({ username, token, days: [day('2026-01-01', 105)] });
  assert.equal(result.totals.commits, 105);
});

test('rejects missing and duplicate dates before making requests', async t => {
  const mock = t.mock.method(globalThis, 'fetch', () => { throw new Error('should not fetch'); });
  for (const days of [[day('2026-01-01'), day('2026-01-03')], [day('2026-01-01'), day('2026-01-01')]]) {
    await assert.rejects(fetchCalendarData({ username, token, days }), /missing or duplicated/);
  }
  assert.equal(mock.mock.callCount(), 0);
});

const invalidResponses = [
  ['truncated repository list', value => { value.totalRepositoriesWithContributedCommits = 101; }, /repository list is truncated/],
  ['truncated daily connection', value => { value.commitContributionsByRepository[0].contributions.pageInfo.hasNextPage = true; }, /connection is truncated/],
  ['incorrect repository total', value => { value.commitContributionsByRepository[0].contributions.totalCount = 2; }, /daily counts do not match/],
  ['incorrect collection total', value => { value.totalCommitContributions = 2; }, /do not cover/],
  ['wrong interval', value => { value.startedAt = '2025-12-31T00:00:00Z'; }, /different date interval/],
  ['duplicate daily node', value => { value.commitContributionsByRepository[0].contributions.nodes.push(node('2026-01-01', 1)); }, /duplicate commit day/],
  ['out-of-range daily node', value => { value.commitContributionsByRepository[0].contributions.nodes[0] = node('2026-01-02', 1); }, /out-of-range/],
  ['restricted public record', value => { value.commitContributionsByRepository[0].contributions.nodes[0].isRestricted = true; }, /public commit record is restricted/],
];
for (const [name, corrupt, error] of invalidResponses) {
  test(`fails closed on ${name}`, async t => {
    installFetch(t, variables => {
      const value = collection(variables, [group('repo', [node('2026-01-01', 1)])]);
      corrupt(value);
      return payload(value);
    });
    await assert.rejects(fetchCalendarData({ username, token, days: [day('2026-01-01', 1)] }), error);
  });
}

test('refuses partial GraphQL data without echoing API error details', async t => {
  installFetch(t, variables => ({ ...payload(collection(variables)), errors: [{ message: 'private-repo-name' }] }));
  await assert.rejects(fetchCalendarData({ username, token, days: [day('2026-01-01')] }), error => {
    assert.match(error.message, /no partial data/);
    assert.doesNotMatch(error.message, /private-repo-name/);
    return true;
  });
});

test('refuses commit counts newer than the contribution snapshot', async t => {
  installFetch(t, variables => payload(collection(variables, [group('repo', [node('2026-01-01', 2)])])));
  await assert.rejects(fetchCalendarData({ username, token, days: [day('2026-01-01', 1)] }), /refresh the calendar/);
});

test('covers every month with no more than three requests in flight', async t => {
  let active = 0;
  let maximum = 0;
  const ranges = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const { variables } = JSON.parse(options.body);
    ranges.push(variables);
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active -= 1;
    return { ok: true, status: 200, json: async () => payload(collection(variables)) };
  });
  const start = Date.parse('2026-01-01T00:00:00Z');
  const days = Array.from({ length: 122 }, (_, index) => day(new Date(start + index * 86400000).toISOString().slice(0, 10)));
  const result = await fetchCalendarData({ username, token, days });
  assert.equal(result.days.length, 122);
  assert.equal(ranges.length, 5);
  assert.equal(maximum, 3);
  assert.equal(ranges.at(-1).to, '2026-05-02T23:59:59Z');
});
