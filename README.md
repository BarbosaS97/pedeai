# PedeAí

Cardápio digital com QR Code + garçom IA para restaurantes. "Pede aí. A IA sugere."

## Stack

- Frontend: **HTML + CSS + JavaScript puro**, sem build — todas as dependências
  (Tailwind CSS, Supabase JS, `qrcode`) são carregadas via CDN direto no `<head>`
  de cada página.
- Backend: Supabase (Postgres + pgvector + Storage + Edge Functions/Deno)
- IA: DeepSeek (API compatível com OpenAI), chamada só dentro das Edge Functions
- QR Code: gerado no cliente com a lib `qrcode` (CDN), sem serviço externo

Não há Node.js, npm, Vite, TypeScript ou React neste projeto. Nenhum comando de
build é necessário — os arquivos `.html` rodam do jeito que estão.

## Como rodar

1. Abra a pasta do projeto no VS Code.
2. Instale a extensão **Live Server** (se ainda não tiver).
3. Clique com o botão direito em [index.html](index.html) → **Open with Live Server**.
4. Navegue pelas páginas a partir dali, ou abra direto o `index.html` da pasta
   que você quer testar (`admin/`, `restaurante/` ou `cliente/`).

Não precisa de `npm install`, `npm run dev` nem `npm run build` — é só abrir o
arquivo.

## Páginas

Cada área do produto é uma pasta com seu próprio `index.html`, para abrir
qualquer uma direto no Live Server sem depender das outras. Como o site é
estático (sem servidor de rotas), parâmetros na URL fazem o papel das rotas
dinâmicas do app original:

| Pasta / URL | Equivale a | Descrição |
| --- | --- | --- |
| [index.html](index.html) | — | Landing page, com link para o admin |
| [admin/index.html](admin/index.html) | `/admin` | **Você**: cadastra restaurantes e gera QR Codes/links de painel |
| `restaurante/index.html?token=<access_token>` | `/r/:accessToken` | **Restaurante**: painel de pedidos + produtos |
| `cliente/index.html?slug=<slug>` | `/:slug` | **Cliente**: cardápio público |
| `cliente/index.html?slug=<slug>&mesa=<numero>` | `/:slug/mesa/:numero` | Cardápio público com número da mesa |

`restaurante/` e `cliente/` sempre precisam do parâmetro na URL (`token` e
`slug`, respectivamente) — os links certos, já prontos, aparecem na tela do
admin depois que você cadastra um restaurante (o QR Code e o link "Painel:
..." ficam clicáveis ali). Abrir `restaurante/index.html` ou
`cliente/index.html` sem parâmetro mostra a tela de "link inválido"/"não
encontrado" — isso é esperado.

## Estrutura

```
config.js                     configuração pública (URL/anon key do Supabase, senha do admin, APP_URL)
index.html                    landing page
admin/
  index.html                   sua área: cadastra restaurantes, gera QR Codes e links de painel
  admin.js
restaurante/
  index.html                   painel do restaurante (?token=...)
  painel.js
cliente/
  index.html                   cardápio público (?slug=...&mesa=...)
  cardapio.js
css/style.css                 estilos base (além dos utilitários do Tailwind via CDN)
js/                            módulos compartilhados pelas três áreas acima
  util.js                       helpers (escapeHtml, formatBRL, errorMessage, loadingHtml, notFoundHtml)
  logo.js                       marca "PedeAí" com destaque tipográfico no "AI"
  slug.js                       geração de slug a partir do nome do restaurante
  supabase-client.js            clientes Supabase (público + com token do restaurante)
  qrcode-helper.js              URL do cardápio, URL do painel e geração de QR Code no cliente
supabase/
  migrations/                  5 migrations SQL (extensões, produtos, pedidos/storage, categorias, fix de RLS)
  functions/ai-waiter/         Edge Function do garçom IA (TypeScript/Deno, roda no Supabase)
```

A Edge Function continua em TypeScript/Deno porque roda no servidor do
Supabase, não no navegador — nada aí precisa de Node local. O `index.ts` é
autocontido (sem imports de uma pasta `_shared/`) de propósito, para poder ser
colado direto no editor de Edge Functions do Supabase Dashboard — que não
resolve imports relativos fora da pasta da própria função.

O garçom IA usa **só a API de chat da DeepSeek** — sem embeddings/busca
vetorial. A cada mensagem, a Edge Function busca o cardápio completo
(produtos disponíveis) do restaurante no banco e manda a lista inteira no
prompt; o próprio modelo decide o que recomendar. A DeepSeek não tem
endpoint de embeddings, por isso essa foi a abordagem escolhida (ver nota no
topo de `ai-waiter/index.ts` e da migration `0002`).

**Categorias (seções do cardápio)**: o restaurante cria categorias livres
(ex: Entradas, Pratos principais, Bebidas) na aba Produtos do painel
(`restaurante/painel.js`) e atribui cada produto a uma delas pelo próprio
formulário do produto. Categoria é opcional — produto sem categoria (ou cuja
categoria foi excluída) aparece agrupado em "Outros". Sem nenhuma categoria
criada, o cardápio público continua como lista simples, sem cabeçalhos de
seção. Tabela `categories` na migration `0004`.

## Configuração

Todas as chaves ficam em [config.js](config.js), versionado no repositório:

```js
window.PEDEAI_CONFIG = {
  SUPABASE_URL: '...',
  SUPABASE_ANON_KEY: '...',   // pública, segura para expor — ver seção Segurança
  ADMIN_PASSWORD: '...',       // troque por uma senha forte
  APP_URL: '',                 // opcional: URL de produção, ex. 'https://pedeai.app/'
}
```

`config.js` já vem preenchido com a URL e a anon key do projeto Supabase. Troque
`ADMIN_PASSWORD` por uma senha forte antes de usar em qualquer ambiente
compartilhado. Deixe `APP_URL` em branco para o QR Code apontar automaticamente
para onde a página está rodando (localhost via Live Server, ou qualquer
hospedagem estática).

## Deploy do backend (Supabase Dashboard, sem CLI)

Sem Node local, o caminho mais simples é o próprio [Supabase Dashboard](https://supabase.com/dashboard) do projeto (`thwnhgpjysykkoblbtrd`):

1. **Migrations** → menu **SQL Editor** → **New query**. Abra cada arquivo de
   `supabase/migrations/` (nessa ordem: `0001`, `0002`, `0003`, `0004`,
   `0005`), cole o conteúdo inteiro do arquivo e clique **Run**. Rode um de
   cada vez, na ordem — cada uma depende de tabelas/extensões criadas na
   anterior.
2. **Secret da DeepSeek** → menu **Edge Functions** → **Manage secrets** →
   adicione `DEEPSEEK_API_KEY` com sua chave. Esse secret nunca vai para o
   frontend.
3. **Edge Functions** → **Deploy a new function** → nomeie exatamente
   `ai-waiter` → cole o conteúdo de `supabase/functions/ai-waiter/index.ts`
   (o arquivo inteiro, não a migration SQL) → desmarque **Enforce JWT
   Verification** (o `config.toml` do repo já define `verify_jwt = false`,
   mas isso só é lido pelo Supabase CLI — no Dashboard precisa desmarcar na
   tela) → **Deploy**.

Se o deploy da função falhar com um erro de "parse"/"bundle" apontando
para a linha 1, o motivo quase sempre é ter colado o arquivo errado no editor
(ex: uma migration `.sql` em vez do `.ts` da função) — confira o conteúdo
colado antes de tentar de novo.

Se você *tiver* o Supabase CLI instalado (não depende de Node, é um binário
próprio), o fluxo tradicional também funciona:

```bash
supabase link --project-ref thwnhgpjysykkoblbtrd
supabase db push
supabase secrets set DEEPSEEK_API_KEY=sk-...
supabase functions deploy ai-waiter
```

## Segurança — pontos importantes (MVP sem login)

- **RLS ativo em todas as tabelas** (`restaurants`, `products`, `orders`, `order_items`) e no bucket `products` do Storage.
- **Painel do restaurante** (`restaurante/index.html?token=...`) não usa Supabase Auth: o token da URL é enviado em todo request como header `x-restaurant-token`, e as policies de RLS (`current_restaurant_token()`) só liberam escrita nas linhas do restaurante dono do token.
- **`admin/index.html`**: a senha em `PEDEAI_CONFIG.ADMIN_PASSWORD` é um gate só no frontend — como não há Supabase Auth ainda, a policy de `insert`/`update` em `restaurants` é permissiva para a anon key (comentado em detalhe na migration `0001`). **Antes de produção**, migrar para Supabase Auth (ou mover o cadastro de restaurantes para uma Edge Function com `service_role`).
- **`DEEPSEEK_API_KEY`** só existe como secret do Supabase, usada dentro das Edge Functions — nunca aparece em nenhum arquivo do frontend.
- **`config.js` é público** (fica no navegador de qualquer visitante): só a `anon key` do Supabase e a senha de admin do MVP ficam ali. Nunca coloque a `service_role key` ou a chave da DeepSeek nesse arquivo.
- **Sem embeddings**: o garçom IA não usa busca vetorial — a DeepSeek não tem endpoint de embeddings, então o cardápio completo do restaurante é enviado no prompt (ver nota no topo de `ai-waiter/index.ts`). A coluna `embedding` e a função `match_products` (migration `0002`) ficam no banco só para uso futuro, se um dia você quiser plugar um provedor de embeddings.
- **Pegadinha de RLS + RETURNING**: se algum `insert()` do cliente anônimo (`orders`, `order_items`) passar a usar `.select()` de novo, o Postgres volta a rejeitar o insert inteiro com "new row violates row-level security policy" — não porque o insert em si seja proibido, mas porque devolver a linha (`RETURNING`) exige que a policy de **leitura** também libere, e o cliente anônimo não tem o token do restaurante pra isso. Ver o comentário em `placeOrder()` (`cliente/cardapio.js`) e a migration `0005`.

## Identidade visual

Logo com destaque tipográfico no "AI" (`js/logo.js`), paleta laranja/vermelho
(calor, convite) + roxo (tecnologia/IA), definida no `tailwind.config` inline
de cada página (Tailwind via CDN).
