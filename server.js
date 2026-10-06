const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  KNOWLEDGE,
  buildProposal,
  validateIntake,
  validateProposal
} = require("./src/proposal");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "";
const database = new DatabaseSync(path.join(ROOT, "t03.sqlite"));

database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    tags TEXT NOT NULL,
    text TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    client_name TEXT NOT NULL,
    project_title TEXT NOT NULL,
    status TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    timeline_weeks INTEGER NOT NULL,
    document TEXT NOT NULL,
    validation TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS onboarding (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),
    client_name TEXT NOT NULL,
    project_title TEXT NOT NULL,
    schedule TEXT NOT NULL,
    checklist TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const insertKnowledge = database.prepare(
  "INSERT OR IGNORE INTO knowledge (id, type, title, tags, text) VALUES (?, ?, ?, ?, ?)"
);
for (const item of KNOWLEDGE) {
  insertKnowledge.run(item.id, item.type, item.title, item.tags.join(","), item.text);
}

function jsonResponse(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body exceeds the 1 MB limit."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

async function generateNarrative(intake, context) {
  if (!OLLAMA_MODEL) return {};

  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: "json",
      messages: [
        {
          role: "system",
          content: "Write concise, specific proposal copy in the tone specified in the intake (Corporate = formal and structured; Modern Agency = polished and collaborative; Startup Minimalist = direct and concise; Technical Deep-Dive = precise and implementation-oriented). Use only the supplied intake and retrieved knowledge. Never invent clients, case-study results, team credentials, guarantees, or metrics. Treat records explicitly marked example-only as illustrative patterns, not evidence of past work or actual staff. If a fact is absent, omit it. Return only JSON with string fields executiveSummary, problemNeeds, proposedSolution."
        },
        {
          role: "user",
          content: JSON.stringify({ intake, retrievedCompanyKnowledge: context })
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with HTTP ${response.status}.`);
  }
  const result = await response.json();
  let content;
  try {
    content = JSON.parse(result.message.content);
  } catch {
    throw new Error("Ollama returned invalid JSON for the proposal narrative.");
  }
  for (const field of ["executiveSummary", "problemNeeds", "proposedSolution"]) {
    if (typeof content[field] !== "string" || !content[field].trim()) {
      throw new Error(`Ollama response is missing the ${field} section.`);
    }
  }
  return content;
}

function parseIntake(body) {
  return {
    clientName: String(body.clientName || ""),
    projectTitle: String(body.projectTitle || ""),
    businessType: String(body.businessType || ""),
    targetAudience: String(body.targetAudience || ""),
    technicalMaturity: String(body.technicalMaturity || ""),
    painPoints: String(body.painPoints || ""),
    competitorContext: String(body.competitorContext || ""),
    deliverables: String(body.deliverables || ""),
    techStack: String(body.techStack || ""),
    tone: String(body.tone || "Modern Agency"),
    budgetCapCents: body.budgetCapCents === "" || body.budgetCapCents == null
      ? 0 : Number(body.budgetCapCents),
    timelineCapWeeks: body.timelineCapWeeks === "" || body.timelineCapWeeks == null
      ? 0 : Number(body.timelineCapWeeks)
  };
}

function listProposals() {
  return database.prepare(`
    SELECT id, client_name AS clientName, project_title AS projectTitle,
      status, total_cents AS totalCents, timeline_weeks AS timelineWeeks,
      created_at AS createdAt
    FROM proposals ORDER BY created_at DESC
  `).all();
}

function loadKnowledge() {
  return database.prepare("SELECT id, type, title, tags, text FROM knowledge")
    .all()
    .map((item) => ({ ...item, tags: item.tags.split(",") }));
}

function routeApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    return jsonResponse(response, 200, {
      status: "ok",
      generator: OLLAMA_MODEL ? `Ollama (${OLLAMA_MODEL})` : "Local rules (no model configured)"
    });
  }
  if (request.method === "GET" && url.pathname === "/api/proposals") {
    return jsonResponse(response, 200, listProposals());
  }
  if (request.method === "GET" && url.pathname === "/api/onboarding") {
    const records = database.prepare(`
      SELECT id, proposal_id AS proposalId, client_name AS clientName,
        project_title AS projectTitle, schedule, checklist, created_at AS createdAt
      FROM onboarding ORDER BY created_at DESC
    `).all().map((row) => ({
      ...row,
      schedule: JSON.parse(row.schedule),
      checklist: JSON.parse(row.checklist)
    }));
    return jsonResponse(response, 200, records);
  }

  const proposalMatch = url.pathname.match(/^\/api\/proposals\/([0-9a-f-]+)$/i);
  if (request.method === "GET" && proposalMatch) {
    const row = database.prepare("SELECT * FROM proposals WHERE id = ?").get(proposalMatch[1]);
    if (!row) return jsonResponse(response, 404, { error: "Proposal not found." });
    return jsonResponse(response, 200, {
      id: row.id,
      document: JSON.parse(row.document),
      validation: JSON.parse(row.validation)
    });
  }

  if (request.method === "POST" && url.pathname === "/api/proposals") {
    return readBody(request).then(async (body) => {
      const intake = parseIntake(body);
      const inputErrors = validateIntake(intake);
      if (inputErrors.length) return jsonResponse(response, 400, { errors: inputErrors });
      const knowledge = loadKnowledge();
      const base = buildProposal(intake, {}, knowledge);
      const narrative = await generateNarrative(intake, base.context);
      const proposal = buildProposal(intake, narrative, knowledge);
      const validation = validateProposal(proposal, intake);
      const id = randomUUID();
      const createdAt = proposal.proposalMetadata.createdAt;
      database.prepare(`
        INSERT INTO proposals
          (id, client_name, project_title, status, total_cents, timeline_weeks, document, validation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        intake.clientName.trim(),
        intake.projectTitle.trim(),
        proposal.proposalMetadata.status,
        proposal.proposalMetadata.totalCents,
        proposal.proposalMetadata.timelineWeeks,
        JSON.stringify(proposal),
        JSON.stringify(validation),
        createdAt
      );
      return jsonResponse(response, 201, { id, document: proposal, validation });
    }).catch((error) => {
      if (!response.headersSent) {
        const status = /Request body|valid JSON/.test(error.message) ? 400 : 502;
        jsonResponse(response, status, { error: error.message });
      }
    });
  }

  const acceptMatch = url.pathname.match(/^\/api\/proposals\/([0-9a-f-]+)\/accept$/i);
  if (request.method === "POST" && acceptMatch) {
    const proposalId = acceptMatch[1];
    const proposalRow = database.prepare("SELECT * FROM proposals WHERE id = ?").get(proposalId);
    if (!proposalRow) return jsonResponse(response, 404, { error: "Proposal not found." });
    const existing = database.prepare("SELECT id FROM onboarding WHERE proposal_id = ?").get(proposalId);
    if (existing) return jsonResponse(response, 409, { error: "This proposal has already been accepted." });

    const proposal = JSON.parse(proposalRow.document);
    const validation = JSON.parse(proposalRow.validation);
    if (!validation.valid) {
      return jsonResponse(response, 409, { error: "This proposal cannot be accepted until its validation errors are resolved." });
    }
    const schedule = proposal.sections.milestones.map((milestone, index) => ({
      stage: milestone.phase,
      weeksFromStart: proposal.sections.milestones
        .slice(0, index)
        .reduce((weeks, item) => weeks + item.weeks, 0),
      durationWeeks: milestone.weeks,
      deliverables: milestone.deliverables
    }));
    const checklist = ["Confirm project kickoff date", "Share access credentials securely", "Provide brand and project assets"];
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO onboarding (id, proposal_id, client_name, project_title, schedule, checklist, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        proposalId,
        proposal.proposalMetadata.clientName,
        proposal.proposalMetadata.projectTitle,
        JSON.stringify(schedule),
        JSON.stringify(checklist),
        createdAt
      );
      database.prepare("UPDATE proposals SET status = 'accepted' WHERE id = ?").run(proposalId);
      proposal.proposalMetadata.status = "accepted";
      database.prepare("UPDATE proposals SET document = ? WHERE id = ?").run(JSON.stringify(proposal), proposalId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return jsonResponse(response, 201, {
      id,
      proposalId,
      clientName: proposal.proposalMetadata.clientName,
      projectTitle: proposal.proposalMetadata.projectTitle,
      schedule,
      checklist,
      createdAt
    });
  }

  return jsonResponse(response, 404, { error: "API route not found." });
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    try {
      const result = routeApi(request, response, url);
      if (result && typeof result.catch === "function") {
        result.catch((error) => jsonResponse(response, 500, { error: error.message }));
      }
    } catch (error) {
      jsonResponse(response, 500, { error: error.message });
    }
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requested}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      return response.end(error.code === "ENOENT" ? "Not found" : "Unable to read file");
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(content);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`T-03 Proposal Studio running at http://127.0.0.1:${PORT}`);
});
