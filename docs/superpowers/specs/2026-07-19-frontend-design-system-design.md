# SkillVault — Implementação do Design System no Frontend

Aplica ao app real (`apps/web`) o design system gerado externamente e entregue em `SkillVault Design System/` (tokens, componentes de referência, assets de marca, telas de exemplo). Hoje o frontend é HTML semântico sem nenhum estilo (`theme.css` tem só 8 variáveis, elementos nativos sem classe). O resultado: identidade visual completa (cores, tipografia, ícones, logo), biblioteca de componentes reutilizável, e todas as telas existentes restilizadas — sem alterar rotas, contratos de API ou funcionalidades.

## 1. Fundamentos: tokens, fontes, ícones, assets

- **Tokens**: `tokens/colors.css`, `typography.css`, `spacing.css`, `effects.css` do pacote substituem `apps/web/src/theme.css` (que hoje só define `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-danger`, `--font-sans`, `--radius`, `--spacing-1..4`). O conjunto novo expande para: `--color-surface-hover`, `--color-surface-raised`, `--color-border-strong`, `--color-text-secondary`, `--color-text-on-accent`, `--color-accent-hover`, `--color-accent-active`, `--color-danger-hover`, cores de identidade por tipo de item (skill=violeta, repo=verde, mcp=âmbar), `--radius-sm/md/lg`, `--duration-fast/base`, `--ease-out`. O toggle `:root[data-theme='light']` continua funcionando como hoje, com os valores claros do pacote.
- **Fontes**: Inter (UI/corpo) e JetBrains Mono (paths, comandos, JSON, tags) via pacotes npm `@fontsource/inter` e `@fontsource/jetbrains-mono`, importados em `apps/web/src/main.tsx` — **não** via Google Fonts CDN (como o pacote original propõe), para manter o catálogo funcionando offline (meta do PWA já registrada em `PROJECT_CONTEXT.md`, ainda que o PWA em si não seja construído aqui).
- **Ícones**: `lucide-react` via npm, **não** o script CDN `unpkg.com/lucide` do pacote original — mesmo motivo de offline-first. O componente `Icon` (ver seção 2) importa os ícones diretamente do pacote em vez de injetar `<script>` e escanear atributos `data-lucide`.
- **Logo/favicon**: `logo-full.png`, `logo-symbol.png`, `favicon.png` (e variantes) copiados para `apps/web/src/assets/`, importados como módulos ES nos componentes que os usam (`Sidebar`, `<link rel="icon">` em `index.html`) — o Vite cuida de hash/cache; nenhum caminho absoluto fora de `apps/web`.
- **Limpeza**: depois de extrair tokens/assets/componentes para dentro de `apps/web`, a pasta `SkillVault Design System/` e o arquivo `SkillVault Design System.zip` na raiz do repositório são apagados (não ficam nem versionados nem como referência local — decisão explícita do usuário).

## 2. Componentes

Os 11 componentes do pacote viram arquivos próprios em `apps/web/src/components/ui/`, espelhando o agrupamento por categoria do pacote como subpastas:

```
apps/web/src/components/ui/
  core/Icon.tsx, Button.tsx, IconButton.tsx
  forms/Input.tsx, Select.tsx, Textarea.tsx, Tabs.tsx
  data-display/TypeBadge.tsx, Tag.tsx, ItemCard.tsx
  feedback/StatusMessage.tsx
  navigation/Sidebar.tsx
```

Cada componente é portado **quase literal** do `.jsx` de origem (decisão explícita do usuário: manter a lógica de estilo inline e os handlers de hover/press via `onMouseEnter`/`onMouseLeave`/`onMouseDown`/`onMouseUp` tal como o pacote define, em vez de reescrever como classes CSS), com dois ajustes obrigatórios para caber num projeto TypeScript com `tsc -b`:

1. **JSX real**, não chamadas cruas de `React.createElement` (o pacote foi feito para rodar via Babel standalone no navegador, sem build).
2. **Props tipadas** via `interface`, usando o `.d.ts` correspondente do pacote como contrato de partida (ajustado onde o tipo do pacote não bate com os tipos reais do app — ver `ItemCard` abaixo).

`Icon` é o único componente cuja lógica interna muda de fato (troca a injeção de `<script src="unpkg.com/lucide">` + re-scan de `data-lucide` por `import { X } from 'lucide-react'` direto), mantendo a mesma API de uso (nome do ícone como prop).

`ItemCard` é o único que precisa de adaptação de dados além da porta literal: o `.jsx` do pacote foi feito para o formato de `ui_kits/skillvault-web/mock-data.js`, então as props são ajustadas para receber o tipo `Item` real de `apps/web/src/types.ts` diretamente (sem camada de tradução extra).

Cada componente ganha um teste RTL básico (renderiza, cobre as variantes principais — ex: `Button` com `variant`/`size`/`disabled`), seguindo o padrão de teste já usado no projeto (`Layout.test.tsx`, `SearchFilterBar.test.tsx`): consulta por `role`/`aria-label`/texto visível, nunca por classe CSS ou estilo inline.

## 3. Telas

Cada tela existente é restilizada com os novos componentes/tokens, sem mudar roteamento (`App.tsx` continua com as mesmas 3 rotas) nem contratos de API:

- **`Layout.tsx`** → passa a renderizar o novo componente `Sidebar` (logo via `assets/logo-symbol.png` ou `logo-full.png`, nav com `NavLink`, toggle de tema), sidebar fixa 248px, colapsa para layout de coluna única abaixo de 720px (mesmo breakpoint de `theme.css` hoje).
- **`CatalogPage.tsx`** → cada item do catálogo vira um `ItemCard` (com `TypeBadge` para o tipo e `Tag` para as tags), `SearchFilterBar` restilizada trocando `<input>`/`<select>` nativos por `Input`/`Select`.
- **`ItemDetailPage.tsx`** → edição inline de categoria/tags usa `Select`/`Tag`, botão "copiar caminho" vira `IconButton` (ícone de cópia), feedback de salvar (`saveStatus`) usa `StatusMessage`.
- **`AddPage.tsx` + `pages/forms/{RepoForm,SkillForm,McpForm}.tsx`** → campos trocam `<input>`/`<select>`/`<textarea>` nativos por `Input`/`Select`/`Textarea`; as 3 abas do `SkillForm` (caminho local/upload/URL) usam o componente `Tabs`; botões de submit usam `Button`.
- **`CategoryManager.tsx`** → campos de renomear/mesclar usam `Input`/`Select`, ações usam `Button`, feedback usa `StatusMessage`.

## 4. Testes e escopo

- **Testes existentes**: os testes RTL atuais (`Layout.test.tsx`, `CatalogPage.test.tsx`, `ItemDetailPage.test.tsx`, `AddPage.test.tsx`, `SearchFilterBar.test.tsx`, `CategoryManager.test.tsx`, os três `*Form.test.tsx`) consultam majoritariamente por `role`/`aria-label`/texto visível. Preservando esses atributos acessíveis ao trocar elementos nativos pelos componentes novos, a maioria dos testes continua passando sem alteração; onde a extração de componente muda a estrutura de forma que quebra uma consulta existente (ex: um `<select>` nativo vira o componente `Select`, que pode envolver markup adicional), o teste é atualizado na mesma tarefa que faz a troca, seguindo TDD normal (ajusta o teste, roda, confirma vermelho/verde conforme o caso).
- **Novos testes**: um teste RTL básico por componente em `components/ui/` (11 no total).
- **Fora de escopo**: a tela de Recomendar (feature ainda não implementada no backend/frontend — fica para quando esse plano for feito), manifest/service worker do PWA (também não implementado ainda), qualquer mudança de contrato de API ou schema do backend, criação de atalhos de área de trabalho para os assets de logo, e qualquer alteração ao pacote `SkillVault Design System/` além de extrair dele o que este plano usa (o pacote é apagado ao final, conforme decisão do usuário).
