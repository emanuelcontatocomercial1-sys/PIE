# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Style

**Execute all commands without asking for confirmation.** The user has explicitly authorized autonomous operation in this repo — proceed directly with edits, commits, pushes, file deletions, and any other actions without pausing for approval. Only stop to ask when there is genuine ambiguity about *what* the user wants, never about *whether* to proceed.

## Project Overview

**PIE — Plataforma de Inteligência Eleitoral** for the Talita Oliveira 2026 campaign (Republicanos #1022, Bahia). A browser-based electoral management system tracking votes, political leadership (lideranças), competitor monitoring, events, and campaign goals across all 417 municipalities of Bahia. Election date: **October 4, 2026**.

## Running / Opening

No build system or package manager. All files are self-contained HTML — open directly in a browser:

- `plataforma_eleitoral_v2.html` — main platform (active version, ~3,400 lines)
- `mapa.html` — standalone real-time electoral map (embedded as iframe in the platform, ~850 lines)
- `mapa_bahia_v7.html` — static SVG map of Bahia's 417 municipalities
- `index.html` — meta-redirect to `plataforma_eleitoral_v2.html`
- `plataforma_eleitoral.html` — older version, kept for reference

The `obs-studio/` directory is an unrelated OBS Studio installation and can be ignored.

## Architecture

### Single-file SPA pattern
Each HTML file contains all CSS, HTML, and JavaScript inline. No external JS/CSS files, no bundler, no framework. Pages inside the platform are toggled via `showPage(id, el)` — only one `<div class="page">` is visible at a time; the page div IDs are prefixed with `page-` (e.g., `page-dashboard`).

### Firebase backend (project: `pie--campanha`)
SDK version: **9.23.0 compat** (not the modular ESM SDK). Loaded from CDN.

Two Firebase app instances are initialized in `plataforma_eleitoral_v2.html`:
- `_fbApp` / `_auth` / `_db` — primary instance used for all reads/writes
- `_fbApp2` / `_auth2` — secondary instance used exclusively to create new user accounts from the admin panel without signing out the current admin

`mapa.html` uses its own separate Firebase instance (`db`, not `_db`).

### Firestore collections

| Collection | Purpose | Key fields |
|---|---|---|
| `usuarios` | User accounts and roles | `nome`, `email`, `role` (`admin`/`usuario`), `status` (`ativo`/`pendente`) |
| `municipios` | Vote data per municipality | `nome`, `votos_atual`, `obs`, `updated_at` |
| `liderancas` | CRM of political leaders | `nome`, `municipio`, `bairro`, `votos_comprometidos`, `telefone`, `updated_at` |
| `eventos` | Campaign agenda | `titulo`, `data_str`, `data_ts` (Timestamp), `local`, `tipo`, `obs`, `updated_at` |
| `concorrentes` | Competitor monitoring | `nome`, `partido`, `relacao` (`Republicanos`/`adversario`/`aliado`/`observar`), `foto_url`, `ig`, `fb`, `yt`, `tt` |

First registered user auto-becomes `admin`; subsequent registrations are assigned `usuario` with `pendente` status requiring admin activation.

### CSS design tokens
All colors use CSS variables with Portuguese names: `--azul`, `--azul2`, `--azul3`, `--verde`, `--vermelho`, `--amarelo`, `--roxo`, `--branco`, `--cinza`, `--cinza2`, `--borda`. Background layers: `--bg` (darkest) through `--bg4` (lightest). Font families: `--fonte` (Sora) and `--mono` (JetBrains Mono).

### Platform sections (via `showPage()`)
- `dashboard` — overview KPIs and charts
- `mapa` — iframe to `mapa.html`
- `metas` — 2026 goals by region
- `votos` — form to register votes per municipality
- `projetos` / `projeto-detalhe` — project tracker (data hardcoded in `PROJETOS_DATA`)
- `crm` — Lideranças CRM table with full CRUD
- `agenda` — event calendar with full CRUD
- `monitoramento` — competitor monitoring panel
- `concorrente-detalhe` — individual competitor profile view
- `trafego` — digital traffic and leads metrics
- `ia` — AI chat interface
- `config` — user profile + admin user management panel (admin-only section hidden for non-admins)

### Key JS patterns

**Inline edit pattern (votos):** Edit state is stored directly on the button element as `btn._editDocId`. When set, the save function updates instead of creating.

**Real-time listeners:** Most collections use `onSnapshot` at the top level (not inside functions), so they start listening immediately after login. This means global variables like `_liderancasData`, `_eventosData`, `_concorrentesData` are populated reactively.

**Modal pattern:** Modals are toggled via `classList.add/remove('show')`. The `fecharModal(id)` function takes the modal element's ID directly.

**Autocomplete (monitoramento):** The competitor name input uses `CANDIDATOS_BA2022`, a hardcoded dataset of Bahia 2022 TSE candidates (~line 3032), for local autocomplete — no live API call.

**Region lookup:** `_REGIOES_DADOS` (~line 2218) maps the 9 campaign regions (NORTE, SUL, etc.) to their municipalities. Used by the CRM to derive region from municipality.

### Map data (`mapa.html`)
- Uses **D3.js** (from CDN) to render and color SVG paths
- `VOTES` object — 2022 baseline vote counts per municipality (hardcoded)
- `VOTES_ATUAL` object — live vote counts, updated via `onSnapshot` from `municipios`
- `META_TOTAL` = 120,000 votes; `META_PER_REGION` distributes this across the 9 regions
- `TOTAL` = 33,455 (total 2022 baseline votes)
- Map layers toggled via `setLayer(layer)`: `votos2022`, `meta2026`, `crescimento`, `votosatual`, `falta`

`mapa_bahia_v7.html` is a static SVG-only file with all 417 municipality paths inline — no Firebase, no JS logic beyond basic map interactions.
