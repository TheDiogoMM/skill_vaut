# PWA — Design

## Objetivo

Última peça do escopo original do SkillVault: tornar o app instalável (PWA) e permitir visualização offline do catálogo já carregado, usando `vite-plugin-pwa`.

## Contexto

- Frontend: React + Vite (`apps/web`), buildado para `apps/web/dist` e servido como estático pelo backend Fastify (`apps/server/src/app.ts`, via `@fastify/static`) — usado pelo lançador local (`launch.vbs`).
- Não há CDN nem dependência de rede externa em runtime — tudo deve ser bundlado via npm (mesma restrição já aplicada às fontes `@fontsource` no design system).
- App é single-user, dark mode padrão, layout desktop-first.

## Abordagem

`vite-plugin-pwa` (estratégia `generateSW`, baseada em Workbox) em vez de um service worker escrito à mão. É o padrão do ecossistema Vite, 100% bundlado via npm, e evita reimplementar versionamento de cache/precache manifest para um escopo tão pequeno (cache do app shell + de uma única rota de API).

Nenhuma mudança é necessária no backend: `@fastify/static` já serve qualquer arquivo presente em `apps/web/dist` (incluindo `sw.js`, `manifest.webmanifest` e os ícones gerados) pelo seu path real, com fallback de SPA só para rotas que não existem como arquivo.

## Manifest e ícones

- `name`: "SkillVault", `short_name`: "SkillVault".
- `display`: `standalone`, `start_url`: `/`.
- `background_color`: `#0f1115`, `theme_color`: `#0f1115` (mesma cor de `--color-bg` do tema dark padrão).
- Ícones gerados a partir de `apps/web/src/assets/logo-symbol.png` (614×653, não quadrado) sobre um quadrado de fundo `#0f1115` com respiro ao redor do logo — decisão validada visualmente durante o brainstorming (opção "fundo escuro com respiro", contra fundo branco e contra fundo escuro sem respiro).
- Tamanhos gerados: `192×192`, `512×512`, e uma versão adicional `512×512` marcada `purpose: "maskable"` (para o Android recortar em círculo/squircle sem cortar o logo).
- Geração via `@vite-pwa/assets-generator`, rodada uma vez a partir do logo existente; os PNGs resultantes são committados em `apps/web/public/`.
- `favicon-64.png` (já existente) não faz parte do manifest do PWA — continua sendo usado só como favicon da aba do navegador, sem mudanças.

## Service worker e cache

- `registerType: 'autoUpdate'` — ao detectar uma nova build, o service worker assume o controle e recarrega automaticamente na próxima navegação, sem perguntar nada ao usuário (decisão explícita: uso pessoal e local, não precisa de prompt de "nova versão disponível").
- `injectRegister: 'auto'` — o plugin injeta o `navigator.serviceWorker.register(...)` automaticamente no bundle de produção.
- **Precache do app shell**: `globPatterns` cobre `**/*.{js,css,html,woff,woff2,png,svg}` da pasta de build — JS, CSS, fontes (`@fontsource`) e ícones ficam disponíveis offline desde a primeira visita. O hash no nome de cada arquivo (já gerado pelo Vite) invalida o cache antigo automaticamente a cada nova build.
- **Cache de `GET /api/items`**: `runtimeCaching` com estratégia `NetworkFirst` (tenta a rede primeiro; se falhar — por exemplo, o servidor Fastify não está rodando — cai para a última resposta cacheada). Cobre exatamente o pedido original: "visualização do catálogo já carregado" quando offline.
- Nenhuma outra rota de API é cacheada: `GET /api/items/:id`, `POST/PATCH/DELETE /api/items`, `POST /api/recommend`, `GET /api/consultas`, categorias, uploads — todas continuam exigindo o servidor rodando. Decisão explícita: só a lista do catálogo fica disponível offline, não os detalhes de cada item.
- O service worker só é ativado na build de produção (`npm run build`), nunca em `npm run dev` — comportamento padrão do plugin, evita interferir no hot-reload durante desenvolvimento. Só entra em jogo na build usada pelo `launch.vbs`.
- Sem prompt de instalação customizado: a instalação do PWA é oferecida pelo prompt nativo do navegador (ícone de instalar na barra de endereço do Chrome/Edge quando o manifest é válido) — sem botão próprio na UI.

## Testes e verificação

Comportamento de service worker/cache é integração de navegador — não faz sentido como teste unitário via Vitest, mesmo tratamento já dado ao lançador local (`launch.vbs`/`stop.bat`).

- A config do `vite.config.ts` (manifest, ícones, `runtimeCaching`) é validada implicitamente pelo `npm run build`: se a config estiver inválida, o build falha ou o plugin acusa erro.
- Verificação manual (mesma disciplina da Tarefa 12 dos planos anteriores, execução real e não simulada):
  1. Build de produção (`npm run build -w apps/web`) e servir via Fastify.
  2. DevTools → Application: confirmar manifest válido (nome, ícones, cores), service worker ativo e registrado.
  3. Recarregar com o processo do Fastify desligado — o catálogo cacheado deve continuar aparecendo; abrir o detalhe de um item deve falhar (esperado, fora do escopo offline).
  4. Rodar uma nova build enquanto o app está aberto no navegador — confirmar que o app se atualiza sozinho, sem prompt.

Sem teste automatizado novo neste plano — consistente com o tratamento já dado ao lançador local.
