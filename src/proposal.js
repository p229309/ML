const DEFAULT_RATE_CENTS = 12500;

const KNOWLEDGE = [
  {
    id: "guide-saas",
    type: "delivery-guide",
    title: "Example only: SaaS platform modernization approach",
    tags: ["saas", "cloud", "migration", "platform", "architecture"],
    text: "Illustrative delivery pattern: stage a cloud migration, review infrastructure, and define reliability improvements. This is not a client case study."
  },
  {
    id: "guide-commerce",
    type: "delivery-guide",
    title: "Example only: commerce experience approach",
    tags: ["commerce", "ecommerce", "customer", "website", "conversion"],
    text: "Illustrative delivery pattern: prioritize performance goals, accessible interfaces, and incremental releases. This is not a client case study."
  },
  {
    id: "team-platform",
    type: "skill-profile",
    title: "Example only: platform engineering skill profile",
    tags: ["cloud", "devops", "security", "infrastructure", "migration"],
    text: "Illustrative skills to consider: cloud architecture, deployment automation, infrastructure reviews, and security-minded delivery. This is not a team bio."
  },
  {
    id: "team-product",
    type: "skill-profile",
    title: "Example only: product design and engineering skill profile",
    tags: ["design", "product", "frontend", "website", "customer"],
    text: "Illustrative skills to consider: research-informed journeys, accessible interfaces, and maintainable web applications. This is not a team bio."
  },
  {
    id: "pricing-standard",
    type: "pricing",
    title: "Example only: planning rate card",
    tags: ["pricing", "rate", "project", "budget"],
    text: "Planning estimate: $125 per delivery hour. Fixed-price estimates require confirmation after discovery and scope review."
  },
  {
    id: "terms-standard",
    type: "terms",
    title: "Example only: draft engagement terms",
    tags: ["terms", "payment", "revisions", "ownership", "sla"],
    text: "Example terms only; not legal advice or an approved company policy. Draft concepts: invoice timing, revision rounds, intellectual-property transfer, warranty, and support response targets must be reviewed and agreed in a signed statement of work."
  }
];

function tokens(value) {
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9]+/g) || []);
}

function retrieveKnowledge(intake, limit = 4) {
  const query = tokens([
    intake.businessType,
    intake.targetAudience,
    intake.technicalMaturity,
    intake.painPoints,
    intake.competitorContext,
    intake.deliverables,
    intake.techStack
  ].join(" "));

  return KNOWLEDGE
    .map((item) => ({
      ...item,
      score: item.tags.reduce((total, tag) => total + Number(query.has(tag)), 0)
    }))
    .filter((item) => item.score > 0 || item.type === "terms" || item.type === "pricing")
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ score, ...item }) => item);
}

function distribute(total, count) {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? total - base * (count - 1) : base
  );
}

function buildProposal(intake, narrative = {}, knowledge = KNOWLEDGE) {
  const deliverables = intake.deliverables
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const scope = deliverables.length ? deliverables : ["Discovery and prioritized delivery plan"];
  const estimatedHours = Math.max(40, scope.length * 24);
  const totalCents = estimatedHours * DEFAULT_RATE_CENTS;
  const phaseCount = Math.min(3, Math.max(1, Math.ceil(scope.length / 2)));
  const phaseCosts = distribute(totalCents, phaseCount);
  const timelineWeeks = Math.max(2, Math.ceil(scope.length * 1.5));
  const phaseWeeks = distribute(timelineWeeks, phaseCount);
  const phaseNames = ["Discovery & foundation", "Core implementation", "Launch & handoff"];
  const milestones = Array.from({ length: phaseCount }, (_, index) => ({
    phase: phaseNames[index],
    weeks: phaseWeeks[index],
    costCents: phaseCosts[index],
    deliverables: scope.slice(
      Math.floor((scope.length * index) / phaseCount),
      Math.floor((scope.length * (index + 1)) / phaseCount)
    )
  }));
  const client = intake.clientName.trim();
  const project = intake.projectTitle.trim();
  const tone = intake.tone || "Modern Agency";
  const painPoints = intake.painPoints.trim() || "an opportunity to improve the current experience";
  const audience = intake.targetAudience.trim() || "the target audience";
  const competitorNote = intake.competitorContext.trim()
    ? ` Competitive context: ${intake.competitorContext.trim()}.`
    : "";
  const executiveSummary = {
    Corporate: `${client} has identified ${painPoints} as an area for improvement. This proposal outlines a structured ${project} engagement aligned with ${audience}${intake.businessType.trim() ? ` in the ${intake.businessType.trim()} sector` : ""}.`,
    "Startup Minimalist": `A focused plan for ${client}: fix ${painPoints}, serve ${audience}, and move ${project} forward in clear, reviewable steps.`,
    "Technical Deep-Dive": `${client}'s ${project} engagement addresses ${painPoints} through phased delivery, defined technical checkpoints, and an approach aligned to ${intake.technicalMaturity.trim() || "the current environment"}.`,
    "Modern Agency": `${client} is looking to improve ${intake.painPoints.trim() || "its current operations"}. This ${project} engagement pairs a focused delivery plan with measurable checkpoints, informed by the stated audience, technical environment, and priorities.`
  }[tone] || `${client} is looking to improve ${intake.painPoints.trim() || "its current operations"}. This ${project} engagement pairs a focused delivery plan with measurable checkpoints, informed by the stated audience, technical environment, and priorities.`;

  return {
    proposalMetadata: {
      clientName: client,
      projectTitle: project,
      businessType: intake.businessType.trim(),
      totalCents,
      currency: "USD",
      timelineWeeks,
      tone,
      status: "draft",
      createdAt: new Date().toISOString()
    },
    sections: {
      executiveSummary: narrative.executiveSummary || executiveSummary,
      problemNeeds: narrative.problemNeeds ||
        `The discovery brief highlights ${painPoints}. The work will account for ${intake.technicalMaturity.trim() || "the existing technical environment"} and the needs of ${audience}.${competitorNote}`,
      proposedSolution: narrative.proposedSolution ||
        `Deliver ${scope.join(", ")}${intake.techStack.trim() ? ` using the preferred ${intake.techStack.trim()} stack` : ""}. Work is organized into reviewable milestones; scope and acceptance criteria are confirmed before delivery begins.`,
      milestones,
      addOns: [],
      terms: "DRAFT FOR REVIEW — Example terms only; not legal advice or approved company policy. Invoice timing, revision rounds, intellectual-property ownership, warranty, support response targets, and final acceptance criteria must be confirmed, reviewed, and agreed in the signed statement of work."
    },
    context: retrieveKnowledge(intake, 4, knowledge)
  };
}

function validateProposal(proposal, intake) {
  const errors = [];
  const warnings = [];
  const milestones = proposal.sections.milestones;
  const sum = milestones.reduce((total, milestone) => total + milestone.costCents, 0);
  const weeks = milestones.reduce((total, milestone) => total + milestone.weeks, 0);

  if (sum !== proposal.proposalMetadata.totalCents) {
    errors.push("Milestone costs do not add up to the proposal total.");
  }
  if (weeks !== proposal.proposalMetadata.timelineWeeks) {
    errors.push("Milestone durations do not add up to the total timeline.");
  }
  if (!proposal.sections.terms.trim()) {
    errors.push("Required engagement terms are missing.");
  }
  if (intake.budgetCapCents && sum > intake.budgetCapCents) {
    warnings.push("The estimate exceeds the stated budget cap.");
  }
  if (intake.timelineCapWeeks && weeks > intake.timelineCapWeeks) {
    warnings.push("The estimated timeline exceeds the requested timeline constraint.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateIntake(input) {
  const errors = [];
  if (typeof input.clientName !== "string" || !input.clientName.trim()) {
    errors.push("Client name is required.");
  }
  if (typeof input.projectTitle !== "string" || !input.projectTitle.trim()) {
    errors.push("Project title is required.");
  }
  if (typeof input.deliverables !== "string") {
    errors.push("Deliverables must be provided as a list.");
  }
  for (const field of ["budgetCapCents", "timelineCapWeeks"]) {
    if (input[field] !== "" && input[field] !== undefined &&
        (!Number.isSafeInteger(Number(input[field])) || Number(input[field]) < 0)) {
      errors.push(`${field} must be a non-negative whole number.`);
    }
  }
  return errors;
}

module.exports = {
  KNOWLEDGE,
  buildProposal,
  retrieveKnowledge,
  validateIntake,
  validateProposal
};
