# SkillVault — Launcher Local (Executável)

Forma de abrir o SkillVault sem terminal: um atalho de duplo-clique que sobe o app e abre o navegador, e outro para parar. Uso pessoal, na máquina de desenvolvimento atual (Node/git já instalados) — não é um `.exe` compilado nem um pacote distribuível para outras máquinas.

## 1. Contexto e motivação

Hoje o único jeito de usar o SkillVault é `npm run dev` num terminal, subindo dois processos (Fastify na porta 3001 + Vite dev server na porta 5173 com hot-reload). Isso é adequado para desenvolver o app, mas não para **usar** o catálogo no dia a dia. O objetivo aqui é um modo "aplicativo pronto": um processo único, servindo o frontend já buildado, iniciado e encerrado por atalhos — sem alterar o fluxo de desenvolvimento existente (`npm run dev` continua igual).

## 2. Modo "app" no servidor Fastify

`apps/server/src/app.ts` passa a registrar `@fastify/static`, servindo os arquivos de `apps/web/dist` (build de produção do Vite) na mesma porta da API (3001), **somente quando esse diretório existir**. Quando não existe (caso do `npm run dev`, que nunca builda `dist`), o comportamento atual do servidor não muda em nada.

**Fallback SPA**: como o frontend usa `react-router-dom` (rotas como `/items/:id`), um `setNotFoundHandler` devolve `apps/web/dist/index.html` para qualquer rota que não seja `/api/*` e não corresponda a um arquivo estático real — evita 404 ao recarregar a página numa rota interna. Esse handler só é registrado junto do modo estático, condicionado à existência de `dist`.

## 3. Scripts de start/stop/rebuild

Cinco arquivos na raiz do repositório, fora de `apps/server` e `apps/web` porque orquestram os dois workspaces:

- **`launch.bat`**: se `apps/web/dist` não existir, roda `npm run build -w apps/web`. Em seguida, faz um `GET http://localhost:3001/api/health`:
  - Se responder OK → o app já está rodando; só abre/foca `http://localhost:3001` no navegador padrão, sem subir processo novo.
  - Se não responder → sobe o servidor via `run-server-hidden.vbs` e então abre o navegador na mesma URL.
- **`launch.vbs`**: invólucro do `launch.bat` que executa sem exibir janela de terminal (usado pelo atalho de duplo-clique).
- **`run-server-hidden.vbs`**: chamado por `launch.bat`; sobe `tsx src/server.ts` dentro de `apps/server` com janela de console oculta e desacoplada do processo pai.
- **`stop.bat`**: localiza o processo Node ouvindo na porta 3001 (`netstat` + `taskkill`) e o encerra. Necessário porque `launch.vbs` não deixa uma janela visível para fechar.
- **`rebuild.bat`**: roda `npm run build -w apps/web` diretamente, para reconstruir o frontend depois de editar código — sem precisar apagar `dist` manualmente antes de rodar `launch.bat` de novo.

Atalhos na área de trabalho apontando para `launch.vbs` (iniciar) e `stop.bat` (parar) são criados manualmente pelo usuário — não são gerados por script.

## 4. Testes

- **`app.ts`** (Vitest, backend): cobre os três estados — `dist` ausente (comportamento atual preservado), `dist` presente servindo um asset estático real, e fallback de SPA devolvendo `index.html` numa rota não-API desconhecida.
- **Scripts `.bat`/`.vbs`**: não são cobertos por Vitest (não é código TypeScript). Validação é manual: rodar `launch.vbs` de ponta a ponta, confirmar que abre o navegador, rodar de novo para confirmar que não duplica processo, e rodar `stop.bat` para confirmar que encerra.

## 5. Fora de escopo

- `.exe` compilado (via `pkg`/`nexe`) — descartado por causa do módulo nativo `better-sqlite3`, que torna esse empacotamento frágil.
- Ícone na bandeja do sistema (tray) e início automático no login do Windows — o usuário optou por início manual via atalho.
- Distribuição para outras máquinas Windows sem Node/git instalados — uso restrito à máquina de desenvolvimento atual.
- Criação automática dos atalhos na área de trabalho.
