# Contribution Galaga

The animated SVG uses **TianLu-hub's actual GitHub contribution calendar**, fetched
through the GitHub GraphQL API. It is generated daily by the
`Update contribution Galaga` workflow, and can also be refreshed manually.
GitHub's schedule and image caching can delay what is shown on the profile.

The renderer is [abozanona/pacman-contribution-graph](https://github.com/abozanona/pacman-contribution-graph),
pinned to commit `7332e1de7903ab780c3692a4127a59cc13872daa` and verified by SHA-256.
Only the library is used; the upstream analytics/leaderboard action wrapper is
not invoked. No dependency installation or personal access token is required.

The workflow's built-in token reads the contribution calendar. Counts reflect
what GitHub exposes to that token. Generation errors stop publication and retain
the last successful animation; example and random contribution data are never
used. Randomness affects the ship's movement, not the contribution counts.

Generated files live on the dedicated `galaga` branch, so the workflow does not
compete with the weather updates on `main`. `galaga-state.json` records the account,
date range, contribution total, active days and hashes for provenance. The renderer
job only has read permission; a separate publishing job writes the generated files.

The README plays the animation automatically. It is not a keyboard-controlled game.
Empty and cleared calendar cells stay muted gray so the year-long grid remains
visible. Green cells still reflect the real contribution levels, and the ship's
movement and firing animation are unchanged.
Month labels appear above the calendar, with Mon/Wed/Fri row markers on the left
and the actual contribution date range below. Each column is one Sunday-starting
week. These labels are regenerated with the calendar each day.
