# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PIE — Plataforma de Inteligência Eleitoral** for the Talita Oliveira 2026 campaign (Republicanos #1022, Bahia). A browser-based electoral management system tracking votes, political leadership (lideranças), events, and campaign goals across all 417 municipalities of Bahia.

## Running / Opening

There is no build system or package manager. All files are self-contained HTML pages — open them directly in a browser:

- `plataforma_eleitoral_v2.html` — main platform (active version)
- `mapa.html` — standalone real-time electoral map (embedded as iframe in the platform)
- `mapa_bahia_v7.html` — SVG map of Bahia's 417 municipalities

The `obs-studio/` directory is an unrelated OBS Studio installation and can be ignored.

## Architecture

### Single-file SPA pattern
Each HTML file contains all CSS, HTML, and JavaScript inline. No external JS/CSS files, no bundler, no framework. Pages inside the platform are toggled via `showPage(id, el)` — only one `<div class="page">` is visible at a time.

### Firebase backend (project: `pie--campanha`)
SDK version: **9.23.0 compat** (not the modular ESM SDK). Loaded from CDN:
```html
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
```

Two Firebase app instances are initialized in `plataforma_eleitoral_v2.html`:
- `_fbApp` / `_auth` / `_db` — primary instance used for all reads/writes
- `_fbApp2` / `_auth2` — secondary instance used exclusively to create new user accounts from the admin panel without signing out the current admin

### Firestore collections

| Collection | Purpose | Key fields |
|---|---|---|
| `usuarios` | User accounts and roles | `nome`, `email`, `role` (`admin`/`usuario`), `status` (`ativo`/`pendente`) |
| `municipios` | Vote data per municipality | `municipio`, `votos`, `obs`, `updated_at` |
| `liderancas` | CRM of political leaders | `nome`, `municipio`, `bairro`, `votos_comprometidos`, `telefone`, `updated_at` |
| `eventos` | Campaign agenda | `titulo`, `data`, `data_ts` (Timestamp), `local`, `tipo`, `updated_at` |

First registered user auto-becomes `admin`; subsequent registrations are assigned `usuario` and start with `pendente` status requiring admin activation.

### CSS design tokens
All colors use CSS variables with Portuguese names: `--azul`, `--azul2`, `--azul3`, `--verde`, `--vermelho`, `--amarelo`, `--roxo`, `--branco`, `--cinza`, `--cinza2`, `--borda`. Background layers: `--bg` (darkest) through `--bg4` (lightest).

### Platform sections (via `showPage()`)
- `dashboard` — overview KPIs and charts
- `mapa` — iframe to `mapa.html`
- `metas` — 2026 goals by region
- `votos` — form to register votes per municipality
- `projetos` / `projeto-detalhe` — project tracker
- `crm` — Lideranças CRM table with full CRUD
- `agenda` — event calendar with full CRUD
- `monitoramento` — media monitoring panel
- `trafego` — digital traffic and leads metrics
- `ia` — AI chat interface
- `config` — user profile + admin user management panel (admin-only section hidden for non-admins)

### Map data
`mapa_bahia_v7.html` renders an inline SVG with all 417 Bahia municipalities as paths. Vote data is stored in Firestore (`municipios` collection) and listened to via `onSnapshot`. The 2022 historical vote baseline (`VOTES` object) is hardcoded inline in `mapa.html`.
