# Web Analytics Roadmap Tracker

A static, local-first learning tracker based on the 33-page **Web Analytics Beginner-to-Job-Ready Roadmap**.

## What is included

See `ROADMAP_ANALYSIS.md` for the curriculum analysis and architecture decisions.

- Interactive tracking for all 11 learning phases
- Eight portfolio project briefs
- 12-week intensive and 24-week steady study plans
- Notes and review dates for every task
- Screenshot upload, drag-and-drop, and clipboard paste
- Local offline storage using IndexedDB
- Monthly reviews, learning-session log, interview bank, job-readiness checklist, and final completion gate
- Embedded original PDF
- Optional GitHub sync for `progress.json`, Markdown notes, and screenshot evidence
- GitHub Pages deployment workflow

## Deploy on GitHub Pages

1. Create a new GitHub repository.
2. Upload every file and folder from this project to the repository root.
3. Keep the default branch as `main`, or update `.github/workflows/pages.yml` if you use another branch.
4. Open **Repository Settings → Pages** and select **GitHub Actions** as the source.
5. Push a commit or run the **Deploy roadmap to GitHub Pages** workflow manually.
6. Open the URL shown by the deployment workflow.

No Node.js build is required. The site is plain HTML, CSS, and JavaScript.

## Run locally

Do not open `index.html` directly because service workers, modules, and the PDF viewer work best through HTTP.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub data sync

The app is usable without a token. All changes are saved locally first.

To sync into the same repository:

1. Create a **fine-grained personal access token**.
2. Limit repository access to this repository only.
3. Grant **Contents: Read and write**.
4. Enter the token inside the app under **GitHub & Data**.
5. Use **Push all data**.

The app writes:

```text
roadmap-data/
├── progress.json
├── README.md
├── notes/
│   └── phase-03-practice-02.md
└── screenshots/
    └── phase-03-practice-02/
        └── shot-...-ga4-exploration.png
```

The Pages workflow ignores changes under `roadmap-data/`, so saving learning evidence does not redeploy the website every time.

## Token security

- Never hardcode a token in `app.js`, HTML, a workflow, or a committed config file.
- Never paste a token into chat, an issue, or a screenshot.
- The token is kept in memory. The optional “remember for this browser session” setting uses `sessionStorage`, not the repository or `progress.json`.
- A browser-held token is appropriate only for a personal, single-user tool with a narrowly scoped token. For a shared or public multi-user product, use a GitHub App or an authenticated backend/worker instead.
- Revoke and replace the token immediately if it is exposed.

## Updating the roadmap content

The structured roadmap lives in `js/data.js`. The original source document is in `assets/Web_Analytics_Roadmap_Printable.pdf`.

## Storage notes

- Progress and notes: IndexedDB `app` store
- Screenshot files: IndexedDB `files` store
- JSON export contains progress and notes but not binary screenshot data
- GitHub sync is the durable backup for screenshots
