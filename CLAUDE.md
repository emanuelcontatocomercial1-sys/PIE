# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Style

**Execute all commands without asking for confirmation.** The user has explicitly authorized autonomous operation in this repo — proceed directly with edits, commits, pushes, file deletions, and any other actions without pausing for approval. Only stop to ask when there is genuine ambiguity about *what* the user wants, never about *whether* to proceed.

## Project Overview

**PIE — Plataforma de Inteligência Eleitoral** for the Talita Oliveira 2026 campaign (Republicanos #1022, Bahia). A browser-based electoral management system tracking votes, political leadership (lideranças), competitor monitoring, events, leads/munícipes (MLM-style affiliate network), and campaign goals across all 417 municipalities of Bahia. Election date: **October 4, 2026**.

Deployed at `cidadaoativodabahia.com.br` via GitHub Pages (custom domain).

## Running / Opening

No build system or package manager. All files are self-contained HTML — open directly in a browser:

- `plataforma_eleitoral_v2.html` — main platform (active version, ~4,000+ lines)
- `mapa.html` — standalone real-time electoral map (embedded as iframe in the platform, ~750 lines)
- `mapa_bahia_v7.html` — static SVG map of Bahia's 417 municipalities
- `index.html` — meta-redirect to `plataforma_eleitoral_v2.html`
- `plataforma_eleitoral.html` — older version, kept for reference

The `obs-studio/` directory is an unrelated OBS Studio installation and can be ignored.

## Architecture

### Single-file SPA pattern
Each HTML file contains all CSS, HTML, and JavaScript inline. No external JS/CSS files, no bundler, no framework. Pages inside the platform are toggled via `showPage(id, el)` — only one `<div class="page">` is visible at a time; the page div IDs are prefixed with `page-` (e.g., `page-dashboard`).

### Hash routes
The platform has one hash-based route: `#/cadastro/<link_code>` triggers the public affiliate cadastro flow (`abrirCadastroPublico`) — hides the login/app and shows a public form for someone to register as a lead under the leader who owns that `link_code`. Called via `verificarRotaCadastro()` at script init.

### Firebase backend (project: `pie--campanha`)
SDK version: **9.23.0 compat** (not the modular ESM SDK). Loaded from CDN. Plus **SheetJS** (`xlsx-0.20.1`) for Excel parsing in the lead import flow.

Two Firebase app instances are initialized in `plataforma_eleitoral_v2.html`:
- `_fbApp` (name `'plataforma'`) / `_auth` / `_db` — primary instance used for all reads/writes
- `_fbApp2` (name `'secondary'`) / `_auth2` — used exclusively to create new user accounts from the admin panel without signing out the current admin

`mapa.html` accesses the parent frame's instances directly via `window.parent._db` / `window.parent._auth` (same-origin iframe). Falls back to its own initialized Firebase app named `'plataforma-mapa'` if standalone.

**Required Firebase settings** (configured in console, not in code):
- **Authentication → Sign-in method**: E-mail/senha + Anonymous (anonymous is needed for the public cadastro flow)
- **Firestore Rules**: see "Firestore security rules" section below

### Firestore collections

| Collection | Purpose | Key fields |
|---|---|---|
| `usuarios` | User accounts and roles | `nome`, `email`, `role` (`admin`/`usuario`), `status` (`ativo`/`pendente`) |
| `municipios` | Vote data per municipality | `nome`, `votos_atual`, `obs`, `updated_at` |
| `liderancas` | Lideranças (leaders) + leads/munícipes (affiliate network) | `nome`, `municipio`, `bairro`, `votos_comprometidos`, `telefone`, `parent_id`, `link_code`, `tipo` (`lideranca`/`lead`), `created_via` (`manual`/`afiliado`/`planilha`), `updated_at` |
| `eventos` | Campaign agenda | `titulo`, `data_str`, `data_ts` (Timestamp), `local`, `tipo`, `obs`, `updated_at` |
| `concorrentes` | Competitor monitoring | `nome`, `partido`, `relacao` (`Republicanos`/`adversario`/`aliado`/`observar`), `foto_url`, `ig`, `fb`, `yt`, `tt` |
| `config` | Platform-wide settings (e.g., login cover photo) | doc `login` has `cover_url` (base64 dataURL, compressed JPEG ~50-200KB), `updated_at`, `updated_by` |

First registered user auto-becomes `admin`; subsequent registrations are assigned `usuario` with `pendente` status requiring admin activation. Anonymous users (from the public cadastro flow) are **never** added to `usuarios` — guarded in the auth handler.

### Lideranças vs Leads (MLM-style)
The `liderancas` collection holds two entity types distinguished by the `tipo` field:
- **Liderança** (`tipo: 'lideranca'`): political leader / articulator registered via the CRM panel. `parent_id` is always null. Has a unique `link_code` for the affiliate URL.
- **Lead / munícipe** (`tipo: 'lead'`): regular supporter registered via affiliate link, manual lead form, or spreadsheet import. May have `parent_id` (vinculado) or null (solto). Also gets a `link_code` so they can recruit others.

`tipoDe(l)` resolves the type robustly:
1. Explicit `tipo` field wins
2. Fallback: `parent_id` present → `'lead'`; absent → `'lideranca'`

This handles legacy docs without the `tipo` field (created before the MLM feature).

### Performance caches (rebuilt every snapshot)
With 30k+ leads possible (mass import), per-render `Array.filter` / `Array.find` becomes O(N²). The listener's callback calls `reconstruirCaches()` to build:
- `_lidPorId` — `Map<id, doc>` for O(1) lookups
- `_filhosPorParent` — `Map<parent_id, [filhos]>` powering `filhosDe()` / `descendentesDe()` in O(1) per call
- `_lideres`, `_leads` — already-typed arrays

All render functions consume these caches instead of re-filtering `_liderancasData`.

### Listeners attach after auth (not at script load)
The four `onSnapshot` subscriptions (`municipios`, `liderancas`, `concorrentes`, `eventos`) live inside `iniciarListener_<col>()` functions called from `iniciarListenersFirestore()` — invoked inside the `onAuthStateChanged` handler **after** `_currentUser` is set. This avoids the stream dying with `permission-denied` if rules require auth and the script load happened before authentication completed. Guard `_listenersIniciados` prevents double-attach.

### CSS design tokens
Light theme. CSS variables with Portuguese names:
- Backgrounds: `--bg` / `--bg2..bg5` (light)
- Accents: `--ciano`/`--ciano2`/`--ciano3` (violet — `#6d28d9`/`#7c3aed`/`#8b5cf6`), `--verde`/`--vermelho`/`--amarelo`/`--azul`/`--roxo`
- Text: `--branco` (`#0f172a`), `--cinza`, `--cinza2`
- Borders: `--borda`, `--borda2`
- Fonts: `--fonte` (Sora), `--mono` (JetBrains Mono), `--display` (Bebas Neue — for the login cover overlay), `--serif` (Playfair Display — for the editorial sidebar title)

Sidebar overrides these tokens locally to use its dark-violet (`#1a0f3d`) palette and editorial typography (Playfair italic title, no icons, underline lilás on active item).

### Login screen
Split view (desktop, ≥900px wide):
- **Left**: admin-customizable cover photo (`config/login.cover_url` from Firestore) at 36% width with a dark gradient overlay containing the candidate name in Bebas Neue + tag "1022 · BAHIA 2026"
- **Right**: white login card with multi-view (login / criar conta / esqueci senha)

If no cover is set, falls back to a dark `#111` background with "TO" placeholder. URL is cached in `localStorage.pie_login_cover_url` for instant load.

Admin uploads via Configurações → "🖼️ Foto de capa do login" card: file picker (PNG/JPG/WEBP) → client-side canvas compression (max 900px, JPEG 0.82) → base64 dataURL → Firestore.

### Sidebar (editorial minimalista on dark violet)
Width 220px. Background `#1a0f3d`. Title "Plataforma / Eleitoral" in Playfair Display italic 22px. Subtitle "Talita Oliveira · Bahia 2026" in light violet `#c4b5fd`. Nav items text-only (icon SVGs preserved in HTML but hidden via CSS), active state = white text + 32px lilás underline + bold weight, no background fill. Section labels (Principal/Campanha/Digital/Sistema) hidden; whitespace separates groups. User card at bottom: name in Playfair italic, no avatar circle.

### Platform sections (via `showPage()`)
- `dashboard` — overview KPIs and charts
- `mapa` — iframe to `mapa.html` (with `?v=N` cache-bust)
- `metas` — 2026 goals by region
- `votos` — form to register votes per municipality
- `projetos` / `projeto-detalhe` — project tracker (data hardcoded in `PROJETOS_DATA`)
- `crm` — Lideranças CRM table (filtered to `tipo === 'lideranca'`)
- `rede` — **Rede de Indicações**: grid of root liderança cards with global stats (raízes, leads cadastrados, profundidade max, votos). Click opens `lideranca-detalhe`.
- `lideranca-detalhe` — affiliate link + share buttons (copy / WhatsApp), tree visualization (pyramid of bubbles connected by CSS pseudo-element lines), descendant list with indented levels and `liderança`/`lead` badges
- `leads` — **Leads / Munícipes**: paginated table (50/page) of `tipo === 'lead'` docs, filters (search, município, vinculado/solto), "+ Novo lead" modal, "📥 Importar planilha" modal
- `agenda` — event calendar with full CRUD
- `monitoramento` — competitor monitoring panel
- `concorrente-detalhe` — individual competitor profile view
- `trafego` — digital traffic and leads metrics
- `ia` — AI chat interface
- `config` — user profile + admin user management panel + admin-only cover photo upload card

`showPage()` calls render functions on demand: `renderLeads()` for `leads`, `renderPaginaRede()` for `rede`, `carregarUsuarios()` for `config`.

### Affiliate / MLM flow
1. Admin (or another leader via their own link) cadastra uma liderança → `gerarLinkCode()` generates 6-char slug → stored as `link_code`
2. Share URL is `<origin>/<path>#/cadastro/<link_code>` (built by `urlLinkAfiliado(code)`)
3. Recipient opens the URL → `verificarRotaCadastro()` matches the hash → `abrirCadastroPublico(code)`:
   - Hides login/app, shows `#cadastro-screen`
   - Signs in **anonymously** (so Firestore rules allow the read/write)
   - Queries `liderancas where link_code == code` to find the parent
   - Form fields: nome, telefone, município (datalist), bairro
4. On submit, writes a new doc with `parent_id = parentLider.id`, `tipo: 'lead'`, `created_via: 'afiliado'`, own `link_code` (so this lead can also recruit)
5. Anonymous users are excluded from app initialization (guard in `onAuthStateChanged` checks `user.isAnonymous`)

### Lead import (CSV / Excel)
Modal in the Leads page accepts `.csv`, `.xlsx`, `.xls`. Excel via SheetJS, CSV via in-house parser (handles quoted strings + `,`/`;` delimiters). Flow:
1. Parse → first row as headers, rest as data
2. Auto-detect columns by normalized header match (`nome`, `telefone`, `municipio`, `bairro`)
3. Preview first 6 rows + column mapping selects (user can override)
4. Optional "Vincular todos a:" dropdown → bulk-assign a parent liderança
5. Firestore batch writes (400 per batch — under the 500/batch limit). Progress bar updates per batch.
6. Each imported doc gets `tipo: 'lead'`, `created_via: 'planilha'`, fresh `link_code`, timestamps

### Map data (`mapa.html`)
- Uses **D3.js** (from CDN) to render and color SVG paths
- `VOTES` object — 2022 baseline vote counts per municipality (hardcoded)
- `VOTES_ATUAL` object — live vote counts, updated via `onSnapshot` from `municipios`
- `META_TOTAL` = 120,000 votes; `META_PER_REGION` distributes this across the 9 regions
- `TOTAL` = 33,455 (total 2022 baseline votes)
- Map layers toggled via `setLayer(layer)`: `votos2022`, `meta2026`, `crescimento`, `votosatual`, `falta`
- **Auth strategy**: reuses the parent app's `_db`/`_auth` via `window.parent` (same-origin). The Firestore listener (`iniciarListenerMapa`) only attaches after `auth.onAuthStateChanged` confirms a user. Fallback `signInAnonymously()` covers the standalone-iframe case.

`mapa_bahia_v7.html` is a static SVG-only file with all 417 municipality paths inline — no Firebase, no JS logic beyond basic map interactions.

### Known issue: map sync after vote register
After registering a vote in `votos`, the painel updates correctly (badge "Conectado", contador, histórico), but the embedded `mapa.html` iframe doesn't always reflect the new vote in real time. Several iterations were attempted (auth-after-attach, named-app sharing, parent frame reuse, anonymous fallback, cache-bust) — root cause is unconfirmed since the user paused debugging without sharing console output. The map currently shows historical (2022) data correctly.

### Key JS patterns

**Inline edit pattern (votos):** Edit state is stored directly on the button element as `btn._editDocId`. When set, the save function updates instead of creating.

**Modal pattern:** Modals are toggled via `classList.add/remove('show')`. The `fecharModal(id)` function takes the modal element's ID directly.

**Autocomplete (monitoramento):** The competitor name input uses `CANDIDATOS_BA2022`, a hardcoded dataset of Bahia 2022 TSE candidates, for local autocomplete — no live API call.

**Region lookup:** `_REGIOES_DADOS` maps the 9 campaign regions (NORTE, SUL, etc.) to their municipalities. Used by the CRM to derive region from municipality.

**Tree visualization (Rede / lideranca-detalhe):** Pure HTML/CSS recursion. Each `tree-node` is a flex column; `tree-children` is a flex row; connecting lines drawn via `::before`/`::after` pseudo-elements with absolute positioning. Bubble color via class: `.root` (dark), `.lider` (violet), default (green = lead).

## Firestore security rules

The deployed rules (Firestore Database → Rules in the Firebase Console) enforce:

```
match /usuarios/{uid} {
  allow read:  if request.auth != null && request.auth.token.firebase.sign_in_provider != 'anonymous';
  allow write: if request.auth != null
               && request.auth.token.firebase.sign_in_provider != 'anonymous'
               && (request.auth.uid == uid || isAdmin());
}

match /liderancas/{doc} {
  allow read, create: if request.auth != null;       // anônimos podem cadastrar via link
  allow update, delete: if request.auth != null
                        && request.auth.token.firebase.sign_in_provider != 'anonymous';
}

match /municipios|eventos|concorrentes/{doc} {
  allow read, write: if request.auth != null
                     && request.auth.token.firebase.sign_in_provider != 'anonymous';
}

match /config/{doc} {
  allow read:  if request.auth != null;              // qualquer logado lê (capa)
  allow write: if request.auth != null && isAdmin();
}

function isAdmin() {
  return request.auth != null
         && get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.role == 'admin';
}
```

## Deployment

GitHub Pages with custom domain `cidadaoativodabahia.com.br`. `git push origin main` triggers a deploy; propagation typically 1-2 minutes. Cache-bust via `?v=N` query string on iframe sources when changes to `mapa.html` need to land immediately.

## .gitignore highlights
- Personal docs / installers / OBS Studio install / `.claude/` workspace
- `*.csv`, `*.xlsx`, `*.xls` (lead spreadsheets contain PII — never commit)
- `_tmp_*` (temporary files from xlsx→csv conversion)
