# PapeiAI — Cardápio Digital

Cardápio digital com QR Code + o Ari, garçom IA, para restaurantes.

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
| [index.html](index.html) | — | Landing page pública, só de conversão (formulário de contato) — sem link nenhum pro admin/painel/cardápio |
| [admin/index.html](admin/index.html) | `/admin` | **Você**: cadastra restaurantes, gera QR Codes/links de painel e gerencia mesas |
| `admin/mesas-print.html?restaurant=<id>` | — | Folha A4 com um QR Code por mesa, pronta pra imprimir/salvar como PDF |
| `restaurante/index.html?token=<access_token>` | `/r/:accessToken` | **Restaurante**: painel de pedidos + produtos |
| `cliente/index.html?slug=<slug>` | `/:slug` | **Cliente**: cardápio público, com o Ari (garçom IA) |
| `cliente/index.html?slug=<slug>&mesa=<numero>` | `/:slug/mesa/:numero` | Cardápio público de uma mesa específica — `numero` precisa bater com uma mesa ativa cadastrada no admin |

`restaurante/` e `cliente/` sempre precisam do parâmetro na URL (`token` e
`slug`, respectivamente) — os links certos, já prontos, aparecem na tela do
admin depois que você cadastra um restaurante (o QR Code e o link "Painel:
..." ficam clicáveis ali). Abrir `restaurante/index.html` ou
`cliente/index.html` sem parâmetro mostra a tela de "link inválido"/"não
encontrado" — isso é esperado.

## Estrutura

```
config.js                     configuração pública (URL/anon key do Supabase, senha do admin, APP_URL)
manifest.json                 manifesto PWA (ícone/nome ao "Adicionar à Tela de Início")
index.html                    landing page pública (conversão — ver seção "Landing page e leads")
landing.js
images/
  logo.png                      logo oficial "PapeiAI" (com a tagline "Cardápio Digital" já na arte)
  avatar.png                    foto do Ari recortada (rosto), usada só no chat de verdade (cliente/cardapio.js)
  avatar-full.png                foto inteira do Ari, usada na landing page (hero e mockups)
  favicon.png                   ícone do navegador e da PWA (favicon + apple-touch-icon)
  restaurante.jpg                foto de salão, fundo desfocado do hero da landing page — ⚠️ tem marca-d'água de banco de imagens, ver aviso abaixo
  tela-branca.jpg                foto de mão com celular, usada na seção "Na mão do cliente" da landing (tela composta via CSS)
admin/
  index.html                   sua área: cadastra restaurantes, gera QR Codes/links de painel e gerencia mesas
  admin.js
  mesas-print.html              folha A4 com um QR Code por mesa (?restaurant=<id>)
  mesas-print.js
  mesas-print.css                layout de impressão (unidades físicas, @page, @media print)
restaurante/
  index.html                   painel do restaurante (?token=...)
  painel.js
cliente/
  index.html                   cardápio público (?slug=...&mesa=...)
  cardapio.js
css/style.css                 estilos base (além dos utilitários do Tailwind via CDN)
js/                            módulos compartilhados pelas três áreas acima
  util.js                       helpers (escapeHtml, formatBRL, errorMessage, loadingHtml, notFoundHtml)
  logo.js                       renderiza a logo oficial (images/logo.png) nos cabeçalhos
  slug.js                       geração de slug a partir do nome do restaurante
  supabase-client.js            clientes Supabase (público + com token do restaurante)
  qrcode-helper.js              URL do cardápio e do painel + geração de QR Code no cliente
supabase/
  migrations/                  10 migrations SQL (extensões, produtos, pedidos/storage, categorias, fix de RLS, dados do cliente, status/tempo de pedidos, mesas, logo do restaurante, leads)
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

**O garçom IA age no carrinho, não só conversa.** A Edge Function chama a
DeepSeek via **function calling** (`tools`/`tool_choice`, não só "modo JSON")
e recebe de volta, na mesma chamada, o texto pro cliente **e** uma lista de
ações estruturadas (`adicionar`, `remover`, `alterar_quantidade`,
`observacao`) — function calling é bem mais confiável em seguir o formato
exato do que só pedir JSON solto no prompt. Se mesmo assim vier sem um texto
de resposta utilizável, o servidor tenta de novo uma vez (com um lembrete
reforçado) antes de cair num fallback genérico — nunca mostra JSON quebrado
pro cliente. O subtotal do carrinho é **calculado no servidor**, não pelo
modelo (LLM fazendo soma de vários itens de cabeça erra) — o texto pronto
("Subtotal: R$ X,XX") já vai no prompt pra ele só citar. Nenhuma ação é
aplicada às cegas: o servidor revalida cada uma contra o cardápio e o
carrinho reais (produto existe? quantidade entre 1 e 20? item já está no
carrinho, no caso de remover/alterar?) antes de devolver — e o frontend
(`cliente/cardapio.js`, função `applyAiActions`) faz uma segunda validação
independente antes de mexer no carrinho de verdade. Não existe ação de
"finalizar pedido" no esquema: o modelo é estruturalmente incapaz de fechar
um pedido sozinho, só pode orientar o cliente a tocar em "Finalizar pedido".
Cada ação aplicada aparece no chat como um cartãozinho (entrada animada,
`prefers-reduced-motion` respeitado) e pulsa o botão do carrinho.

**O garçom IA também recomenda visualmente, não só em texto.** A mesma chamada de
function calling devolve um terceiro campo, `produtos_recomendados` (ids de
produto) — preenchido toda vez que a resposta cita, sugere ou lista produtos
do cardápio (cardápio de uma categoria, sugestão de complemento, opções numa
ambiguidade). O texto da resposta fica curto (sem repetir nome/preço) e cada
id vira um mini-card no chat com foto (se o produto tiver)/nome/preço — sem
botão de adicionar; tocar em qualquer parte do card fecha o chat e abre o
mesmo modal de detalhe do produto usado no cardápio público (foto grande,
descrição, ingredientes, observação, "Adicionar ao pedido"), pra manter um
fluxo único de adicionar item em todo o app. Mesma validação em duas camadas
das `acoes`: o servidor só aceita id/nome que resolva pra um produto real do
cardápio (máximo 8 por resposta), e o frontend (`cliente/cardapio.js`,
`sendChatMessage`) resolve os ids de novo contra o array `products` já
carregado antes de montar os cards.

**Categorias (seções do cardápio)**: o restaurante cria categorias livres
(ex: Entradas, Pratos principais, Bebidas) na aba Produtos do painel
(`restaurante/painel.js`) e atribui cada produto a uma delas pelo próprio
formulário do produto. Categoria é opcional — produto sem categoria (ou cuja
categoria foi excluída) aparece agrupado em "Outros". Sem nenhuma categoria
criada, o cardápio público continua como lista simples, sem cabeçalhos de
seção. Tabela `categories` na migration `0004`.

**Mesas e QR Code por mesa**: quem controla os QR Codes impressos é o super
admin, não o restaurante. No admin (`admin/admin.js`, botão "Mesas" de cada
restaurante), você digita quantas mesas o salão tem e clica "Gerar" — cria as
mesas `1`..`N` (dá pra rodar de novo com um número maior só pra adicionar
mais, sem duplicar as que já existem). Cada mesa pode ser renomeada pra um
rótulo livre (ex: "8 — Varanda"), ativada/desativada ou excluída. O botão
"Baixar folha de impressão" abre `admin/mesas-print.html`, que gera uma folha
A4 com um QR Code por mesa (`cliente/index.html?slug=X&mesa=Y`) — usa
`window.print()` do próprio navegador pra imprimir ou salvar como PDF, sem
biblioteca nenhuma. No cardápio, `?mesa=Y` é conferido contra a tabela
`mesas` (existe? está ativa?) antes de liberar o cardápio — mesa inexistente
ou desativada mostra uma tela pedindo pra chamar um atendente, sem deixar
pedir. Tabela `mesas` na migration `0008`, que também muda
`orders.table_number` de `int` pra `text` (pra caber o rótulo livre da
mesa, não só um número).

**Fluxo do cliente**: antes do cardápio, uma tela de boas-vindas pede
primeiro nome e telefone (com máscara e validação) — guardados no
`localStorage` do navegador, então visitas futuras no mesmo aparelho pulam
direto pro cardápio. Esses dados também vão junto de cada pedido
(`orders.customer_name`/`customer_phone`, migration `0006`) e aparecem no
painel do restaurante, com o telefone como link `tel:` pra ligar direto. O
carrinho é uma bottom sheet (mesmo padrão do chat) com observação por item
(`order_items.notes`, já existia desde a migration `0003`, só não era usada),
controle de quantidade e remoção.

**Landing page e leads**: `index.html` (raiz) é uma landing page só de
conversão — apresenta o produto (avatar do Ari com balão de fala, benefícios)
e tem um único caminho de ação: um botão que abre um formulário (nome,
telefone, email). Ela não tem nenhum link pro admin, painel ou cardápio — não
dá acesso ao sistema. Ao enviar, o formulário (`landing.js`) grava o lead
direto na tabela `leads` (migration `0010`), sem Edge Function nem envio de
email — pra conferir quem preencheu, é só abrir a aba **Leads da landing
page** que aparece no topo do painel admin (`admin/admin.js`), com nome,
telefone (`tel:`) e email (`mailto:`) de cada um, mais recente primeiro. Se
um dia você quiser receber um email a cada lead novo, dá pra adicionar uma
Edge Function (ex: com [Resend](https://resend.com)) disparada por um
[Database Webhook](https://supabase.com/docs/guides/database/webhooks) na
tabela `leads` — a tabela e a policy de insert público já estão prontas pra
isso, só falta essa peça.

O hero usa `images/restaurante.jpg` desfocada como fundo (com o Ari "na
beira" da seção, dissolvendo no rodapé via `mask-image`) e a seção "Na mão do
cliente" usa `images/tela-branca.jpg` (foto real de uma mão segurando um
celular de tela branca) — uma recriação bem simples do chat (barra roxa +
"bolhas" sem texto, pra não depender de fonte ilegível em tamanho minúsculo)
é posicionada por cima via CSS (`position: absolute` + `rotate()`, calibrado
a olho pelas coordenadas da tela na foto), não é uma imagem composta de
verdade. **Atenção**: `images/restaurante.jpg`, do jeito que foi fornecida,
tem uma marca-d'água de banco de imagens visível (fica bem disfarçada atrás
do blur e da sobreposição branca, mas ainda está lá) — troque por uma versão
licenciada/sem marca-d'água antes de publicar de verdade.

## Configuração

Todas as chaves ficam em [config.js](config.js), versionado no repositório:

```js
window.PEDEAI_CONFIG = {
  SUPABASE_URL: '...',
  SUPABASE_ANON_KEY: '...',   // pública, segura para expor — ver seção Segurança
  ADMIN_PASSWORD: '...',       // troque por uma senha forte
  APP_URL: '',                 // opcional: URL de produção, ex. 'https://papeiai.app/'
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
   `supabase/migrations/` (nessa ordem: `0001` a `0010`), cole o conteúdo
   inteiro do arquivo e clique **Run**. Rode uma de cada vez, na ordem — cada
   uma depende de tabelas/extensões criadas na anterior. O botão
   "Mesas" do admin e a validação de `?mesa=` no cardápio só funcionam depois
   da `0008` — antes disso, a tabela `mesas` não existe e qualquer link com
   `&mesa=` no cardápio mostra a tela de "mesa indisponível" (o erro de query
   é tratado, mas bloqueia por não conseguir confirmar a mesa). A logo do
   restaurante no cabeçalho do cardápio só funciona depois da `0009`
   (coluna `restaurants.logo_url`). O formulário da landing page
   (`index.html`) só funciona depois da `0010` (tabela `leads`) — antes
   disso, o envio falha com erro de tabela inexistente.
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

- **RLS ativo em todas as tabelas** (`restaurants`, `products`, `orders`, `order_items`, `mesas`, `leads`) e nos buckets `products` e `logos` do Storage.
- **`leads`**: mesmo aviso do `admin/index.html` logo abaixo — a leitura (aba "Leads" do admin) usa a mesma anon key pública, protegida só pelo gate de senha no frontend, não pela RLS (`leads_select_admin_mvp`, migration `0010`). Como o formulário coleta nome/telefone/email, isso é uma concessão deliberada de MVP; migrar pra Supabase Auth antes de produção também resolve esse ponto.
- **`mesas`**: leitura é pública (`using (true)`, mesmo padrão de `restaurants_select_public`/`products_select_public`) — não tem como a RLS diferenciar "o admin lendo" de "um cliente anônimo lendo" neste MVP sem Supabase Auth, então a regra "só mesa ativa aceita pedido" é aplicada na aplicação (`cliente/cardapio.js`), não escondida via RLS. Escrita (gerar/renomear/ativar/excluir mesa) segue o mesmo aviso do próximo item.
- **Painel do restaurante** (`restaurante/index.html?token=...`) não usa Supabase Auth: o token da URL é enviado em todo request como header `x-restaurant-token`, e as policies de RLS (`current_restaurant_token()`) só liberam escrita nas linhas do restaurante dono do token.
- **`admin/index.html`**: a senha em `PEDEAI_CONFIG.ADMIN_PASSWORD` é um gate só no frontend — como não há Supabase Auth ainda, a policy de `insert`/`update` em `restaurants` é permissiva para a anon key (comentado em detalhe na migration `0001`). **Antes de produção**, migrar para Supabase Auth (ou mover o cadastro de restaurantes para uma Edge Function com `service_role`).
- **`DEEPSEEK_API_KEY`** só existe como secret do Supabase, usada dentro das Edge Functions — nunca aparece em nenhum arquivo do frontend.
- **`config.js` é público** (fica no navegador de qualquer visitante): só a `anon key` do Supabase e a senha de admin do MVP ficam ali. Nunca coloque a `service_role key` ou a chave da DeepSeek nesse arquivo.
- **Sem embeddings**: o garçom IA não usa busca vetorial — a DeepSeek não tem endpoint de embeddings, então o cardápio completo do restaurante é enviado no prompt (ver nota no topo de `ai-waiter/index.ts`). A coluna `embedding` e a função `match_products` (migration `0002`) ficam no banco só para uso futuro, se um dia você quiser plugar um provedor de embeddings.
- **Pegadinha de RLS + RETURNING**: se algum `insert()` do cliente anônimo (`orders`, `order_items`) passar a usar `.select()` de novo, o Postgres volta a rejeitar o insert inteiro com "new row violates row-level security policy" — não porque o insert em si seja proibido, mas porque devolver a linha (`RETURNING`) exige que a policy de **leitura** também libere, e o cliente anônimo não tem o token do restaurante pra isso. Ver o comentário em `placeOrder()` (`cliente/cardapio.js`) e a migration `0005`.

## Identidade visual

Logo oficial do PapeiAI em `images/logo.png` (renderizada nos cabeçalhos por
`js/logo.js`), favicon/ícone de PWA em `images/favicon.png` (ligado em cada
página via `<link rel="icon">`/`apple-touch-icon` e no `manifest.json` da
raiz) e a foto do Ari em `images/avatar.png`, usada no chat
(`cliente/cardapio.js`). Paleta laranja/vermelho (calor, convite) + roxo
(tecnologia/IA), definida no `tailwind.config` inline de cada página
(Tailwind via CDN).

Cada restaurante pode ter sua própria logo (seção "Identidade visual" na aba
Produtos do painel, `restaurante/painel.js`), guardada em `restaurants.logo_url`
(migration `0009`) e no bucket de Storage `logos`. Ela aparece em destaque no
cabeçalho do cardápio público, com o nome do restaurante logo abaixo; sem
logo cadastrada, o cabeçalho mostra só o nome em texto. A marca "PapeiAI —
Cardápio Digital" continua presente, de forma discreta, no rodapé do
cardápio. O garçom IA em si sempre se apresenta só como "Ari", sem o nome do
produto junto (ver cabeçalho do chat em `cliente/cardapio.js`).
