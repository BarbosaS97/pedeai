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
| `admin/mesas-print.html?restaurant_id=<id>` | — | Artes de mesa (arte base + QR Code + número), 8 por folha A4 paisagem, prontas pra imprimir/salvar como PDF |
| [restaurante/index.html](restaurante/index.html) | `/r` | **Restaurante**: login (e-mail + senha) e painel de produtos — ver "Autenticação do restaurante" |
| `cliente/index.html?slug=<slug>` | `/:slug` | **Cliente**: cardápio público, com o Ari (garçom IA) |
| `cliente/index.html?slug=<slug>&mesa=<numero>` | `/:slug/mesa/:numero` | Cardápio público de uma mesa específica — `numero` precisa bater com uma mesa ativa cadastrada no admin |

`cliente/` sempre precisa do parâmetro `slug` na URL (`restaurante/` pede login) — os links certos, já prontos, aparecem na tela do
admin depois que você cadastra um restaurante (o QR Code e o link "Painel:
..." ficam clicáveis ali). Abrir `restaurante/index.html` ou
`cliente/index.html` sem parâmetro mostra a tela de "link inválido"/"não
encontrado" — isso é esperado.

## Estrutura

```
config.js                     configuração pública (URL/anon key do Supabase, APP_URL)
vercel.json                   rewrite de /cardapio/:slug (ver seção "Prévia de link")
api/cardapio-preview.js       Vercel Serverless Function por trás dessa rota (só funciona na Vercel)
manifest.json                 manifesto PWA (ícone/nome ao "Adicionar à Tela de Início")
index.html                    landing page pública (conversão — ver seção "Landing page e leads")
landing.js
images/
  logo.png                      logo oficial "PapeiAI" (wordmark, fundo transparente)
  avatar.png                    foto do Ari, corpo inteiro (2:3) — usada tanto no chat de verdade
                                 (cliente/cardapio.js, com zoom/crop via CSS pro rosto) quanto no
                                 CTA final da landing (sem crop)
  hero-ari.png                   Ari com o celular do cardápio + placa "Escaneie e peça" (QR
                                 Code), fundo já transparente (880x635) — hero da landing
  hero-lettering.png             letra "Bora papear?" desenhada à mão, fundo transparente
                                 (1779x884) — usada como imagem, não texto, no hero da landing
  favicon.png                   ícone do navegador e da PWA (favicon + apple-touch-icon)
  og-preview.png                 imagem genérica de prévia de link (og:image) — pessoa + celular +
                                 "PapeiAI Cardápio Digital" (1254x1254). NÃO é ícone (grande
                                 demais/detalhada pra virar favicon) — só aparece grande na prévia
                                 do WhatsApp/redes sociais, nunca na aba do navegador
  tela-branca.jpg                sem uso atualmente — sobrou de uma seção da landing que foi removida
admin/
  index.html                   sua área: cadastra restaurantes, gera QR Codes/links de painel e gerencia mesas
  admin.js
  mesas-print.html              artes de mesa, 8 por folha A4 (?restaurant_id=<id> | ?slug=)
  mesas-print.js
  mesas-print.css                layout de impressão (unidades físicas, @page, @media print)
restaurante/
  index.html                   painel do restaurante (login em auth.js)
  painel.js
cliente/
  index.html                   cardápio público (?slug=...&mesa=...)
  cardapio.js
css/style.css                 estilos base (além dos utilitários do Tailwind via CDN)
js/                            módulos compartilhados pelas três áreas acima
  util.js                       helpers (escapeHtml, formatBRL, errorMessage, loadingHtml, notFoundHtml)
  category-icons.js             banco de ícones das categorias (categories.icon, migration 0014)
  theme.js                      tema claro/escuro do admin e do painel (botão no topo)
  logo.js                       renderiza a logo oficial (images/logo.png) nos cabeçalhos
  slug.js                       geração de slug a partir do nome do restaurante
  supabase-client.js            client Supabase único (guarda também a sessão do login do restaurante)
  qrcode-helper.js              URL do cardápio e do painel + geração de QR Code no cliente
supabase/
  migrations/                  13 migrations SQL (extensões, produtos, pedidos/storage, categorias, fix de RLS, dados do cliente, status/tempo de pedidos, mesas, logo do restaurante, leads, observações/destaque de produto, cor de destaque do restaurante, WhatsApp do restaurante)
  functions/ai-waiter/         Edge Function do garçom IA (TypeScript/Deno, roda no Supabase)
  functions/admin-login/       Edge Function que verifica a senha do admin contra o secret SENHA_ADMIN
  functions/admin-generate-access/   gera login + senha provisórios do restaurante (exige a senha do admin)
  functions/restaurant-finish-setup/ conclui o primeiro acesso do restaurante (desliga must_reset)
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

**Observações do restaurante e produto em destaque** (migration `0011`,
colunas `products.notas_restaurante`/`products.destaque`): no formulário de
produto do painel, o restaurante pode cadastrar um texto livre (até 300
caracteres) com informação que o Ari precisa pra responder direito — se o
prato é servido frio, se contém glúten/lactose, se não dá pra tirar algum
ingrediente etc. Esse campo é diferente de `ingredients` (lista estruturada,
aparece no cardápio) e da observação do CLIENTE no carrinho
(`order_items.notes`) — nunca aparece pro cliente, só entra no prompt da Edge
Function (`buildSystemPrompt`) como contexto do produto, e só quando o
produto de fato tem algo cadastrado (produto sem observação não gasta token
à toa). O mesmo formulário tem um checkbox "Destacar no cardápio", limitado a
3 produtos por restaurante — validado no frontend (UX) **e** por um trigger
no banco (`enforce_max_destaque_products`, a validação de verdade, que barra
mesmo se o frontend for burlado). Produto em destaque aparece marcado
"DESTAQUE DA CASA" no prompt do Ari (que prioriza recomendá-lo quando fizer
sentido) e num bloco "Destaques da casa" no topo do cardápio público, acima
das categorias — some por completo se não houver nenhum destaque cadastrado.

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
"Gerar artes das mesas" abre `admin/mesas-print.html`, que gera uma folha
A4 paisagem, 8 artes por folha, cada uma com o QR Code da mesa (`cliente/index.html?slug=X&mesa=Y`) — usa
`window.print()` do próprio navegador pra imprimir ou salvar como PDF, sem
biblioteca nenhuma. No cardápio, `?mesa=Y` é conferido contra a tabela
`mesas` (existe? está ativa?) antes de liberar o cardápio — mesa inexistente
ou desativada mostra uma tela pedindo pra chamar um atendente, sem deixar
pedir. Tabela `mesas` na migration `0008`, que também muda
`orders.table_number` de `int` pra `text` (pra caber o rótulo livre da
mesa, não só um número).

**Fluxo do cliente**: antes do cardápio, uma tela de boas-vindas pede só o
primeiro nome, e é opcional — pode enviar em branco (só barra 1 caractere
avulso, ver `isWelcomeValid()`). Sem campo de telefone: o pedido não depende
mais de contato do cliente, já que agora pode ir direto pro WhatsApp do
restaurante (ver abaixo). O nome, se preenchido, é guardado no `localStorage`
do navegador (visitas futuras no mesmo aparelho pulam direto pro cardápio) e
vai junto de cada pedido (`orders.customer_name`, migration `0006`); em
branco, o Ari nunca menciona nome nenhum e o cabeçalho do cardápio também não
mostra saudação com nome. O painel do restaurante não tem mais uma aba de
pedidos (removida; só a aba Produtos existe hoje em `restaurante/painel.js`),
mas os pedidos continuam sendo gravados normalmente em `orders`/`order_items`.
O carrinho é uma bottom sheet (mesmo padrão do chat) com observação por item
(`order_items.notes`, já existia desde a migration `0003`, só não era usada),
controle de quantidade e remoção.

**Pedido direto no WhatsApp** (migration `0013`, `restaurants.whatsapp`):
quando o restaurante cadastra um número de WhatsApp (no admin, ao cadastrar
ou depois pelo botão "✎" na lista — `admin/admin.js` — ou no próprio painel,
seção "Identidade visual" — `restaurante/painel.js`), o carrinho do cardápio
ganha um segundo botão, "Enviar pedido no WhatsApp", ao lado de "Finalizar
pedido". Os dois salvam o pedido normalmente em `orders`/`order_items`
(mesmo histórico, mesma validação); o botão do WhatsApp faz isso e, além
disso, abre `https://wa.me/55<numero>?text=...` com um resumo do pedido
(itens, observação, mesa, subtotal) pronto pra enviar — o cliente só confirma
o envio lá. Sem WhatsApp cadastrado, esse botão simplesmente não aparece. O
número é guardado só como dígitos (DDD + número, 10-11 dígitos, sem "+55" —
mesmo padrão usado antes pro telefone do cliente, agora removido); o "+55" é
prefixado só na hora de montar o link (`whatsappOrderLink()`,
`cliente/cardapio.js`). Detalhe técnico: a aba do WhatsApp é aberta **antes**
do `await` que salva o pedido (com `window.open('', '_blank')`, navegada pro
link de verdade só depois) — Safari/iOS só permite `window.open()` como
reação síncrona direta a um clique; abrir depois de esperar o Supabase
seria bloqueado silenciosamente como pop-up.

**Landing page e contato**: `index.html` (raiz) é uma landing page só de
conversão — apresenta o produto (avatar do Ari, benefícios, vídeo de
demonstração) e tem um único caminho de ação: todo botão `.js-cta` (nav,
hero, CTA final) abre o WhatsApp do PapeiAI (`wa.me`, número + mensagem
prontos em `WHATSAPP_NUMBER`/`WHATSAPP_MESSAGE`, `landing.js`) numa aba nova.
Ela não tem nenhum link pro admin, painel ou cardápio — não dá acesso ao
sistema.

Antes disso, a landing usava um formulário (nome/telefone/email) que gravava
o lead na tabela `leads` (migration `0010`) — trocado pelo contato direto no
WhatsApp por ser mais rápido pro visitante e não depender de alguém do time
abrir o admin depois pra ligar de volta. A tabela `leads`, a policy de insert
público e a aba **Leads da landing page** no admin (`admin/admin.js`)
continuam no código (não fazem mal ficarem paradas) — só não recebem mais
nada de novo a partir da landing; qualquer lead que já tinha sido capturado
antes dessa troca continua visível lá.

**Vídeo de demonstração** (`videos/demo-cardapio.mp4`, seção "Veja
funcionando"): vídeo vertical (celular) com o cardápio de verdade rodando,
já com legendas/destaques gravados na própria arte — por isso não tem mockup
de celular por cima, o vídeo já É a tela. Sem autoplay (arquivo pesado,
~20MB, e ninguém pediu som/movimento automático) — usa `controls` +
`preload="metadata"` (só baixa o suficiente pra mostrar o `poster`
até a pessoa tocar em play) e `images/video-poster.png` (frame do próprio
vídeo, extraído com OpenCV) como capa estática antes do play.

O hero usa duas artes prontas com fundo já transparente, em vez de recriar
tudo em CSS/texto: `images/hero-lettering.png` (a letra "Bora papear?"
desenhada à mão, no lugar do `<h1>` de texto — três tentativas de imitar isso
com fonte cursiva/gradiente/sombra não chegaram perto do resultado de uma
arte de verdade) e `images/hero-ari.png` (Ari com o celular do cardápio e a
placa de QR Code, substituindo o mockup de celular que antes era recriado em
CSS por cima de uma foto). Duas tentativas anteriores de usar vídeo aqui no
lugar (`videos/hero-ari.mp4`, hoje removido do repo) foram abandonadas: a
primeira tinha fundo preto sólido e tentava removê-lo *ao vivo* no navegador
(`<canvas>` + `getImageData`/`putImageData`, um chroma/luma key simples) —
não ficou bom o bastante e só funciona servida por HTTP (quebra com
`file://`); a segunda veio com fundo branco sólido do próprio exportador
(**MP4/H.264 não tem canal alpha** — "sem fundo" nunca é transparente de
verdade num MP4), branco esse que ficava visível contra o creme da página.
`images/tela-branca.jpg` (foto de mão com celular, usada numa seção "Na mão
do cliente" que existiu numa versão anterior da landing) não é mais
referenciada em lugar nenhum — a seção foi removida, o arquivo só ficou no
repo sem uso.

A landing usa uma paleta separada do resto do site — creme (`bg-cream`) +
tinta azul-marinho (`bg-ink`/`text-ink`, a cor real do "Papei" no logo) +
laranja de destaque, com títulos grandes em Sora (`font-display`) — pra
parecer uma marca de comida com personalidade própria, não uma ferramenta de
IA genérica. Esses tokens (`cream`, `ink`, `font-display`) só existem no
`tailwind.config` de `index.html`; nenhuma outra página os usa.

## Configuração

Todas as chaves ficam em [config.js](config.js), versionado no repositório:

```js
window.PEDEAI_CONFIG = {
  SUPABASE_URL: '...',
  SUPABASE_ANON_KEY: '...',   // pública, segura para expor — ver seção Segurança
  APP_URL: '',                 // opcional: URL de produção, ex. 'https://papeiai.app/'
}
```

`config.js` já vem preenchido com a URL e a anon key do projeto Supabase. Deixe
`APP_URL` em branco para o QR Code apontar automaticamente para onde a página
está rodando (localhost via Live Server, ou qualquer hospedagem estática).

A senha do admin (`admin/index.html`) **não** fica em `config.js` — é o secret
`SENHA_ADMIN`, configurado só no Supabase e verificado pela Edge Function
`admin-login` (ver seção de deploy abaixo). Trocar a senha é só atualizar esse
secret no Dashboard; não precisa editar nem versionar nenhum arquivo.

## Deploy do backend (Supabase Dashboard, sem CLI)

Sem Node local, o caminho mais simples é o próprio [Supabase Dashboard](https://supabase.com/dashboard) do projeto (`thwnhgpjysykkoblbtrd`):

1. **Migrations** → menu **SQL Editor** → **New query**. Abra cada arquivo de
   `supabase/migrations/` (nessa ordem: `0001` a `0013`), cole o conteúdo
   inteiro do arquivo e clique **Run**. Rode uma de cada vez, na ordem — cada
   uma depende de tabelas/extensões criadas na anterior. O botão
   "Mesas" do admin e a validação de `?mesa=` no cardápio só funcionam depois
   da `0008` — antes disso, a tabela `mesas` não existe e qualquer link com
   `&mesa=` no cardápio mostra a tela de "mesa indisponível" (o erro de query
   é tratado, mas bloqueia por não conseguir confirmar a mesa). A logo do
   restaurante no cabeçalho do cardápio só funciona depois da `0009`
   (coluna `restaurants.logo_url`). O formulário da landing page
   (`index.html`) só funciona depois da `0010` (tabela `leads`) — antes
   disso, o envio falha com erro de tabela inexistente. O campo "Observações
   do restaurante" e o checkbox "Destacar no cardápio" no formulário de
   produto (`restaurante/painel.js`) só funcionam depois da `0011` (colunas
   `products.notas_restaurante`/`products.destaque`) — antes disso, salvar um
   produto falha com erro de coluna inexistente. O seletor de "Cor de
   destaque" na Identidade visual do painel só funciona depois da `0012`
   (coluna `restaurants.theme_color`) — antes disso, salvar a cor falha com
   erro de coluna inexistente (o cardápio e o painel continuam funcionando
   normalmente com o laranja padrão, que é só um fallback em CSS). O campo
   "WhatsApp do restaurante" (no admin e na Identidade visual do painel) e o
   botão "Enviar pedido no WhatsApp" do carrinho só funcionam depois da
   `0013` (coluna `restaurants.whatsapp`) — antes disso, salvar o número
   falha com erro de coluna inexistente (o botão do carrinho simplesmente
   não aparece, já que depende desse campo estar preenchido).
2. **Secrets** → menu **Edge Functions** → **Manage secrets** → adicione
   `DEEPSEEK_API_KEY` com a chave da DeepSeek e `SENHA_ADMIN` com a senha que
   você quer usar pra entrar em `admin/index.html`. Nenhum dos dois secrets
   vai para o frontend — trocar a senha depois é só atualizar `SENHA_ADMIN`
   aqui, sem editar nem versionar nenhum arquivo.
3. **Edge Functions** → **Deploy a new function**, uma vez para cada função:
   nomeie exatamente `ai-waiter` → cole o conteúdo de
   `supabase/functions/ai-waiter/index.ts`; e nomeie exatamente `admin-login`
   → cole o conteúdo de `supabase/functions/admin-login/index.ts` (o arquivo
   inteiro, não a migration SQL) → em cada uma, desmarque **Enforce JWT
   Verification** (o `config.toml` do repo já define `verify_jwt = false`
   pras duas, mas isso só é lido pelo Supabase CLI — no Dashboard precisa
   desmarcar na tela) → **Deploy**. Sem a função `admin-login` publicada (ou
   sem o secret `SENHA_ADMIN`), a tela de login do admin nunca libera —
   qualquer senha digitada dá "Senha incorreta" (ou um erro de rede, se a
   função nem existir ainda).

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
supabase secrets set SENHA_ADMIN=...
supabase functions deploy ai-waiter
supabase functions deploy admin-login
```

## Prévia de link (WhatsApp/redes sociais) com a foto do restaurante

**Só funciona hospedado na Vercel** (é onde o site está hoje, `papeiai.com.br`,
DNS na Cloudflare) — depende de `vercel.json` + `api/cardapio-preview.js`,
recursos específicos da Vercel. Em GitHub Pages ou outra hospedagem 100%
estática isso não funciona (o link cai de volta pro comportamento antigo, sem
quebrar nada — só sem a prévia).

**O problema que isso resolve**: `cliente/index.html` é uma SPA estática — o
HTML é sempre o mesmo arquivo pra qualquer restaurante, os dados de verdade
(nome, foto) só chegam depois, via JavaScript, buscando no Supabase. Isso é
ótimo pra pessoas de verdade, mas ruim pra pré-visualização de link: o robô
do WhatsApp/Facebook/Telegram que gera aquela prévia com foto+título não
executa JavaScript, só lê o HTML bruto — então via de regra ele cai no
`apple-touch-icon` (favicon do PapeiAI) pra qualquer restaurante, nunca a foto
de cada um.

**Como funciona**: os links pensados pra COMPARTILHAR como texto (botão
"copiar link do cardápio"/"Ver cardápio público" no admin —
`menuShareUrl()`, `js/qrcode-helper.js`) agora apontam pra
`papeiai.com.br/cardapio/:slug` em vez de `cliente/index.html?slug=...`
direto. Um rewrite no `vercel.json` manda essa rota pra
`api/cardapio-preview.js` (Vercel Serverless Function, zero-config — qualquer
`.js` dentro de `api/` vira endpoint sozinho, sem build), que olha o
`User-Agent` de quem pediu:

- **Pessoa de verdade** (qualquer User-Agent que não bata com a lista de
  robôs conhecidos): redireciona (302) direto pro cardápio de verdade — o
  salto extra é imperceptível, e só acontece nesse link, nunca no QR Code
  (que continua apontando direto pra `menuUrl()`, sem passar por aqui, já
  que ninguém "pré-visualiza" um QR Code escaneado).
- **Robô de prévia de link** (User-Agent do WhatsApp, Facebook, Telegram,
  Twitter/X, LinkedIn, Slack, Discord etc. — lista em `BOT_UA_PATTERN`, não
  precisa ser exaustiva): busca o restaurante direto na tabela `restaurants`
  via API REST do Supabase (mesma anon key pública de sempre, protegida pela
  policy de leitura pública `restaurants_select_public`, migration `0001`) e
  devolve um HTML só com as tags Open Graph certas — `og:image` = logo do
  restaurante (`restaurants.logo_url`, migration `0009`) quando tiver uma
  cadastrada; sem logo, cai na imagem genérica do PapeiAI
  (`images/og-preview.png`, `FALLBACK_IMAGE_URL` em `api/cardapio-preview.js`)
  em vez de sair sem imagem nenhuma. A mesma imagem genérica é usada como
  fallback estático (via tag `<meta property="og:image">` fixa no HTML) em
  `index.html` (landing) e `cliente/index.html`, pro caso de alguém
  compartilhar o link direto (sem passar pela rota `/cardapio/:slug`) — nesses
  dois casos a imagem não varia por restaurante, é sempre a genérica, porque
  são arquivos estáticos sem essa lógica de bot/Supabase por trás.

**Depois de fazer o deploy (`git push`, a Vercel redeploya sozinha), teste de
verdade antes de confiar**: o comportamento de bot-detection só se prova
certo com um robô de verdade, não dá pra simular 100% testando no navegador.
Duas formas fáceis:
1. [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
   com a URL `https://www.papeiai.com.br/cardapio/<slug de um restaurante>`
   — mostra exatamente a prévia que seria gerada, e tem um botão "Scrape
   Again" pra forçar buscar de novo se você mudar a logo depois.
2. Mandar o link de verdade pra você mesmo no WhatsApp.

Se a prévia não aparecer: confira se o registro DNS de `papeiai.com.br` na
Cloudflare está como **"Proxied"** (nuvem laranja) — se estiver, olhe
**Security → Bots** no painel da Cloudflare, porque regras de bot-fight-mode
ou WAF muito estritas podem estar barrando o robô do WhatsApp/Facebook antes
mesmo dele chegar na Vercel (esse é o suspeito nº 1 se tudo no código estiver
certo e mesmo assim não funcionar).

## Autenticação do restaurante

Cada restaurante tem um usuário no Supabase Auth (`restaurants.auth_user_id`).

**Fluxo**

1. Ao cadastrar um restaurante no admin, abre o modal **Gerar acesso provisório**. Você repete a sua senha de admin; a Edge Function `admin-generate-access` cria o usuário e devolve **login** (o slug do restaurante) e **senha provisória**, uma única vez, pra você repassar ao dono. Restaurantes que já existiam têm o mesmo botão "Gerar acesso provisório" no cartão.
2. Primeiro acesso, em `restaurante/index.html`: o dono entra com o login e a senha provisórios → informa o **e-mail** → recebe o link de confirmação (Resend) → clica → define a **nova senha**. Só então o painel abre. Até lá a RLS bloqueia todos os dados (`app_metadata.must_reset`).
3. Nos acessos seguintes o login é o e-mail + a senha nova. **Esqueci minha senha** envia o link de redefinição pro e-mail cadastrado.
4. "Gerar acesso provisório" num restaurante que já tem e-mail/senha própria **substitui** as credenciais e liga `must_reset` de novo (o bloqueio vale na hora, inclusive pra sessões abertas): o dono refaz o primeiro acesso. Se ele perdeu o acesso ao e-mail, é o caminho.

Os links antigos `restaurante/index.html?token=...` **deixam de funcionar**: gere o acesso provisório de cada restaurante existente e repasse.

**Configuração (uma vez, no Supabase + Resend)**

1. **Resend**: crie conta, verifique o seu domínio (DNS) e crie uma API key.
2. **Supabase → Authentication → Emails → SMTP Settings**: ative o SMTP próprio — Host `smtp.resend.com`, porta `465`, usuário `resend`, senha = a API key, remetente = um endereço do domínio verificado (ex: `PapeiAI <nao-responda@seudominio.com.br>`). Sem SMTP próprio o Supabase só envia uns poucos e-mails por hora, só pra membros do time.
3. **Supabase → Authentication → Sign In / Providers → Email**: mantenha "Confirm email" ligado e **desligue "Secure email change"**. Com ele ligado o Supabase também exige confirmação no e-mail antigo, que aqui é o sintético do acesso provisório (`<slug>@acesso.papeiai.com.br`, nunca recebe nada) — o dono ficaria travado. (Equivalente no `config.toml`: `double_confirm_changes = false`.)
4. **Authentication → URL Configuration**: em *Site URL* e *Redirect URLs* coloque o endereço do painel (`https://www.papeiai.com.br/restaurante/index.html`, e o de localhost se for testar local). É pra lá que os links dos e-mails levam.
5. **Authentication → Emails → Templates**: os e-mails saem em inglês por padrão. Os modelos em português, com logo e o Ari, estão em `supabase/templates/`. Abra a aba **Change email address**, troque o *Subject* por `Confirme seu e-mail no PapeiAI` e cole o conteúdo de `email_change.html` no corpo; na aba **Reset password**, use o assunto `Redefina sua senha do PapeiAI` e o conteúdo de `recovery.html`. As imagens vêm de `https://www.papeiai.com.br/images/email/` (versões leves do logo e do Ari), então só aparecem depois que o site com essa pasta estiver publicado. As variáveis `{{ .ConfirmationURL }}` e `{{ .NewEmail }}` são do Supabase — não mexa nelas.
6. **Deploy**: rode a migration `0015_restaurant_auth.sql` e publique as Edge Functions `admin-generate-access` e `restaurant-finish-setup` (mesmo processo das outras; ambas com "Verify JWT" desligado, e usam `SENHA_ADMIN` + as variáveis `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` que o Supabase já injeta).

**Limitações conhecidas**: o Supabase limita o envio de e-mails por conta própria (429, tratado na tela); proteção contra força bruta no login: ver a próxima seção. A escrita em `restaurants`/`mesas`/`leads` pelo admin continua sem Supabase Auth (gate de senha no frontend — ver abaixo).

## Turnstile e limite de tentativas

Os dois logins (super admin e restaurante) têm captcha do **Cloudflare Turnstile** e limite de tentativas.

| Login | Captcha | Limite de tentativas |
|---|---|---|
| **Super admin** (`admin/`) | Verificado pela Edge Function `admin-login` (secret `TURNSTILE_SECRET_KEY`) | 5 senhas erradas em 15 min → o **IP** fica bloqueado 15 min (429, com o tempo restante na tela). Vale também pro "Gerar acesso provisório" (`admin-generate-access`), que compartilha o contador. Contadores em `auth_rate_limits` (migration `0016`). |
| **Restaurante** (`restaurante/`) | **Nativo do Supabase Auth** (Attack Protection → CAPTCHA), cobre login e "esqueci minha senha" | **Rate limits do próprio Supabase Auth** (por IP). Não há bloqueio por conta. |

Por que o restaurante usa o captcha nativo e não uma função minha na frente: o login dele fala direto com o Supabase Auth, então qualquer proteção "de fora" pode ser contornada chamando `/auth/v1/token` direto com a anon key (que é pública). Com o CAPTCHA ligado no Auth, o próprio Supabase recusa qualquer tentativa sem token válido, inclusive as diretas. O preço é não ter bloqueio por conta (só por IP).

**Configuração (uma vez)**

1. **Cloudflare → Turnstile → Add widget**: hostnames `papeiai.com.br` e `www.papeiai.com.br` (e `localhost` pra testar), modo *Managed*. Guarde a **Site Key** (pública) e a **Secret Key**.
2. **Site key**: em `config.js`, `TURNSTILE_SITE_KEY: '<site key>'`.
3. **Admin** — secret da Edge Function: Dashboard → Edge Functions → Secrets → `TURNSTILE_SECRET_KEY` = a Secret Key. Rode a migration `0016_auth_rate_limits.sql` e republique `admin-login` e `admin-generate-access`. (Sem o secret, `admin-login` **pula** a checagem do captcha pra não te trancar pra fora — mas aí o login não está protegido.)
4. **Restaurante** — Dashboard → Authentication → **Attack Protection** → *Enable CAPTCHA protection* → provedor **Cloudflare Turnstile** → cole a mesma Secret Key. **Ordem importa**: só ligue depois de publicar o site com a site key (item 2); antes disso o login dos restaurantes fica sem widget e o Supabase recusa tudo.
5. **Rate limits do Auth** — Authentication → **Rate Limits**: reduza "Rate limit for sign-ups and sign-ins" (padrão 30 a cada 5 min por IP) para algo como **10**.

**Desenvolvimento local**: a Cloudflare tem chaves de teste (site key `1x00000000000000000000AA` sempre passa, secret `1x0000000000000000000000000000000AA`). Com site key vazia em `config.js` o widget nem aparece.

## Segurança — pontos importantes (MVP sem login)

- **RLS ativo em todas as tabelas** (`restaurants`, `products`, `orders`, `order_items`, `mesas`, `leads`) e nos buckets `products` e `logos` do Storage.
- **`leads`**: mesmo aviso do `admin/index.html` logo abaixo — a leitura (aba "Leads" do admin) usa a mesma anon key pública, protegida só pelo gate de senha no frontend, não pela RLS (`leads_select_admin_mvp`, migration `0010`). Como o formulário coleta nome/telefone/email, isso é uma concessão deliberada de MVP; migrar pra Supabase Auth antes de produção também resolve esse ponto.
- **`mesas`**: leitura é pública (`using (true)`, mesmo padrão de `restaurants_select_public`/`products_select_public`) — não tem como a RLS diferenciar "o admin lendo" de "um cliente anônimo lendo" neste MVP sem Supabase Auth, então a regra "só mesa ativa aceita pedido" é aplicada na aplicação (`cliente/cardapio.js`), não escondida via RLS. Escrita (gerar/renomear/ativar/excluir mesa) segue o mesmo aviso do próximo item.
- **Painel do restaurante** usa Supabase Auth (migration `0015`): as policies de RLS liberam escrita/leitura privada só pro usuário dono do restaurante (`owned_restaurant_ids()`) e só depois do primeiro acesso concluído. O antigo `access_token` (legível por qualquer um, porque `restaurants` tem leitura pública) não dá mais acesso a nada.
- **`admin/index.html`**: o login chama a Edge Function `admin-login`, que compara a senha digitada com o secret `SENHA_ADMIN` — a senha em si não fica mais em nenhum arquivo do frontend (antes ficava em `PEDEAI_CONFIG.ADMIN_PASSWORD`, visível em "ver código-fonte" por qualquer visitante). Isso fecha o vazamento da senha, mas **não** fecha a brecha de fundo: como ainda não há Supabase Auth, a policy de `insert`/`update` em `restaurants` continua permissiva pra qualquer request com a anon key (comentado em detalhe na migration `0001`) — ou seja, tecnicamente dá pra pular a tela de login inteira e chamar a API do Supabase direto com a anon key pública, sem precisar de senha nenhuma. `admin.js` também não guarda um token de sessão assinado, só uma flag em `sessionStorage` depois do "ok" da função — o "login" não é reverificado a cada request, só na hora de entrar. **Antes de produção**, migrar para Supabase Auth de verdade (ou mover o cadastro/edição de restaurantes para Edge Functions com `service_role`, cada uma revalidando a sessão).
- **`DEEPSEEK_API_KEY`** e **`SENHA_ADMIN`** só existem como secrets do Supabase, usadas dentro das Edge Functions (`ai-waiter` e `admin-login`, respectivamente) — nunca aparecem em nenhum arquivo do frontend.
- **`config.js` é público** (fica no navegador de qualquer visitante): só a `anon key` do Supabase e a `APP_URL` ficam ali. Nunca coloque a `service_role key`, a chave da DeepSeek ou a senha do admin nesse arquivo — essas três são sempre secrets de Edge Function.
- **Sem embeddings**: o garçom IA não usa busca vetorial — a DeepSeek não tem endpoint de embeddings, então o cardápio completo do restaurante é enviado no prompt (ver nota no topo de `ai-waiter/index.ts`). A coluna `embedding` e a função `match_products` (migration `0002`) ficam no banco só para uso futuro, se um dia você quiser plugar um provedor de embeddings.
- **Pegadinha de RLS + RETURNING**: se algum `insert()` do cliente anônimo (`orders`, `order_items`) passar a usar `.select()` de novo, o Postgres volta a rejeitar o insert inteiro com "new row violates row-level security policy" — não porque o insert em si seja proibido, mas porque devolver a linha (`RETURNING`) exige que a policy de **leitura** também libere, e o cliente anônimo não tem o token do restaurante pra isso. Ver o comentário em `placeOrder()` (`cliente/cardapio.js`) e a migration `0005`.

## Identidade visual

Logo oficial do PapeiAI em `images/logo.png` (renderizada nos cabeçalhos por
`js/logo.js`), favicon/ícone de PWA em `images/favicon.png` (ligado em cada
página via `<link rel="icon">`/`apple-touch-icon` e no `manifest.json` da
raiz) e a foto do Ari em `images/avatar.png`, usada no chat
(`cliente/cardapio.js`). Paleta azul (marca/"Papei") + laranja-vermelho
("AI"/Ari), definida no `tailwind.config` inline de cada página (Tailwind via
CDN) — sem roxo, pra bater com as cores reais do logo.

O cardápio público (`cliente/`) é a única área com **tema escuro** — fundo
quase-preto (`bg-surface`, cartões em `bg-surface-card`/`bg-surface-raised`,
tokens definidos só no `tailwind.config` de `cliente/index.html`), pensado
pra parecer um app de delivery premium. `admin/`, `restaurante/` e a landing
(`index.html` da raiz) continuam em tema claro — os tokens `surface-*` não
existem no `tailwind.config` delas de propósito, pra não vazar o tema escuro
pra área administrativa.

Cada restaurante pode ter sua própria logo (seção "Identidade visual" na aba
Produtos do painel, `restaurante/painel.js`), guardada em `restaurants.logo_url`
(migration `0009`) e no bucket de Storage `logos`. Ela aparece em destaque no
cabeçalho do cardápio público, com o nome do restaurante logo abaixo; sem
logo cadastrada, o cabeçalho mostra só o nome em texto. A marca "PapeiAI —
Cardápio Digital" continua presente, de forma discreta, no rodapé do
cardápio. O garçom IA em si sempre se apresenta só como "Ari", sem o nome do
produto junto (ver cabeçalho do chat em `cliente/cardapio.js`).

**Cor de destaque por restaurante** (migration `0012`, `restaurants.theme_color`,
formato `#RRGGBB`, padrão `#FF6823` — o laranja atual): mesma seção
"Identidade visual" do painel tem um seletor de cor (color picker nativo +
campo de texto hex, com pré-visualização ao vivo) que substitui o laranja em
tudo que hoje é `brand-orange` — botões, badges (ex: "Destaque"), preços,
avatar/bolha do chat do Ari, FAB — tanto no cardápio público quanto no
próprio painel. Vermelho (erro/exclusão/gradiente) e azul (links) continuam
fixos, só a cor de destaque é editável; o tema claro/escuro
(botão pequeno no topo, em todas as telas: admin, painel e cardápio) segue a
preferência do celular/computador da pessoa e guarda a escolha dela no
navegador (`js/theme.js`). No admin e no painel isso é feito com overrides
`html[data-theme='dark']` em `css/style.css`; o cardápio usa uma paleta em CSS
vars (`--surface*`, `--ink`, ver `tailwind.config` de `cliente/index.html`) —
escuro é o padrão, `data-theme="light"` troca os valores. Em texto sobre
superfície do cardápio use `text-ink` (não `text-white`, que fica só pra texto
sobre laranja/vermelho/gradiente). Tecnicamente, como o Tailwind vem
por CDN sem build, isso é feito sem trocar nenhuma classe: `brand.orange` no
`tailwind.config` de `cliente/index.html`/`restaurante/index.html` é definido
como `rgb(var(--brand-orange-rgb) / <alpha-value>)`, e `applyThemeColor()`
(`js/util.js`) converte o hex salvo em `"R G B"` e escreve a CSS var
`--brand-orange-rgb` no `<html>` assim que os dados do restaurante carregam
(`cardapio.js`/`painel.js`, antes do primeiro render) — toda classe existente
(`bg-brand-orange`, `text-brand-orange/40`, `from-brand-orange` etc., e as
classes utilitárias em `css/style.css` como `.shadow-brand-ai`) já lê essa
var sozinha. `admin/` e a landing (`index.html` da raiz) NÃO participam disso
— continuam com o laranja do PapeiAI fixo no `tailwind.config` delas, porque
são ferramentas do PapeiAI, não do restaurante.
