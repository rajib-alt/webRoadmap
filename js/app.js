import { ROADMAP_DATA } from './data.js';
import {
  loadState, saveState, saveFileRecord, getFileRecord, deleteFileRecord,
  clearAllData, getSessionToken, setSessionToken, exportStateJson,
  importStateJson, createId,
} from './storage.js';
import { testConnection, pushRoadmapData, pullRoadmapData } from './github.js';

const content = document.querySelector('#content');
const headerProgress = document.querySelector('#headerProgress');
const sidebar = document.querySelector('#sidebar');
const sidebarScrim = document.querySelector('#sidebarScrim');
const workspaceDialog = document.querySelector('#workspaceDialog');
const workspaceTitle = document.querySelector('#workspaceTitle');
const workspaceContext = document.querySelector('#workspaceContext');
const workspaceEvidence = document.querySelector('#workspaceEvidence');
const taskNotes = document.querySelector('#taskNotes');
const reviewDate = document.querySelector('#reviewDate');
const stagePicker = document.querySelector('#stagePicker');
const screenshotGallery = document.querySelector('#screenshotGallery');
const screenshotInput = document.querySelector('#screenshotInput');
const dropZone = document.querySelector('#dropZone');
const markTaskButton = document.querySelector('#markTaskButton');
const quickSyncButton = document.querySelector('#quickSyncButton');
const autosaveStatus = document.querySelector('#autosaveStatus');

let state;
let currentSection = 'dashboard';
let currentTaskId = null;
let githubToken = getSessionToken();
let noteSaveTimer = null;
const objectUrls = new Map();
const taskIndex = new Map();
const allCheckableIds = [];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function indexRecord(record, context, extra = {}) {
  taskIndex.set(record.id, { ...record, context, ...extra });
  allCheckableIds.push(record.id);
}

function buildTaskIndex() {
  ROADMAP_DATA.startTasks.forEach((task) => indexRecord(task, 'Start here'));
  ROADMAP_DATA.phases.forEach((phase) => {
    phase.learn.forEach((task) => indexRecord(task, `Phase ${phase.number}: ${phase.title}`, { phaseNumber: phase.number }));
    phase.practice.forEach((task) => indexRecord(task, `Phase ${phase.number}: ${phase.title}`, { phaseNumber: phase.number }));
    phase.exit.forEach((task) => indexRecord(task, `Phase ${phase.number} exit criterion`, { phaseNumber: phase.number, evidence: 'Explain or demonstrate' }));
  });
  ROADMAP_DATA.projects.forEach((project) => {
    project.build.forEach((task) => indexRecord(task, `Project ${project.number}: ${project.title}`, { projectNumber: project.number }));
    project.questions.forEach((task) => indexRecord(task, `Project ${project.number} analysis question`, { projectNumber: project.number, evidence: 'Written answer' }));
  });
  Object.values(ROADMAP_DATA.plans).flat().forEach((task) => indexRecord({ ...task, title: `${task.period}: ${task.focus}`, evidence: task.output }, 'Study plan'));
  ROADMAP_DATA.portfolioStructure.forEach((task) => indexRecord(task, 'Portfolio architecture', { evidence: 'Portfolio section' }));
  ROADMAP_DATA.jobReadiness.forEach((task) => indexRecord(task, 'Job-readiness checklist', { evidence: 'Evidence or asset' }));
  ROADMAP_DATA.interviewQuestions.forEach((task) => indexRecord(task, 'Interview practice', { evidence: 'Spoken answer + notes' }));
  ROADMAP_DATA.resources.forEach((task) => indexRecord(task, 'Official learning resource', { evidence: 'Practice output' }));
  ROADMAP_DATA.finalGate.forEach((task) => indexRecord(task, 'Final completion gate', { evidence: 'Portfolio or interview proof' }));
}

function isDone(id) { return Boolean(state.taskStates[id]); }
function stageFor(id) { return state.taskStages[id] || ''; }

function completion(ids) {
  const unique = [...new Set(ids)];
  const total = unique.length;
  const done = unique.filter(isDone).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

function phaseIds(phase) {
  return [...phase.learn, ...phase.practice, ...phase.exit].map((item) => item.id);
}

function projectIds(project) { return [...project.build, ...project.questions].map((item) => item.id); }

function updateHeaderProgress() {
  const progress = completion(allCheckableIds);
  headerProgress.textContent = `${progress.percent}%`;
}

function pageHeader(eyebrow, title, description, action = '') {
  return `<header class="page-header">
    <div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(description)}</p></div>
    ${action}
  </header>`;
}

function checklistRow(task, options = {}) {
  const done = isDone(task.id);
  const stage = stageFor(task.id);
  const evidence = options.evidence ?? task.evidence ?? 'Evidence';
  return `<div class="task-row ${done ? 'completed' : ''}" data-task-row="${escapeHtml(task.id)}">
    <input class="task-check" type="checkbox" data-check-id="${escapeHtml(task.id)}" ${done ? 'checked' : ''} aria-label="Mark task complete">
    <div class="task-title">${escapeHtml(task.title)}</div>
    <div class="evidence-label">${escapeHtml(evidence)}</div>
    <div class="task-actions"><span class="stage-dot">${escapeHtml(stage || 'STAGE')}</span><button class="workspace-button" type="button" data-workspace-id="${escapeHtml(task.id)}">NOTES + SS</button></div>
  </div>`;
}

function miniCheck(task) {
  return `<label class="mini-check ${isDone(task.id) ? 'completed' : ''}">
    <input type="checkbox" data-check-id="${escapeHtml(task.id)}" ${isDone(task.id) ? 'checked' : ''}>
    <span><strong>${escapeHtml(task.title)}</strong>${task.evidence ? `<br><small>Proof: ${escapeHtml(task.evidence)}</small>` : ''}</span>
  </label>`;
}

function findNextTask() {
  const ordered = ROADMAP_DATA.phases.flatMap((phase) => [...phase.learn, ...phase.practice]);
  return ordered.find((task) => !isDone(task.id)) || ROADMAP_DATA.finalGate.find((task) => !isDone(task.id)) || null;
}

function renderDashboard() {
  const overall = completion(allCheckableIds);
  const phaseTaskIds = ROADMAP_DATA.phases.flatMap(phaseIds);
  const phaseProgress = completion(phaseTaskIds);
  const evidenceCount = Object.values(state.screenshots || {}).flat().length;
  const notesCount = Object.values(state.notes || {}).filter((note) => String(note).trim()).length;
  const nextTask = findNextTask();
  const recent = [...(state.sessions || [])].slice(-4).reverse();
  const targetRole = state.profile.targetRole || 'Not set yet';

  content.innerHTML = `
    <section class="hero-panel">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="eyebrow">INTERACTIVE LEARNING OS</span>
          <h1>WEB ANALYTICS <span class="outline-title">ROADMAP</span></h1>
          <p class="lead">Turn every checkbox into proof. Track learning, write notes, attach screenshots, build portfolio projects, and sync the evidence back to your own GitHub repository.</p>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:22px"><button class="button button-red" data-nav="roadmap">CONTINUE ROADMAP</button><button class="button button-white" data-nav="settings">CONNECT GITHUB</button></div>
        </div>
        <div class="hero-stats">
          <div class="big-stat"><strong>${overall.percent}%</strong><span>Overall completion</span></div>
          <div class="big-stat"><strong>${escapeHtml(targetRole)}</strong><span>Target role</span></div>
        </div>
      </div>
    </section>

    <section class="stats-grid">
      <div class="stat-card"><strong>${phaseProgress.done}/${phaseProgress.total}</strong><span>Roadmap tasks complete</span></div>
      <div class="stat-card"><strong>${notesCount}</strong><span>Tasks with notes</span></div>
      <div class="stat-card"><strong>${evidenceCount}</strong><span>Screenshots saved</span></div>
      <div class="stat-card"><strong>${(state.sessions || []).length}</strong><span>Learning sessions logged</span></div>
    </section>

    ${nextTask ? `<section class="section-block"><div class="section-heading"><div><span class="eyebrow">NEXT BEST ACTION</span><h2>KEEP THE CHAIN MOVING</h2></div></div>
      <div class="continue-card"><span class="badge">${escapeHtml(taskIndex.get(nextTask.id)?.context || 'Roadmap')}</span><div><h3>${escapeHtml(nextTask.title)}</h3><p>Evidence target: ${escapeHtml(nextTask.evidence || 'Portfolio-safe proof')}</p></div><button class="button button-yellow" data-workspace-id="${escapeHtml(nextTask.id)}">OPEN WORKSPACE</button></div></section>` : ''}

    <section class="section-block">
      <div class="section-heading"><div><span class="eyebrow">SET YOUR OPERATING SYSTEM</span><h2>START HERE</h2><p>These setup tasks make the rest of the roadmap easier to maintain and publish.</p></div></div>
      <div class="task-list">${ROADMAP_DATA.startTasks.map(checklistRow).join('')}</div>
    </section>

    <section class="section-block">
      <div class="section-heading"><div><span class="eyebrow">11 PHASES</span><h2>ROADMAP AT A GLANCE</h2></div><button class="button button-violet" data-nav="roadmap">VIEW ALL TASKS</button></div>
      <div class="card-grid">${ROADMAP_DATA.phases.map((phase) => {
        const p = completion(phaseIds(phase));
        return `<article class="card phase-card"><header class="card-header"><div class="phase-number">${phase.number}</div><h3>${escapeHtml(phase.title)}</h3></header><div class="card-body"><p>${escapeHtml(phase.tagline)}</p><div class="progress-track"><div class="progress-bar" style="width:${p.percent}%"></div></div><div class="progress-label"><span>${p.done}/${p.total} tasks</span><span>${p.percent}%</span></div></div><footer class="card-footer"><button class="button button-small button-white" data-nav="roadmap" data-scroll-phase="${phase.number}">OPEN PHASE</button></footer></article>`;
      }).join('')}</div>
    </section>

    <section class="section-block">
      <div class="section-heading"><div><span class="eyebrow">RECENT ACTIVITY</span><h2>LEARNING LOG</h2></div><button class="button button-white" data-nav="reviews">ADD SESSION</button></div>
      ${recent.length ? `<div class="session-list">${recent.map((item) => `<div class="session-item"><strong>${escapeHtml(item.what || 'Learning session')}</strong><small>${escapeHtml(item.date || '')} • ${escapeHtml(item.phase || '')}</small><small>${escapeHtml(item.evidence || 'No evidence recorded')}</small></div>`).join('')}</div>` : '<div class="empty-state"><strong>No learning sessions yet.</strong><p>Log what you learned and the evidence you produced.</p></div>'}
    </section>`;
}

function renderRoadmap() {
  content.innerHTML = `${pageHeader('BEGINNER TO JOB-READY', 'The Roadmap', 'Work through concepts, real implementation, validation, analysis, communication, and portfolio evidence. Use search and filters to focus the list.')}
    <div class="toolbar">
      <input class="text-input" id="roadmapSearch" type="search" placeholder="Search tasks, evidence, GA4, SQL, privacy...">
      <select class="select-input" id="roadmapStatusFilter"><option value="all">All statuses</option><option value="open">Incomplete</option><option value="done">Completed</option><option value="evidence">Has notes/screenshots</option></select>
      <button class="button button-white" id="expandAllButton">EXPAND ALL</button>
    </div>
    <div id="phaseList">${ROADMAP_DATA.phases.map((phase) => {
      const p = completion(phaseIds(phase));
      return `<section class="phase-section" id="phase-${phase.number}" data-phase-card data-search-text="${escapeHtml(`${phase.title} ${phase.tagline} ${[...phase.learn, ...phase.practice].map((t) => `${t.title} ${t.evidence}`).join(' ')}`.toLowerCase())}">
        <header><div class="phase-number">${phase.number}</div><div><h3>${escapeHtml(phase.title)}</h3><p>${escapeHtml(phase.tagline)}</p><div class="progress-label"><span>${p.done}/${p.total} complete</span><span>${p.percent}%</span></div></div><button class="button button-white phase-toggle" type="button" data-toggle-phase="${phase.number}">COLLAPSE</button></header>
        <div class="phase-content" data-phase-content="${phase.number}">
          <div class="task-group"><span class="group-title">LEARN</span><div class="task-list">${phase.learn.map(checklistRow).join('')}</div></div>
          <div class="task-group"><span class="group-title">PRACTISE</span><div class="task-list">${phase.practice.map(checklistRow).join('')}</div></div>
          <div class="milestone-box"><strong>Portfolio milestone</strong>${escapeHtml(phase.milestone)}</div>
          <div class="task-group" style="margin-top:18px"><span class="group-title">EXIT CRITERIA</span><div class="task-list">${phase.exit.map((task) => checklistRow(task, { evidence: 'Demonstrate' })).join('')}</div></div>
        </div>
      </section>`;
    }).join('')}</div>`;
}

function renderProjects() {
  const portfolioProgress = completion(ROADMAP_DATA.portfolioStructure.map((item) => item.id));
  content.innerHTML = `${pageHeader('PORTFOLIO ARCHITECTURE', 'Prove the Work', 'A strong portfolio is not a screenshot gallery. It shows the problem, method, validation, findings, recommendations, limitations, and inspectable supporting assets.')}
    <section class="phase-section"><header><div class="phase-number">12</div><div><h3>Required structure for every case study</h3><p>${portfolioProgress.done}/${portfolioProgress.total} elements complete</p></div></header><div class="phase-content"><div class="task-list">${ROADMAP_DATA.portfolioStructure.map((task) => checklistRow(task, { evidence: 'Case-study section' })).join('')}</div><div class="milestone-box"><strong>Publishing threshold</strong>Do not publish a weak case study simply to increase project count. Improve the weakest evidence, validation, or explanation first.</div></div></section>
    <section class="section-block"><div class="section-heading"><div><span class="eyebrow">8 PROJECT BRIEFS</span><h2>PORTFOLIO PROJECTS</h2></div></div>
      <div class="card-grid">${ROADMAP_DATA.projects.map((project) => {
        const p = completion(projectIds(project));
        return `<article class="card project-card"><header class="card-header"><span class="badge">PROJECT ${project.number}</span><h3 style="margin-top:12px">${escapeHtml(project.title)}</h3><span class="badge project-level">${escapeHtml(project.level)}</span></header><div class="card-body"><p>${escapeHtml(project.brief)}</p><div class="progress-track"><div class="progress-bar" style="width:${p.percent}%"></div></div><div class="progress-label"><span>${p.done}/${p.total}</span><span>${p.percent}%</span></div><div class="project-build">${project.build.map(miniCheck).join('')}</div><details><summary><strong>ANALYSIS QUESTIONS</strong></summary><div class="task-list" style="margin-top:10px">${project.questions.map((task) => checklistRow(task, { evidence: 'Written answer' })).join('')}</div></details><div class="definition-box" style="margin-top:14px">DONE WHEN: ${escapeHtml(project.definition)}</div></div></article>`;
      }).join('')}</div>
    </section>`;
}

function renderPlans() {
  const active = state.profile.activePlan || 'intensive12';
  const entries = ROADMAP_DATA.plans[active];
  const p = completion(entries.map((item) => item.id));
  content.innerHTML = `${pageHeader('CHOOSE A CADENCE', 'Study Plans', 'Use the 12-week plan for 8-12 focused hours per week, or the 24-week plan for 4-6 focused hours. Move dates when life happens; never mark a skill complete without evidence.')}
    <div class="plan-switcher"><button class="button ${active === 'intensive12' ? 'button-red' : 'button-white'}" data-plan="intensive12">12-WEEK INTENSIVE</button><button class="button ${active === 'steady24' ? 'button-violet' : 'button-white'}" data-plan="steady24">24-WEEK STEADY</button></div>
    <div class="continue-card" style="margin-bottom:26px"><span class="badge">ACTIVE PLAN</span><div><h3>${active === 'intensive12' ? '12-Week Intensive Plan' : '24-Week Steady Plan'}</h3><p>${p.done}/${p.total} blocks complete • ${p.percent}%</p></div><button class="button button-yellow" data-nav="reviews">LOG TODAY'S SESSION</button></div>
    <table class="plan-table"><thead><tr><th>Done</th><th>Period</th><th>Focus</th><th>Required output</th><th>Workspace</th></tr></thead><tbody>${entries.map((item) => `<tr class="${isDone(item.id) ? 'completed' : ''}"><td><input class="task-check" type="checkbox" data-check-id="${item.id}" ${isDone(item.id) ? 'checked' : ''}></td><td><strong>${escapeHtml(item.period)}</strong></td><td>${escapeHtml(item.focus)}</td><td>${escapeHtml(item.output)}</td><td><button class="workspace-button" data-workspace-id="${item.id}">NOTES + SS</button></td></tr>`).join('')}</tbody></table>`;
}

const monthlyFields = [
  ['monthDates','Month / dates'],['hours','Hours studied'],['phases','Phases worked on'],['portfolioOutput','Portfolio output completed'],
  ['strongestSkill','Strongest new skill'],['biggestMistake','Biggest data/technical mistake'],['fix','How I fixed or documented it'],
  ['teach','One concept I can now teach'],['weakArea','One weak area to revisit'],['nextDeliverable',"Next month's primary deliverable"],
];

function renderReviews() {
  const draft = state.reviews.monthlyDraft || {};
  const history = state.reviews.monthlyHistory || [];
  const jobProgress = completion(ROADMAP_DATA.jobReadiness.map((t) => t.id));
  const finalProgress = completion(ROADMAP_DATA.finalGate.map((t) => t.id));
  content.innerHTML = `${pageHeader('REVIEW MONTHLY', 'Reviews & Job Prep', 'Log meaningful learning sessions, reflect on mistakes, practise interviews, and check whether your portfolio evidence is strong enough for applications.')}
    <section class="review-grid">
      <div class="form-card"><span class="eyebrow">MONTHLY PROGRESS REVIEW</span><h2 style="margin-top:14px">WHAT CHANGED?</h2><div class="form-grid">${monthlyFields.map(([key,label]) => `<label class="form-field ${['fix','nextDeliverable'].includes(key) ? 'full' : ''}"><span class="field-label">${escapeHtml(label)}</span><input class="text-input monthly-input" data-monthly-key="${key}" value="${escapeHtml(draft[key] || '')}"></label>`).join('')}</div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px"><button class="button button-red" id="saveMonthlyReviewButton">SAVE MONTHLY REVIEW</button><button class="button button-white" id="clearMonthlyDraftButton">CLEAR DRAFT</button></div></div>
      <div class="form-card"><span class="eyebrow">MASTER PROGRESS TRACKER</span><h2 style="margin-top:14px">LOG A SESSION</h2><div class="form-grid" style="grid-template-columns:1fr"><label class="form-field"><span class="field-label">Date</span><input class="text-input" id="sessionDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label class="form-field"><span class="field-label">Phase / project</span><input class="text-input" id="sessionPhase" placeholder="Phase 3 — GA4 Core"></label><label class="form-field"><span class="field-label">What I learned / built</span><textarea class="notes-input" id="sessionWhat" rows="4"></textarea></label><label class="form-field"><span class="field-label">Evidence saved</span><input class="text-input" id="sessionEvidence" placeholder="Screenshot, query, dashboard, QA log..."></label></div><button class="button button-violet" id="addSessionButton" style="margin-top:16px">ADD SESSION</button><div class="session-list">${(state.sessions || []).slice(-5).reverse().map((item) => `<div class="session-item"><strong>${escapeHtml(item.what)}</strong><small>${escapeHtml(item.date)} • ${escapeHtml(item.phase)}</small><small>${escapeHtml(item.evidence)}</small></div>`).join('') || '<p class="muted">No sessions logged yet.</p>'}</div></div>
    </section>

    ${history.length ? `<section class="section-block"><div class="section-heading"><div><span class="eyebrow">SAVED REVIEWS</span><h2>MONTHLY HISTORY</h2></div></div><div class="card-grid">${history.slice().reverse().map((item) => `<article class="card"><header class="card-header"><h3>${escapeHtml(item.monthDates || 'Monthly review')}</h3></header><div class="card-body"><p><strong>Output:</strong> ${escapeHtml(item.portfolioOutput || '—')}</p><p><strong>Strongest skill:</strong> ${escapeHtml(item.strongestSkill || '—')}</p><p><strong>Next:</strong> ${escapeHtml(item.nextDeliverable || '—')}</p></div></article>`).join('')}</div></section>` : ''}

    <section class="section-block"><div class="section-heading"><div><span class="eyebrow">APPLICATION GATE</span><h2>JOB READINESS</h2><p>${jobProgress.done}/${jobProgress.total} complete</p></div></div><div class="checklist-columns">${ROADMAP_DATA.jobReadiness.map((task) => checklistRow(task, { evidence: 'Proof' })).join('')}</div></section>

    <section class="section-block"><div class="section-heading"><div><span class="eyebrow">ANSWER ALOUD</span><h2>INTERVIEW PRACTICE BANK</h2></div></div><div class="checklist-columns">${ROADMAP_DATA.interviewQuestions.map((task) => checklistRow(task, { evidence: 'Answer' })).join('')}</div><div class="milestone-box"><strong>Answer standard</strong>Give the business context, define the metric, describe the method, explain validation, state the decision, and name limitations.</div></section>

    <section class="section-block"><div class="section-heading"><div><span class="eyebrow">END-TO-END PROOF</span><h2>FINAL COMPLETION GATE</h2><p>${finalProgress.done}/${finalProgress.total} complete</p></div></div><div class="task-list">${ROADMAP_DATA.finalGate.map((task) => checklistRow(task, { evidence: 'Project proof' })).join('')}</div></section>`;
}

function renderResources() {
  const p = completion(ROADMAP_DATA.resources.map((t) => t.id));
  content.innerHTML = `${pageHeader('SOURCE OF TRUTH', 'Official Resources', 'Documentation supports practice; it does not replace practice. After every resource, create an output: a test, query, implementation, diagram, dashboard, or written decision.')}
    <div class="continue-card" style="margin-bottom:28px"><span class="badge">RESOURCE DISCIPLINE</span><div><h3>${p.done}/${p.total} visited</h3><p>Mark a resource complete only after producing a practical output.</p></div></div>
    <div class="resource-list">${ROADMAP_DATA.resources.map((resource, i) => `<div class="resource-row ${isDone(resource.id) ? 'completed' : ''}"><div class="resource-index">${String(i+1).padStart(2,'0')}</div><strong>${escapeHtml(resource.title)}</strong><p>${escapeHtml(resource.use)}</p><div style="display:flex;gap:8px;align-items:center"><input class="task-check" type="checkbox" data-check-id="${resource.id}" ${isDone(resource.id) ? 'checked' : ''}><button class="workspace-button" data-workspace-id="${resource.id}">NOTES</button></div></div>`).join('')}</div>`;
}

function renderPdf() {
  content.innerHTML = `${pageHeader('33-PAGE SOURCE DOCUMENT', 'Original PDF', 'Use the interactive tracker for daily work and the original printable roadmap whenever you want the complete page layout or a print-friendly reference.', `<a class="button button-yellow" href="./${ROADMAP_DATA.meta.sourcePdf}" target="_blank" rel="noopener">OPEN PDF IN NEW TAB</a>`)}
    <div class="pdf-shell"><iframe title="Web Analytics Roadmap PDF" src="./${ROADMAP_DATA.meta.sourcePdf}#view=FitH"></iframe></div>`;
}

function renderSettings() {
  const s = state.settings;
  content.innerHTML = `${pageHeader('OPTIONAL CLOUD SYNC', 'GitHub & Data', 'The app is local-first. Connect a repository only when you are ready to commit progress.json, Markdown notes, and screenshot files into that repository.')}
    <div class="settings-grid">
      <section class="form-card"><span class="eyebrow">REPOSITORY CONNECTION</span><h2 style="margin-top:14px">SYNC SETTINGS</h2>
        <div class="form-grid">
          <label class="form-field"><span class="field-label">GitHub owner</span><input class="text-input settings-input" data-setting="githubOwner" value="${escapeHtml(s.githubOwner)}" placeholder="your-username"></label>
          <label class="form-field"><span class="field-label">Repository</span><input class="text-input settings-input" data-setting="githubRepo" value="${escapeHtml(s.githubRepo)}" placeholder="web-analytics-roadmap"></label>
          <label class="form-field"><span class="field-label">Branch</span><input class="text-input settings-input" data-setting="githubBranch" value="${escapeHtml(s.githubBranch)}"></label>
          <label class="form-field"><span class="field-label">Data folder</span><input class="text-input settings-input" data-setting="githubDataPath" value="${escapeHtml(s.githubDataPath)}"></label>
          <label class="form-field full"><span class="field-label">Fine-grained personal access token</span><input class="text-input" id="githubTokenInput" type="password" value="${escapeHtml(githubToken)}" autocomplete="off" placeholder="github_pat_..."></label>
          <label class="mini-check full"><input type="checkbox" id="rememberTokenCheckbox" ${s.rememberTokenForSession ? 'checked' : ''}><span><strong>Remember token for this browser session only</strong><br><small>The token is never written to progress.json or committed to the repository.</small></span></label>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px"><button class="button button-white" id="testGithubButton">TEST CONNECTION</button><button class="button button-red" id="pushGithubButton">PUSH ALL DATA</button><button class="button button-violet" id="pullGithubButton">PULL FROM GITHUB</button></div>
        <div class="sync-progress" id="syncProgress"><div class="progress-track"><div class="progress-bar" id="syncProgressBar" style="width:0"></div></div><p class="muted" id="syncProgressLabel">Waiting...</p></div>
      </section>
      <aside class="action-stack">
        <div class="form-card"><span class="eyebrow">LEARNER PROFILE</span><h3 style="margin:14px 0">YOUR ROADMAP</h3><div class="form-grid" style="grid-template-columns:1fr"><label class="form-field"><span class="field-label">Name</span><input class="text-input profile-input" data-profile="name" value="${escapeHtml(state.profile.name)}"></label><label class="form-field"><span class="field-label">Start date</span><input class="text-input profile-input" data-profile="startDate" type="date" value="${escapeHtml(state.profile.startDate)}"></label><label class="form-field"><span class="field-label">Target role</span><input class="text-input profile-input" data-profile="targetRole" value="${escapeHtml(state.profile.targetRole)}" placeholder="Web Analyst"></label></div></div>
        <div class="security-note"><strong>DO NOT PASTE A TOKEN INTO CHAT OR COMMIT IT.</strong><p>Create a fine-grained token limited to this single repository with <b>Contents: Read and write</b>. Enter it directly in this page. For stronger security on a multi-user/public app, replace browser-token sync with a small authenticated backend or GitHub App.</p></div>
        <div class="form-card"><span class="eyebrow">LOCAL BACKUP</span><h3 style="margin:14px 0">EXPORT / IMPORT</h3><p class="muted">Export progress and notes as JSON. Screenshots stay in IndexedDB and GitHub; they are not embedded in the JSON export.</p><button class="button button-yellow" id="exportDataButton">EXPORT JSON</button><label class="button button-white" style="display:inline-flex;align-items:center;justify-content:center">IMPORT JSON<input type="file" id="importDataInput" accept="application/json" hidden></label></div>
        <div class="form-card"><span class="eyebrow">DANGER ZONE</span><h3 style="margin:14px 0">RESET LOCAL APP</h3><p class="muted">This removes local progress, notes, and locally cached screenshots. It does not delete files already committed to GitHub.</p><button class="button button-red" id="clearDataButton">CLEAR LOCAL DATA</button></div>
      </aside>
    </div>`;
}

function renderCurrentSection() {
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.nav === currentSection));
  switch (currentSection) {
    case 'roadmap': renderRoadmap(); break;
    case 'projects': renderProjects(); break;
    case 'plans': renderPlans(); break;
    case 'reviews': renderReviews(); break;
    case 'resources': renderResources(); break;
    case 'pdf': renderPdf(); break;
    case 'settings': renderSettings(); break;
    default: renderDashboard();
  }
  updateHeaderProgress();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function persist() {
  state = await saveState(state);
  updateHeaderProgress();
}

function navigate(section, phaseNumber = null) {
  currentSection = section;
  renderCurrentSection();
  closeSidebar();
  if (phaseNumber) setTimeout(() => document.querySelector(`#phase-${phaseNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function openSidebar() { sidebar.classList.add('open'); sidebarScrim.classList.add('visible'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarScrim.classList.remove('visible'); }

function showToast(message, kind = 'success', timeout = 3400) {
  const toast = document.createElement('div');
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  document.querySelector('#toastRegion').append(toast);
  setTimeout(() => toast.remove(), timeout);
}

function updateRowVisual(id, done) {
  document.querySelectorAll(`[data-task-row="${CSS.escape(id)}"]`).forEach((row) => row.classList.toggle('completed', done));
}

async function toggleTask(id, checked) {
  state.taskStates[id] = checked;
  updateRowVisual(id, checked);
  await persist();
  if (currentSection === 'dashboard') renderDashboard();
}

function getTaskDate(id) { return state.reviews?.taskDates?.[id] || ''; }
async function setTaskDate(id, value) {
  state.reviews.taskDates ||= {};
  state.reviews.taskDates[id] = value;
  await persist();
}

async function openWorkspace(id) {
  if (noteSaveTimer) { clearTimeout(noteSaveTimer); noteSaveTimer = null; }
  const record = taskIndex.get(id);
  if (!record) return;
  currentTaskId = id;
  workspaceTitle.textContent = record.title;
  workspaceContext.textContent = record.context || 'Task workspace';
  workspaceEvidence.textContent = record.evidence || 'Portfolio-safe evidence';
  taskNotes.value = state.notes[id] || '';
  reviewDate.value = getTaskDate(id);
  updateStagePicker();
  markTaskButton.textContent = isDone(id) ? 'MARK INCOMPLETE' : 'MARK COMPLETE';
  autosaveStatus.textContent = 'Saved locally.';
  await renderScreenshotGallery();
  workspaceDialog.showModal();
}

function updateStagePicker() {
  stagePicker.querySelectorAll('[data-stage]').forEach((button) => button.classList.toggle('active', button.dataset.stage === stageFor(currentTaskId)));
}

function revokeObjectUrls() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

async function renderScreenshotGallery() {
  revokeObjectUrls();
  const items = state.screenshots[currentTaskId] || [];
  if (!items.length) {
    screenshotGallery.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><strong>No screenshots attached.</strong><p>Paste a screenshot directly into this workspace or choose files.</p></div>';
    return;
  }
  screenshotGallery.innerHTML = '';
  for (const meta of items) {
    const file = await getFileRecord(meta.id);
    const card = document.createElement('article');
    card.className = 'shot-card';
    let preview = '<div class="empty-state" style="height:170px"><strong>File unavailable locally</strong><p>Pull from GitHub to restore it.</p></div>';
    if (file?.blob) {
      const url = URL.createObjectURL(file.blob);
      objectUrls.set(meta.id, url);
      preview = `<img src="${url}" alt="${escapeHtml(meta.name || 'Learning evidence screenshot')}">`;
    }
    card.innerHTML = `${preview}<button type="button" class="shot-remove" data-remove-shot="${escapeHtml(meta.id)}" aria-label="Remove screenshot">✕</button><div class="shot-meta">${escapeHtml(meta.name || 'Screenshot')}<br>${meta.remotePath ? 'SYNCED TO GITHUB' : 'LOCAL ONLY'}</div>`;
    screenshotGallery.append(card);
  }
}

async function addScreenshots(fileList) {
  if (!currentTaskId) return;
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return showToast('Choose or paste an image file.', 'error');
  state.screenshots[currentTaskId] ||= [];
  for (const file of files) {
    if (file.size > 12 * 1024 * 1024) {
      showToast(`${file.name} is larger than 12 MB and was skipped.`, 'error');
      continue;
    }
    const id = createId('shot');
    const meta = { id, taskId: currentTaskId, name: file.name || `pasted-${Date.now()}.png`, type: file.type || 'image/png', size: file.size, createdAt: new Date().toISOString(), remotePath: '' };
    await saveFileRecord({ ...meta, blob: file });
    state.screenshots[currentTaskId].push(meta);
  }
  await persist();
  await renderScreenshotGallery();
  showToast(`${files.length} screenshot${files.length === 1 ? '' : 's'} saved locally.`);
}

async function removeScreenshot(id) {
  state.screenshots[currentTaskId] = (state.screenshots[currentTaskId] || []).filter((item) => item.id !== id);
  await deleteFileRecord(id);
  await persist();
  await renderScreenshotGallery();
}

function githubConfig() {
  return {
    owner: state.settings.githubOwner.trim(),
    repo: state.settings.githubRepo.trim(),
    branch: state.settings.githubBranch.trim() || 'main',
    dataPath: state.settings.githubDataPath.trim() || 'roadmap-data',
    token: githubToken.trim(),
  };
}

function setSyncUi(progress) {
  const bar = document.querySelector('#syncProgressBar');
  const label = document.querySelector('#syncProgressLabel');
  const wrap = document.querySelector('#syncProgress');
  if (wrap) wrap.classList.add('visible');
  if (bar) bar.style.width = `${Math.round((progress.completed / Math.max(progress.total, 1)) * 100)}%`;
  if (label) label.textContent = progress.label;
  quickSyncButton.textContent = `${progress.completed}/${progress.total}`;
}

async function pushAll() {
  try {
    quickSyncButton.disabled = true;
    quickSyncButton.textContent = 'SYNCING';
    const synced = await pushRoadmapData({ config: githubConfig(), state, getLocalFile: getFileRecord, onProgress: setSyncUi });
    state = synced;
    await persist();
    showToast('Progress, notes, and screenshots were committed to GitHub.');
    if (currentSection === 'settings') renderSettings();
    if (workspaceDialog.open) await renderScreenshotGallery();
  } catch (error) {
    showToast(error.message, 'error', 6500);
  } finally {
    quickSyncButton.disabled = false;
    quickSyncButton.textContent = 'SYNC';
  }
}

async function pullAll() {
  if (!window.confirm('Pulling will replace local progress with the repository copy. Continue?')) return;
  try {
    quickSyncButton.disabled = true;
    const remote = await pullRoadmapData({ config: githubConfig(), saveLocalFile: saveFileRecord, onProgress: setSyncUi });
    const localSettings = state.settings;
    const localProfile = state.profile;
    state = { ...remote, settings: localSettings, profile: { ...remote.profile, ...localProfile } };
    await persist();
    renderCurrentSection();
    showToast('GitHub progress and screenshots restored locally.');
  } catch (error) {
    showToast(error.message, 'error', 6500);
  } finally {
    quickSyncButton.disabled = false;
    quickSyncButton.textContent = 'SYNC';
  }
}

function applyRoadmapFilters() {
  const query = (document.querySelector('#roadmapSearch')?.value || '').trim().toLowerCase();
  const status = document.querySelector('#roadmapStatusFilter')?.value || 'all';
  document.querySelectorAll('[data-phase-card]').forEach((card) => {
    const phaseText = card.dataset.searchText || '';
    let anyVisible = false;
    card.querySelectorAll('.task-row').forEach((row) => {
      const id = row.dataset.taskRow;
      const record = taskIndex.get(id);
      const text = `${record?.title || ''} ${record?.evidence || ''}`.toLowerCase();
      const hasEvidence = Boolean((state.notes[id] || '').trim() || (state.screenshots[id] || []).length);
      const statusMatch = status === 'all' || (status === 'open' && !isDone(id)) || (status === 'done' && isDone(id)) || (status === 'evidence' && hasEvidence);
      const textMatch = !query || text.includes(query) || phaseText.includes(query);
      const visible = statusMatch && textMatch;
      row.classList.toggle('hidden', !visible);
      if (visible) anyVisible = true;
    });
    card.classList.toggle('hidden', !anyVisible && Boolean(query || status !== 'all'));
  });
}

async function handleClick(event) {
  const nav = event.target.closest('[data-nav]');
  if (nav) return navigate(nav.dataset.nav, nav.dataset.scrollPhase || null);

  const workspace = event.target.closest('[data-workspace-id]');
  if (workspace) return openWorkspace(workspace.dataset.workspaceId);

  const phaseToggle = event.target.closest('[data-toggle-phase]');
  if (phaseToggle) {
    const num = phaseToggle.dataset.togglePhase;
    const target = document.querySelector(`[data-phase-content="${num}"]`);
    target.classList.toggle('hidden');
    phaseToggle.textContent = target.classList.contains('hidden') ? 'EXPAND' : 'COLLAPSE';
    return;
  }

  const plan = event.target.closest('[data-plan]');
  if (plan) {
    state.profile.activePlan = plan.dataset.plan;
    await persist();
    return renderPlans();
  }

  const stageButton = event.target.closest('[data-stage]');
  if (stageButton && currentTaskId) {
    state.taskStages[currentTaskId] = stageButton.dataset.stage;
    await persist();
    updateStagePicker();
    return;
  }

  const removeShot = event.target.closest('[data-remove-shot]');
  if (removeShot) return removeScreenshot(removeShot.dataset.removeShot);

  switch (event.target.id) {
    case 'menuButton': return openSidebar();
    case 'chooseScreenshotButton': return screenshotInput.click();
    case 'markTaskButton':
      if (currentTaskId) { await toggleTask(currentTaskId, !isDone(currentTaskId)); markTaskButton.textContent = isDone(currentTaskId) ? 'MARK INCOMPLETE' : 'MARK COMPLETE'; }
      return;
    case 'saveAndSyncTaskButton':
      if (noteSaveTimer) clearTimeout(noteSaveTimer);
      state.notes[currentTaskId] = taskNotes.value;
      await persist();
      return pushAll();
    case 'quickSyncButton': return pushAll();
    case 'expandAllButton':
      document.querySelectorAll('[data-phase-content]').forEach((el) => el.classList.remove('hidden'));
      document.querySelectorAll('[data-toggle-phase]').forEach((el) => { el.textContent = 'COLLAPSE'; });
      return;
    case 'saveMonthlyReviewButton': {
      const draft = state.reviews.monthlyDraft || {};
      if (!Object.values(draft).some((value) => String(value || '').trim())) return showToast('Add at least one review detail first.', 'error');
      state.reviews.monthlyHistory ||= [];
      state.reviews.monthlyHistory.push({ ...draft, savedAt: new Date().toISOString() });
      state.reviews.monthlyDraft = {};
      await persist();
      renderReviews();
      return showToast('Monthly review saved.');
    }
    case 'clearMonthlyDraftButton':
      state.reviews.monthlyDraft = {};
      await persist();
      return renderReviews();
    case 'addSessionButton': {
      const what = document.querySelector('#sessionWhat')?.value.trim();
      if (!what) return showToast('Describe what you learned or built.', 'error');
      state.sessions.push({ id: createId('session'), date: document.querySelector('#sessionDate').value, phase: document.querySelector('#sessionPhase').value, what, evidence: document.querySelector('#sessionEvidence').value, createdAt: new Date().toISOString() });
      await persist();
      renderReviews();
      return showToast('Learning session added.');
    }
    case 'testGithubButton':
      try { const repo = await testConnection(githubConfig()); showToast(`Connected to ${repo.fullName} (${repo.private ? 'private' : 'public'}).`); }
      catch (error) { showToast(error.message, 'error', 6500); }
      return;
    case 'pushGithubButton': return pushAll();
    case 'pullGithubButton': return pullAll();
    case 'exportDataButton': {
      const blob = new Blob([exportStateJson(state)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `web-analytics-roadmap-${new Date().toISOString().slice(0,10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    case 'clearDataButton':
      if (!window.confirm('Delete all local progress, notes, and screenshot cache? GitHub files will remain.')) return;
      await clearAllData();
      state = await loadState();
      githubToken = '';
      renderCurrentSection();
      return showToast('Local data cleared.');
  }
}

async function handleChange(event) {
  const checkbox = event.target.closest('[data-check-id]');
  if (checkbox) return toggleTask(checkbox.dataset.checkId, checkbox.checked);

  if (event.target.id === 'screenshotInput') {
    await addScreenshots(event.target.files);
    event.target.value = '';
    return;
  }

  if (event.target.id === 'reviewDate' && currentTaskId) return setTaskDate(currentTaskId, event.target.value);

  if (event.target.matches('.settings-input')) {
    state.settings[event.target.dataset.setting] = event.target.value;
    await persist();
    return;
  }

  if (event.target.matches('.profile-input')) {
    state.profile[event.target.dataset.profile] = event.target.value;
    await persist();
    return;
  }

  if (event.target.id === 'githubTokenInput') {
    githubToken = event.target.value;
    if (state.settings.rememberTokenForSession) setSessionToken(githubToken);
    return;
  }

  if (event.target.id === 'rememberTokenCheckbox') {
    state.settings.rememberTokenForSession = event.target.checked;
    if (event.target.checked) setSessionToken(githubToken); else setSessionToken('');
    await persist();
    return;
  }

  if (event.target.id === 'importDataInput' && event.target.files?.[0]) {
    try {
      const imported = importStateJson(await event.target.files[0].text());
      imported.settings = state.settings;
      state = imported;
      await persist();
      renderCurrentSection();
      showToast('JSON data imported.');
    } catch (error) { showToast(error.message, 'error'); }
  }
}

function handleInput(event) {
  if (event.target.id === 'taskNotes' && currentTaskId) {
    autosaveStatus.textContent = 'Saving locally...';
    clearTimeout(noteSaveTimer);
    const taskId = currentTaskId;
    const noteValue = taskNotes.value;
    noteSaveTimer = setTimeout(async () => {
      state.notes[taskId] = noteValue;
      await persist();
      if (currentTaskId === taskId) autosaveStatus.textContent = 'Saved locally.';
    }, 450);
  }
  if (event.target.matches('.monthly-input')) {
    state.reviews.monthlyDraft ||= {};
    state.reviews.monthlyDraft[event.target.dataset.monthlyKey] = event.target.value;
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => persist(), 350);
  }
  if (event.target.id === 'roadmapSearch' || event.target.id === 'roadmapStatusFilter') applyRoadmapFilters();
  if (event.target.id === 'githubTokenInput') {
    githubToken = event.target.value;
    if (state.settings.rememberTokenForSession) setSessionToken(githubToken);
  }
}

function setupDropZone() {
  ['dragenter','dragover'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.add('dragging'); }));
  ['dragleave','drop'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
  dropZone.addEventListener('drop', (event) => addScreenshots(event.dataTransfer.files));
  dropZone.addEventListener('click', (event) => { if (!event.target.closest('button')) screenshotInput.click(); });
  workspaceDialog.addEventListener('paste', (event) => {
    const images = [...event.clipboardData.items].filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean);
    if (images.length) { event.preventDefault(); addScreenshots(images); }
  });
}

async function init() {
  buildTaskIndex();
  state = await loadState();
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  sidebarScrim.addEventListener('click', closeSidebar);
  setupDropZone();
  workspaceDialog.addEventListener('close', revokeObjectUrls);
  renderCurrentSection();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init().catch((error) => {
  content.innerHTML = `<div class="empty-state"><h2>APP FAILED TO START</h2><p>${escapeHtml(error.message)}</p></div>`;
});
