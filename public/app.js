const $ = (selector) => document.querySelector(selector);
const proposalDialog = $("#proposal-dialog");
const documentDialog = $("#document-dialog");
let proposals = [];
let toastTimer;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.errors?.join(" ") || `Request failed (${response.status}).`);
  }
  return result;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function renderProposalList() {
  const list = $("#proposal-list");
  $("#proposal-count").textContent = proposals.length;
  $("#metric-total").textContent = proposals.length;
  $("#metric-drafts").textContent = proposals.filter((item) => item.status === "draft").length;
  $("#metric-accepted").textContent = proposals.filter((item) => item.status === "accepted").length;

  if (!proposals.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">✳</span><strong>Your next great partnership starts here.</strong><p>Create a proposal from a few notes about your client and their goals.</p><button class="button button-secondary" id="empty-create">Create your first proposal</button></div>`;
    $("#empty-create").addEventListener("click", openIntake);
    return;
  }

  list.innerHTML = proposals.map((item) => `
    <button class="proposal-row" data-proposal-id="${escapeHtml(item.id)}">
      <span class="proposal-name"><strong>${escapeHtml(item.projectTitle)}</strong><small>${escapeHtml(item.clientName)}</small></span>
      <span class="proposal-value">${money(item.totalCents)}</span>
      <span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
      <span class="proposal-date">${new Date(item.createdAt).toLocaleDateString()}</span>
      <span class="row-arrow">›</span>
    </button>`).join("");
  list.querySelectorAll("[data-proposal-id]").forEach((button) => {
    button.addEventListener("click", () => openProposal(button.dataset.proposalId));
  });
}

async function loadProposals() {
  try {
    proposals = await api("/api/proposals");
    renderProposalList();
  } catch (error) {
    $("#proposal-list").innerHTML = `<div class="empty-state"><strong>Could not load proposals.</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function openIntake() {
  $("#form-error").classList.add("hidden");
  proposalDialog.showModal();
}

function renderDocument(record) {
  const { document: proposal, validation, id } = record;
  const meta = proposal.proposalMetadata;
  const sections = proposal.sections;
  const warnings = validation.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  const errors = validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
  $("#document-content").innerHTML = `
    <div class="document-top">
      <strong>Proposal preview</strong>
      <div class="document-actions">
        <button class="button button-secondary" data-print>Export PDF</button>
        ${meta.status === "draft" ? `<button class="button button-primary" data-accept="${escapeHtml(id)}">Accept &amp; start onboarding</button>` : `<span class="badge accepted">Accepted</span>`}
        <button class="icon-button" data-document-close aria-label="Close">×</button>
      </div>
    </div>
    <article class="proposal-document">
      <div class="doc-brand">T-03 PROPOSAL STUDIO</div>
      <div class="doc-kicker">PROJECT PROPOSAL</div>
      <h2>${escapeHtml(meta.projectTitle)}</h2>
      <div class="doc-client">Prepared for ${escapeHtml(meta.clientName)}</div>
      <div class="doc-meta">
        <div><span>PROJECT ESTIMATE</span><strong>${money(meta.totalCents)} USD</strong></div>
        <div><span>ESTIMATED TIMELINE</span><strong>${meta.timelineWeeks} weeks</strong></div>
        <div><span>PROPOSAL STATUS</span><strong>${escapeHtml(meta.status)}</strong></div>
      </div>
      <section class="doc-section"><h3>Executive summary</h3><p>${escapeHtml(sections.executiveSummary)}</p></section>
      <section class="doc-section"><h3>Understanding your needs</h3><p>${escapeHtml(sections.problemNeeds)}</p></section>
      <section class="doc-section"><h3>Proposed solution</h3><p>${escapeHtml(sections.proposedSolution)}</p></section>
      <section class="doc-section"><h3>Scope, milestones &amp; investment</h3>
        ${sections.milestones.map((milestone) => `<div class="milestone"><div><strong>${escapeHtml(milestone.phase)}</strong><small>${milestone.deliverables.map(escapeHtml).join(" · ")}</small></div><span>${money(milestone.costCents)}<small>${milestone.weeks} weeks</small></span></div>`).join("")}
        <div class="doc-total"><span>Estimated total</span><span>${money(meta.totalCents)} USD</span></div>
      </section>
      <section class="doc-section"><h3>Draft terms &amp; assumptions</h3><p>${escapeHtml(sections.terms)}</p></section>
      <section class="doc-section"><h3>Reference materials</h3><p>${proposal.context.map((item) => escapeHtml(item.title)).join(" · ") || "No matching records"}</p></section>
      <div class="validation ${validation.valid ? "" : "warning"}">${validation.valid ? "✓ Arithmetic and required terms validated." : `Validation needs attention:<ul class="validation-list">${errors}</ul>`}</div>
      ${warnings ? `<div class="validation warning"><ul class="validation-list">${warnings}</ul></div>` : ""}
      <p style="font-size:9px;color:#959d98;margin-top:15px">Planning estimate only. Final scope, acceptance criteria, and binding commercial terms require mutual written approval.</p>
    </article>`;

  $("[data-print]").addEventListener("click", () => window.print());
  $("[data-document-close]").addEventListener("click", () => documentDialog.close());
  const acceptButton = $("[data-accept]");
  if (acceptButton) {
    acceptButton.addEventListener("click", async () => {
      acceptButton.disabled = true;
      try {
        await api(`/api/proposals/${id}/accept`, { method: "POST", body: "{}" });
        documentDialog.close();
        await loadProposals();
        await loadOnboarding();
        showToast("Proposal accepted. Client onboarding is ready.");
      } catch (error) {
        acceptButton.disabled = false;
        showToast(error.message);
      }
    });
  }
}

async function openProposal(id) {
  try {
    const record = await api(`/api/proposals/${id}`);
    renderDocument(record);
    documentDialog.showModal();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadOnboarding() {
  const container = $("#onboarding-list");
  try {
    const records = await api("/api/onboarding");
    if (!records.length) {
      container.innerHTML = `<section class="content-card"><div class="empty-state"><span class="empty-icon">↗</span><strong>No clients in onboarding yet.</strong><p>Accept a proposal to create a kickoff schedule and client asset checklist.</p></div></section>`;
      return;
    }
    container.innerHTML = records.map((record) => `
      <article class="onboarding-card">
        <div class="eyebrow">KICKOFF READY</div>
        <h2>${escapeHtml(record.clientName)} · ${escapeHtml(record.projectTitle)}</h2>
        <p>Created ${new Date(record.createdAt).toLocaleDateString()} from an accepted proposal.</p>
        <div class="onboarding-grid">
          <section><h3>Milestone schedule</h3>${record.schedule.map((item) => `<div class="schedule-item"><strong>${escapeHtml(item.stage)} · week ${item.weeksFromStart + 1}</strong><small>${item.durationWeeks} weeks · ${item.deliverables.map(escapeHtml).join(" · ")}</small></div>`).join("")}</section>
          <section><h3>Client asset checklist</h3>${record.checklist.map((item) => `<label class="checklist-item"><input type="checkbox"> ${escapeHtml(item)}</label>`).join("")}</section>
        </div>
      </article>`).join("");
  } catch (error) {
    container.innerHTML = `<section class="content-card"><div class="empty-state"><strong>Could not load onboarding.</strong><p>${escapeHtml(error.message)}</p></div></section>`;
  }
}

function showView(view) {
  const onboarding = view === "onboarding";
  $("#proposals-view").classList.toggle("hidden", onboarding);
  $("#onboarding-view").classList.toggle("hidden", !onboarding);
  $("#breadcrumb-current").textContent = onboarding ? "Client onboarding" : "Proposals";
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (onboarding) loadOnboarding();
}

$("#new-proposal").addEventListener("click", openIntake);
document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => proposalDialog.close());
});
$("#intake-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const errorBox = $("#form-error");
  const fields = Object.fromEntries(new FormData(form).entries());
  const payload = {
    ...fields,
    budgetCapCents: fields.budgetCap ? Math.round(Number(fields.budgetCap) * 100) : 0,
    timelineCapWeeks: fields.timelineCap ? Number(fields.timelineCap) : 0
  };
  delete payload.budgetCap;
  delete payload.timelineCap;
  submit.disabled = true;
  submit.textContent = "Building proposal…";
  errorBox.classList.add("hidden");
  try {
    const record = await api("/api/proposals", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    proposalDialog.close();
    form.reset();
    await loadProposals();
    renderDocument(record);
    documentDialog.showModal();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'Generate proposal <span>→</span>';
  }
});

api("/api/health").then((health) => {
  $("#generator-mode").textContent = health.generator;
}).catch(() => {
  $("#generator-mode").textContent = "Generator unavailable";
});
loadProposals();
