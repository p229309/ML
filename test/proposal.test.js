const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildProposal,
  retrieveKnowledge,
  validateIntake,
  validateProposal
} = require("../src/proposal");

const intake = {
  clientName: "Acme",
  projectTitle: "Platform refresh",
  businessType: "SaaS",
  targetAudience: "Operations team",
  technicalMaturity: "Growing",
  painPoints: "slow cloud platform",
  competitorContext: "",
  deliverables: "Architecture review\nCloud migration\nLaunch support",
  techStack: "AWS",
  tone: "Modern Agency",
  budgetCapCents: 0,
  timelineCapWeeks: 0
};

test("proposal milestones reconcile to the estimate and timeline", () => {
  const proposal = buildProposal(intake);
  const result = validateProposal(proposal, intake);
  assert.equal(result.valid, true);
  assert.equal(
    proposal.sections.milestones.reduce((total, phase) => total + phase.costCents, 0),
    proposal.proposalMetadata.totalCents
  );
  assert.equal(
    proposal.sections.milestones.reduce((total, phase) => total + phase.weeks, 0),
    proposal.proposalMetadata.timelineWeeks
  );
});

test("proposal validation surfaces budget and schedule constraint warnings", () => {
  const constrained = { ...intake, budgetCapCents: 1, timelineCapWeeks: 1 };
  const result = validateProposal(buildProposal(constrained), constrained);
  assert.equal(result.valid, true);
  assert.equal(result.warnings.length, 2);
});

test("retrieval ranks context using intake terms and includes standard terms", () => {
  const context = retrieveKnowledge(intake);
  assert.ok(context.some((item) => item.id === "guide-saas"));
  assert.ok(context.some((item) => item.type === "terms"));
  assert.ok(context.some((item) => item.type === "pricing"));
});

test("proposal tone changes the deterministic narrative", () => {
  const corporate = buildProposal({ ...intake, tone: "Corporate" });
  const minimalist = buildProposal({ ...intake, tone: "Startup Minimalist" });
  assert.notEqual(
    corporate.sections.executiveSummary,
    minimalist.sections.executiveSummary
  );
});

test("seeded references and draft legal terms do not claim real client work", () => {
  const proposal = buildProposal(intake);
  assert.ok(proposal.context.every((item) =>
    item.type === "pricing" || item.type === "terms" || item.title.startsWith("Example only:")
  ));
  assert.match(proposal.sections.terms, /^DRAFT FOR REVIEW/);
});

test("intake validation requires client, project, and valid constraints", () => {
  assert.deepEqual(validateIntake({}), [
    "Client name is required.",
    "Project title is required.",
    "Deliverables must be provided as a list."
  ]);
  assert.ok(validateIntake({ ...intake, timelineCapWeeks: -1 }).includes(
    "timelineCapWeeks must be a non-negative whole number."
  ));
});
