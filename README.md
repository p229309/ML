# T-03 Proposal Studio

A local-first, open-source MVP for turning a structured discovery brief into a reviewable proposal, checking its arithmetic and standard terms, printing it to PDF, and turning an accepted proposal into a T-04-style onboarding schedule.

## Stack

- Node.js built-in HTTP server and SQLite (`node:sqlite`); no application dependencies or hosted services.
- Plain HTML, CSS, and JavaScript frontend.
- Optional local Ollama model for proposal narrative generation. Without Ollama, a deterministic rules-based generator remains available.
- Lightweight keyword-ranked retrieval over the local SQLite knowledge library; no external vector database or embedding service.

## Run locally

Requires Node.js 22 or newer.

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Proposal and onboarding data is stored in `t03.sqlite` in the project directory and is not sent to a hosted service by the app.

To use Ollama, install and start Ollama, pull a model that supports JSON output, then set `OLLAMA_MODEL` before starting the server. For example, in PowerShell:

```powershell
$env:OLLAMA_MODEL = "qwen2.5:3b"
npm start
```

Ollama must be reachable at `http://127.0.0.1:11434`. If configured but unavailable, generation reports an error rather than silently substituting the demo generator.

## MVP behavior and assumptions

- The local knowledge library contains illustrative delivery patterns, skill profiles, a planning rate card, and draft terms. These are prominently marked as examples, not actual case studies, employee biographies, or legal policy. Replace them with approved company material before client use.
- The default estimate uses a $125/hour planning rate and 24 hours per listed deliverable, with a 40-hour minimum. It is explicitly a non-binding planning estimate.
- Budget and schedule caps are surfaced as warnings; the system does not silently rewrite scope or force a proposal under those caps.
- “Export PDF” opens the browser print dialog. Choose “Save as PDF” to export.
- Accepting a proposal creates a local onboarding record with a milestone schedule and starter asset checklist. This MVP does not send email, collect signatures, expose a public client portal, or receive external webhooks.

Run checks with `npm test`.
