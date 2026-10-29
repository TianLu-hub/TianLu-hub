# Contribution snake

The profile shows a snake eating TianLu-hub's real GitHub contribution graph.
It refreshes daily through the `Update contribution snake` workflow, with light
and dark SVG variants selected by the viewer's color scheme.

The renderer is [Platane/snk](https://github.com/Platane/snk), pinned to commit
`d8f6715049803e982ee5ff501b6b9b7d5deeb09b`. It reads GitHub's contribution calendar
with the workflow's built-in token; these counts include all contribution types
recognized by GitHub, not only commits. No example contribution data is used.

Generation runs with read access; a separate publishing job writes only the two
SVGs and provenance JSON to the `snake` branch. A failed generation preserves the
previous animation. No personal token or external telemetry is required.

The former Galaga and monthly calendar are no longer displayed or refreshed.
Their source remains in the repository for reference. The workflow retains its
existing `galaga.yml` filename so scheduled runs follow this replacement.
