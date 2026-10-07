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

## Deploy from GitHub with Render

The included `render.yaml` is a Render Blueprint for deploying the complete Node.js application (not GitHub Pages). To use it:

1. Push this project, including `render.yaml`, to a GitHub repository.
2. In Render, choose **New → Blueprint**, connect that GitHub repository, and select the branch containing `render.yaml`.
3. Review the `t03-proposal-studio` web service and deploy it. Render assigns a public `onrender.com` URL; proposal generation, PDF printing, and onboarding use the same deployed Node.js app.
4. Open the deployed URL and submit a test proposal. Render's health check uses `/api/health`.

The Blueprint pins Node.js 24, starts the server on Render's assigned port, and binds it to the network interface required by the host. For local runs, the server remains bound to `127.0.0.1`.

**Free-tier storage limitation:** proposals are saved in SQLite at `t03.sqlite` by default. Render's free web service has an ephemeral filesystem, so its database may be lost when the service restarts, sleeps, or is redeployed. This is acceptable for a temporary demo, but do not store real client data until durable storage is configured. The database path can be moved later by setting `T03_DB_PATH` to a file on a persistent disk, or by migrating the app to a managed database.
