# Roadmap analysis and website architecture

## What the PDF is designed to achieve

The source document is not merely a syllabus. Its operating model is:

1. **Learn** the terminology and concepts.
2. **Build** on a real or demo website.
3. **Prove** competence with screenshots, QA logs, queries, dashboards, and recommendations.
4. **Publish** a portfolio-safe case study.

The website therefore treats a checked item as an evidence record rather than a simple to-do.

## Curriculum structure represented in the app

The interactive tracker includes all eleven core phases:

1. Business and Measurement Foundations
2. Campaign Tracking and Acquisition Analytics
3. Google Analytics 4 Core
4. Google Tag Manager and the Data Layer
5. Data Quality, Debugging, and Governance
6. Spreadsheets and Analytical Thinking
7. Looker Studio and Data Storytelling
8. CRO, Experimentation, and Qualitative Analytics
9. SQL and BigQuery for Analytics
10. Privacy, Consent, and Responsible Analytics
11. Advanced and Optional Specialisations

Each phase includes:

- Learn tasks
- Practice tasks
- Evidence target
- Portfolio milestone
- Exit criteria
- Per-task notes
- KNOW / DO / SHOW / TEACH stage
- Review date
- Screenshot evidence

## Portfolio structure

The app includes the PDF's portfolio architecture checklist and eight project briefs:

1. Measurement Strategy Pack
2. GA4 + GTM Implementation
3. Campaign Taxonomy and Acquisition Analysis
4. GA4 Funnel and Journey Analysis
5. Stakeholder Dashboard
6. SQL / BigQuery Event Analysis
7. Analytics QA and Governance Audit
8. CRO Research and Experiment Plan

## Learning management features

The website also converts the supporting printable pages into interactive tools:

- 12-week intensive plan
- 24-week steady plan
- Monthly progress review
- Master learning-session log
- Job-readiness checklist
- Resume and interview preparation prompts
- Interview practice bank
- Official-resource tracker
- Final completion gate
- Embedded original PDF

## Persistence architecture

### Local-first storage

Progress, notes, review dates, profile fields, and metadata are saved in IndexedDB. Screenshot files are stored as Blob records in a separate IndexedDB object store.

This means the tracker works without signing in and can continue working offline after the service worker has cached the application.

### GitHub sync

When configured by the repository owner, the browser uses the GitHub Contents API to write files serially into:

```text
roadmap-data/
├── progress.json
├── README.md
├── notes/
└── screenshots/
```

The token is never written into the state object, JSON export, notes, screenshots, or repository files.

## Security decision

A GitHub Pages site is static and cannot safely hide a permanent secret. The implementation therefore does **not** contain a token. The repository owner enters a fine-grained token in the browser, limited to one repository with Contents read/write permission.

This is acceptable for a personal, single-user tracker when the token is narrowly scoped and short-lived. A shared SaaS version should use a GitHub App, OAuth flow, or authenticated backend/edge worker instead of direct browser token access.

## Visual design

The supplied neo-brutalist design system is implemented through:

- Thick black borders
- Hard offset shadows
- Cream canvas with red, yellow, violet, and teal color blocks
- Sharp corners
- Mechanical press interactions
- Dense, high-contrast layouts
- Responsive mobile navigation
- Accessible focus states and reduced-motion support
