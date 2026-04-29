# Flowlyt Web

Web-based GUI for [Flowlyt](https://github.com/harekrishnarai/flowlyt) — the CI/CD pipeline security scanner.

This is the browser-based frontend that provides an interactive interface for the same analysis engine available in the [Flowlyt CLI](https://github.com/harekrishnarai/flowlyt). Use it when you want visual results, PDF reports, or a quick scan without installing the CLI.

## Quick Start

```bash
git clone https://github.com/harekrishnarai/flowlyt-web.git
cd flowlyt-web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Input Modes

- **GitHub URL** — enter a repository URL to fetch and analyze workflow files
- **GitLab URL** — supports GitLab.com and custom instances
- **File Upload** — drag and drop `.yml`/`.yaml` workflow files directly

## What It Does

Scans GitHub Actions and GitLab CI/CD pipeline files for:

- **Security** — expression injection, dangerous triggers, secret exposure, unpinned actions, supply chain risks, permission misconfigurations
- **Performance** — missing caches, redundant checkouts, large matrices
- **Best Practices** — naming, documentation, error handling, timeouts
- **Dependencies** — outdated/deprecated actions, version drift
- **Structure** — circular dependencies, missing job deps, complexity

Results include severity-ranked findings, SHA pinning recommendations with copy-to-clipboard, call graph visualization, and downloadable PDF reports.

## Relationship to Flowlyt CLI

| | CLI | Web |
|---|---|---|
| Installation | `go install` | None (browser) |
| Analysis depth | Full (context-aware, AST, OPA policies) | Pattern-matching + heuristics |
| Output | JSON, SARIF, terminal | Interactive UI, PDF |
| CI integration | Yes | No |
| Offline | Yes | Partial (file upload) |

The CLI is the source of truth for rule definitions. The web version provides a subset of the same checks in a visual format suitable for quick assessments and sharing reports.

## Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- js-yaml, jsPDF, Recharts, @xyflow/react
- Deployed via GitHub Pages

## Development

```bash
npm run dev          # dev server
npm run build        # production build
npm run preview      # preview production build
npm run update-actions  # refresh SHA pinning database
```

## License

MIT

## Author

**Harekrishna Rai** — [@harekrishnarai](https://github.com/harekrishnarai)
