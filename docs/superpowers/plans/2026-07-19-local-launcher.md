# Local Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user open SkillVault via a double-click desktop shortcut (no terminal, no `npm run dev`) and close it via a second shortcut, without changing the existing development workflow.

**Architecture:** The Fastify server (`apps/server/src/app.ts`) gains an optional "app mode": when `apps/web/dist` (the Vite production build) exists, it serves those static files and falls back to `index.html` for unmatched non-API routes (SPA routing support). Four small Windows scripts at the repo root (`launch.vbs`, `launch.bat`, `run-server-hidden.vbs`, `stop.bat`, `rebuild.bat`) orchestrate building the frontend once, starting the server hidden in the background, opening the browser, and stopping it later. `npm run dev` is untouched — it never produces `apps/web/dist`, so the new code path never activates during development.

**Tech Stack:** Fastify 5, `@fastify/static`, Vitest (backend tests), Windows Batch + VBScript (launcher scripts, not unit-tested).

---

### Task 1: Add the `@fastify/static` dependency

**Files:**
- Modify: `apps/server/package.json`

- [ ] **Step 1: Install the package**

Run: `npm install @fastify/static -w apps/server`

Expected: npm reports the package added (e.g. `added 1 package`), and `apps/server/package.json` now lists `@fastify/static` under `"dependencies"`.

- [ ] **Step 2: Commit**

```bash
git add apps/server/package.json package-lock.json
git commit -m "chore: add @fastify/static dependency"
```

---

### Task 2: Serve the built frontend when `apps/web/dist` exists

**Files:**
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/src/app.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the top of `apps/server/src/app.test.ts` (imports) with:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from './db/connection.js';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
```

Then append this new `describe` block at the end of the file:

```typescript
describe('static frontend serving', () => {
  const dir = path.join(os.tmpdir(), `skillvault-webdist-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves a static asset from webDistPath when index.html exists', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>SkillVault</html>');
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("hi")');

    const app = buildApp({
      db: createDb(':memory:'),
      config: loadConfig({} as NodeJS.ProcessEnv),
      webDistPath: dir,
    });

    const response = await app.inject({ method: 'GET', url: '/app.js' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('console.log("hi")');
  });

  it('does not register static serving when webDistPath has no index.html', async () => {
    const app = buildApp({
      db: createDb(':memory:'),
      config: loadConfig({} as NodeJS.ProcessEnv),
      webDistPath: dir,
    });

    const response = await app.inject({ method: 'GET', url: '/app.js' });
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -w apps/server`
Expected: FAIL — `buildApp` does not accept a `webDistPath` option yet (TypeScript error) and no static file is served.

- [ ] **Step 3: Implement static serving**

Replace the full contents of `apps/server/src/app.ts` with:

```typescript
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import type { SkillVaultConfig } from './config.js';
import { categoriesRoutes } from './routes/categories.js';
import { itemsRoutes } from './routes/items.js';
import { indexRoute } from './routes/indexRoute.js';

const defaultWebDistPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web/dist',
);

export interface BuildAppOptions {
  db: Database.Database;
  config: SkillVaultConfig;
  webDistPath?: string;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('db', options.db);
  app.register(multipart, { attachFieldsToBody: true });

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(categoriesRoutes(options.config));
  app.register(itemsRoutes(options.config));
  app.register(indexRoute(options.config));

  const webDistPath = options.webDistPath ?? defaultWebDistPath;
  const indexHtmlPath = path.join(webDistPath, 'index.html');

  if (fs.existsSync(indexHtmlPath)) {
    app.register(fastifyStatic, { root: webDistPath });
  }

  return app;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -w apps/server`
Expected: PASS — all tests in `app.test.ts` green, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/app.test.ts
git commit -m "feat: serve built frontend static assets when apps/web/dist exists"
```

---

### Task 3: SPA fallback and 404 handling

**Files:**
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/src/app.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this new `describe` block at the end of `apps/server/src/app.test.ts`:

```typescript
describe('SPA fallback and 404 handling', () => {
  const dir = path.join(os.tmpdir(), `skillvault-webdist-spa-test-${Date.now()}`);

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html for an unmatched non-API route when webDistPath exists', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>SkillVault SPA</html>');

    const app = buildApp({
      db: createDb(':memory:'),
      config: loadConfig({} as NodeJS.ProcessEnv),
      webDistPath: dir,
    });

    const response = await app.inject({ method: 'GET', url: '/items/42' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('<html>SkillVault SPA</html>');
  });

  it('returns a JSON 404 for an unmatched /api/* route when webDistPath exists', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>SkillVault SPA</html>');

    const app = buildApp({
      db: createDb(':memory:'),
      config: loadConfig({} as NodeJS.ProcessEnv),
      webDistPath: dir,
    });

    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
  });

  it('keeps the default 404 behavior when webDistPath has no index.html (dev mode)', async () => {
    const app = buildApp({
      db: createDb(':memory:'),
      config: loadConfig({} as NodeJS.ProcessEnv),
      webDistPath: dir,
    });

    const response = await app.inject({ method: 'GET', url: '/items/42' });
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -w apps/server`
Expected: FAIL — the first two new tests fail because there is no SPA fallback yet (Fastify's default not-found response instead of `index.html` / `{ error: 'Not found' }`).

- [ ] **Step 3: Implement the SPA fallback**

In `apps/server/src/app.ts`, replace the `if (fs.existsSync(indexHtmlPath)) { ... }` block with:

```typescript
  if (fs.existsSync(indexHtmlPath)) {
    app.register(fastifyStatic, { root: webDistPath });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        reply.code(404).send({ error: 'Not found' });
        return;
      }
      reply.type('text/html').send(fs.readFileSync(indexHtmlPath));
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -w apps/server`
Expected: PASS — all tests in `app.test.ts` green (existing 404-independent tests, static asset test, and the three new SPA/404 tests).

- [ ] **Step 5: Run the full test suite for both workspaces**

Run: `npm run test`
Expected: PASS — backend and frontend suites both green, confirming nothing else broke.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/app.test.ts
git commit -m "feat: add SPA fallback for the built frontend, preserving API 404s"
```

---

### Task 4: Hidden server-start helper (`run-server-hidden.vbs`)

**Files:**
- Create: `run-server-hidden.vbs`

- [ ] **Step 1: Create the file**

```vbscript
Set objShell = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
serverDir = scriptDir & "apps\server"
objShell.Run "cmd /c cd /d """ & serverDir & """ && npx tsx src\server.ts", 0, False
```

This spawns `npx tsx src/server.ts` inside `apps/server` with a hidden console window (`0`), without waiting for it to exit (`False`) — the server keeps running in the background after this script itself finishes.

- [ ] **Step 2: Commit**

```bash
git add run-server-hidden.vbs
git commit -m "feat: add hidden server-start helper script"
```

---

### Task 5: Launch script (`launch.bat`)

**Files:**
- Create: `launch.bat`

- [ ] **Step 1: Create the file**

```bat
@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"
set "WEB_DIST=%ROOT%apps\web\dist"
set "URL=http://localhost:3001"
set "HEALTH_URL=%URL%/api/health"

if not exist "%WEB_DIST%\index.html" (
    echo Building frontend, this may take a minute...
    call npm run build -w apps/web
    if errorlevel 1 (
        echo Frontend build failed. Check the output above.
        exit /b 1
    )
)

call :CHECK_HEALTH
if "!HEALTH_CODE!"=="200" (
    echo SkillVault is already running.
    goto OPEN_BROWSER
)

echo Starting SkillVault server...
wscript.exe "%ROOT%run-server-hidden.vbs"

set /a ATTEMPTS=0
:WAIT_LOOP
set /a ATTEMPTS+=1
timeout /t 1 /nobreak >NUL
call :CHECK_HEALTH
if "!HEALTH_CODE!"=="200" goto OPEN_BROWSER
if !ATTEMPTS! GEQ 20 (
    echo SkillVault did not start within 20 seconds. Check for errors and try again.
    exit /b 1
)
goto WAIT_LOOP

:OPEN_BROWSER
start "" "%URL%"
goto :EOF

:CHECK_HEALTH
set "TMPFILE=%TEMP%\skillvault_health_%RANDOM%.txt"
curl -s -o NUL -w "%%{http_code}" "%HEALTH_URL%" > "%TMPFILE%" 2>NUL
set /p HEALTH_CODE=<"%TMPFILE%"
del "%TMPFILE%" >NUL 2>&1
goto :EOF
```

- [ ] **Step 2: Commit**

```bash
git add launch.bat
git commit -m "feat: add launch.bat to build, start, and open SkillVault"
```

---

### Task 6: Hidden entrypoint shortcut target (`launch.vbs`)

**Files:**
- Create: `launch.vbs`

- [ ] **Step 1: Create the file**

```vbscript
Set objShell = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
objShell.Run """" & scriptDir & "launch.bat""", 0, False
```

- [ ] **Step 2: Commit**

```bash
git add launch.vbs
git commit -m "feat: add launch.vbs as the hidden-window entrypoint for launch.bat"
```

---

### Task 7: Stop script (`stop.bat`)

**Files:**
- Create: `stop.bat`

- [ ] **Step 1: Create the file**

```bat
@echo off
setlocal enabledelayedexpansion

set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo Stopping SkillVault ^(PID %%P^)...
    taskkill /PID %%P /F >NUL 2>&1
    set "FOUND=1"
)

if "!FOUND!"=="0" (
    echo SkillVault is not running.
) else (
    echo SkillVault stopped.
)
endlocal
```

- [ ] **Step 2: Commit**

```bash
git add stop.bat
git commit -m "feat: add stop.bat to shut down the SkillVault server"
```

---

### Task 8: Rebuild script (`rebuild.bat`)

**Files:**
- Create: `rebuild.bat`

- [ ] **Step 1: Create the file**

```bat
@echo off
cd /d "%~dp0"
echo Rebuilding SkillVault frontend...
call npm run build -w apps/web
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)
echo Build complete. Refresh the browser tab to see the changes (no restart needed).
```

- [ ] **Step 2: Commit**

```bash
git add rebuild.bat
git commit -m "feat: add rebuild.bat to rebuild the frontend without restarting the server"
```

---

### Task 9: Manual end-to-end validation

**Files:** none (manual verification only — Batch/VBScript files are not covered by Vitest, per the design doc's testing section)

- [ ] **Step 1: Verify a clean start**

Run: `stop.bat` (in case anything is already running from earlier testing), then delete `apps/web/dist` if present (`rmdir /s /q apps\web\dist`), then double-click `launch.vbs`.
Expected: No terminal window appears; after the frontend build finishes, the default browser opens to `http://localhost:3001` showing the SkillVault catalog.

- [ ] **Step 2: Verify SPA routing works**

In the opened browser, navigate to an item detail page, then press F5 to hard-reload that URL directly.
Expected: The page reloads correctly (no 404) — confirms the SPA fallback serves `index.html` for `/items/:id`.

- [ ] **Step 3: Verify duplicate-launch protection**

Double-click `launch.vbs` again while the server from Step 1 is still running.
Expected: A new browser tab opens immediately (no rebuild, no wait) — confirms the health check detects the already-running server instead of starting a second one.

- [ ] **Step 4: Verify stop**

Double-click `stop.bat`.
Expected: A console window briefly shows "SkillVault stopped."; `http://localhost:3001/api/health` is no longer reachable afterward.

- [ ] **Step 5: Verify rebuild**

Edit any visible text in an `apps/web/src` component, run `rebuild.bat`, then (with the server still stopped from Step 4) run `launch.vbs` again and confirm the change appears in the browser. Run `stop.bat` afterward to leave the machine clean.

- [ ] **Step 6: Verify dev mode is unaffected**

Run: `npm run dev`
Expected: Backend (3001) and frontend dev server (5173) start as before, with hot-reload working — confirms the app-mode static/SPA code path never activates during normal development (`apps/web/dist` is untouched by `npm run dev`).

---

### Task 10: Update project continuity doc

**Files:**
- Modify: `PROJECT_CONTEXT.md`

- [ ] **Step 1: Document the new launcher in "Como rodar localmente"**

In `PROJECT_CONTEXT.md`, replace the `## Como rodar localmente` section with:

```markdown
## Como rodar localmente

**Desenvolvimento** (hot-reload, dois processos):

\`\`\`bash
cd C:\Users\Diogo\Projetos\SkillVault
npm install
npm run dev          # sobe backend (porta 3001) e frontend (porta 5173) juntos
npm run test          # roda os testes dos dois workspaces
\`\`\`

Frontend: http://localhost:5173
Backend: http://localhost:3001

**Uso diário** (sem terminal, um processo só servindo o frontend buildado):

- `launch.vbs` — builda o frontend na primeira vez (se necessário), sobe o servidor em segundo plano e abre `http://localhost:3001` no navegador. Detecta se o app já está rodando e evita duplicar o processo.
- `stop.bat` — encerra o servidor.
- `rebuild.bat` — reconstrói o frontend depois de alterar `apps/web/src` (sem precisar reiniciar o servidor).

Ver `docs/superpowers/specs/2026-07-19-local-launcher-design.md` para o design completo.
```

(Replace the literal `\`\`\`` markers above with real triple-backtick fences when editing the file — they're escaped here only so this plan step renders correctly.)

- [ ] **Step 2: Commit**

```bash
git add PROJECT_CONTEXT.md
git commit -m "docs: document the local launcher in PROJECT_CONTEXT.md"
```

---

## Spec Coverage Check

- §2 (modo "app" no servidor, estático + SPA fallback condicional) → Tasks 2, 3.
- §3 (launch.bat, launch.vbs, stop.bat, rebuild.bat) → Tasks 4–8.
- §4 (testes do `app.ts`; validação manual dos scripts) → Tasks 2, 3, 9.
- §5 (fora de escopo: sem `.exe`/`pkg`, sem tray, sem autostart, sem atalhos automáticos) → nothing in this plan builds any of those — confirmed out of scope.
