# Projeção Igreja

Sistema de projeção de letras para a igreja, no estilo do Holyrics, com:

- **Letras com visual de destaque**: palavra-chave gigante, mistura de fontes, fundos animados e transição com desfoque.
- **Português em cima, inglês embaixo** (ou só PT, só EN, EN + PT), trocando com um clique.
- **Importação de louvores**: arquivo de exportação do **Holyrics (`.mufl`)**, colar texto, `.txt`, `.docx` (Word), `.xml` (OpenLyrics) e backup `.json`.
- **Bíblia PT/EN**: busca por referência (`jo 3 16`, `sl 23`, `1co 13:4`) ou por palavras, versículo em português com o inglês embaixo.
- **Temas da igreja**: editor visual com fundo animado, cor, degradê, **imagem ou vídeo**, escurecimento, fontes, logo e transição.
- **Telão, retorno (palco) e controle pelo celular**, sincronizados em tempo real pela rede local. Funciona sem internet.

## Instalar no Windows (recomendado)

1. Baixe o projeto e dê dois cliques em **`Instalar.cmd`** (instala o Node.js se precisar, as dependências e cria os atalhos).
2. Use o atalho **Projeção Igreja** na área de trabalho: abre o sistema sem janela preta. Para desligar, **Fechar Projeção** (ou Configurações › Sistema).
3. Opcional: na instalação, responda **S** para o sistema abrir sozinho quando o Windows ligar.

## Segurança

- Este computador nunca pede senha. **Celulares e outros computadores da rede** só controlam depois de digitar o **PIN** (Configurações › Segurança). Sem PIN criado, ninguém controla pela rede.
- O **pregador** e os **pedidos de louvor** entram pelo QR, que leva uma chave que só vale para aquele culto (dá para invalidar os QRs antigos).
- **Stream Deck / botões físicos**: `http://localhost:3000/api/control/next?k=CHAVE` (a chave e todos os endereços ficam em Configurações).
- Sites de fora não conseguem comandar o sistema pelo navegador (checagem de Host/Origin), links colados não acessam a rede interna e o PIN bloqueia depois de 5 tentativas erradas.

## Testes

`npm test` (servidor, letras, Bíblia, atualização e segurança) e `npm run test:e2e` (painel e telão num navegador). No GitHub eles rodam a cada envio, e o botão **Atualizar** só instala versões aprovadas.

## Como rodar

Requisito: [Node.js 22.13 ou mais novo](https://nodejs.org) (versão LTS).

```bash
npm install
npm start
```

No Windows, basta dar dois cliques em `iniciar.bat`.

| Tela | Endereço |
| --- | --- |
| Painel do operador | http://localhost:3000 |
| Telão (projetor) | http://localhost:3000/screen.html. Arraste para o projetor e aperte **F11** |
| Retorno do palco | http://localhost:3000/stage.html (`?semcifra` esconde as cifras) |
| Celular | botão **📱 Celular** no painel (QR code). O celular precisa estar no mesmo Wi-Fi |

Os dados ficam em `data/louvores.db` (SQLite). Para backup, use **Baixar backup** no painel (gera um `.json` que pode ser importado de volta).

### Modo aplicativo (opcional)

`npm i -D electron` e depois `npm run app`. Abre o painel e, se houver um segundo monitor ou projetor, já abre o telão em tela cheia nele. Ainda é experimental: o modo navegador acima é o caminho principal.

## Atalhos do operador

| Tecla | Ação |
| --- | --- |
| → ↓ Espaço PageDown | Próximo slide (no fim, vai para o próximo item do culto) |
| ← ↑ PageUp | Slide anterior |
| B | Tela preta |
| C | Tirar só a letra (fica o fundo) |
| Duplo clique num louvor ou item | Projetar do começo |

## Como escrever uma letra

```
Luz Que Não Se Apaga
Artista: Ministério
Tom: G
Ordem: V1 R V2 R P R R      (opcional)

[Verso 1]
^quando a^ *NOITE*
| When the night
~parece não ter fim~
| seems to have no end

[Refrão]
*LUZ* que não se apaga
| A light that never fades
_tudo é_ *graça*
| It is all grace

[Refrão]          ← rótulo sozinho = repete o refrão
[Refrão] 2x       ← repete 2 vezes
```

| Marcação | Efeito no telão |
| --- | --- |
| `*PALAVRA*` | Palavra-chave gigante |
| `_texto_` | Serifada itálica, colada na palavra-chave |
| `^texto^` / `~texto~` | Texto pequeno acima / abaixo |
| `\| texto` | Tradução em inglês da linha de cima |
| `---` | Força quebra de slide |
| Linhas só com cifras (`G D/F# Em C`) | Somem do telão e aparecem no retorno dos músicos |

Sem marcação nenhuma, a letra é projetada num layout limpo e centralizado. Assim um louvor importado já funciona, e você enfeita só os principais.

A importação também entende letras **sem rótulos**: separa as estrofes pelas linhas em branco, detecta o refrão pelo bloco repetido e reconhece `Refrão:`, `Chorus`, `(2x)` e outros. Para vários louvores no mesmo texto ou arquivo, separe-os com uma linha `===`.

## Sugestões automáticas na letra

No editor de louvor:
- **✨ Destacar palavras** escolhe a palavra-chave de cada slide e aplica o estilo do vídeo (`*PALAVRA*`, `_itálico_`, `^acima^`, `~abaixo~`). Funciona sem internet. Com a IA configurada, a escolha fica mais precisa. Slides que você já marcou não são alterados.
- **🌐 Traduzir** sugere o inglês das linhas que ainda não têm tradução, mantendo uma tradução por linha. Precisa da IA.
- **↶ Desfazer** volta a letra como estava antes da sugestão. Nada é salvo até você clicar em Salvar.

**IA (opcional):** em **⚙ Configurações**, cadastre uma chave da API da Anthropic (Claude), que você cria em console.anthropic.com. O modelo padrão é `claude-haiku-5-5`, rápido e barato; o uso é cobrado pela Anthropic. A chave fica salva só no banco local. Também dá para usar a variável de ambiente `ANTHROPIC_API_KEY`.

**Importar por link:** em **Importar**, cole o link da página da letra (sites de letras ou cifras) e clique em **Buscar**. O sistema lê título, artista e letra e mostra a prévia antes de salvar. Se o site mudar o layout e a letra não vier certa, copie a letra e cole no campo de texto.

## Bíblia

Já vêm instaladas quatro versões livres. Numa atualização do sistema, versões novas são instaladas sozinhas na próxima vez que ele abrir.
- **Bíblia Livre (BLIVRE)**, em português, de Diego Santos, com licença Creative Commons (CC BY).
- **Bíblia Livre — Textus Receptus (BLIVRETR)**, em português, do mesmo autor e com a mesma licença.
- **Berean Standard Bible (BSB)**, inglês moderno, de domínio público desde abril de 2023.
- **King James Version 1769 (KJV)**, em inglês, de domínio público.

**NAA, ARA, ARC, ACF e NVI** têm direitos autorais e não vêm no sistema. Para usar, a igreja precisa da autorização de quem detém cada versão. Depois é só importar o arquivo em **Versões**.

Clique em **📖 Bíblia** no topo do painel para abrir a tela da Bíblia:
- **Grade de livros** colorida por grupo (Lei, Históricos, Poéticos, Profetas, Evangelhos, Atos, Cartas e Apocalipse), com **capítulos** e **versículos** em botões grandes.
- **Busca rápida:** comece a digitar em qualquer lugar da tela (`jo 3 16`, `sl 23`, `1co 13:4`) e aperte **Enter** para projetar. Também busca por palavras, com o termo destacado nos resultados.
- **Lista do capítulo** com o português e a tradução embaixo. Clique no versículo para projetar, e as setas ← → passam para o próximo. O que está no telão fica destacado.
- **Versões:** escolha a Principal e a Tradução. **Por slide** projeta 1, 2 ou 3 versículos juntos, com a numeração.
- **★ Favoritos** (estrela em cada versículo), **🕘 Histórico** dos últimos projetados, capítulo anterior e próximo (passa de um livro para o outro), prévia do telão e **+ Culto** para colocar a leitura na lista.
- **⤓ Versões** importa outras Bíblias em JSON, nos formatos dos projetos *thiagobodruk/biblia* e *scrollmapper/bible_databases*. Importe só versões que a igreja tem direito de projetar: NVI, NAA, ARA e KJA, por exemplo, têm direitos autorais.

## Temas e mídia

Os temas prontos aparecem na galeria separados em três grupos:
- **Minimalistas:** Névoa, Luz central, Linhas, Pontos, Onda fina, Poeira de luz, Degradê vivo, Papel, Grafite, Claro e Preto simples. Têm movimento lento e discreto e a palavra-chave em Inter, que é mais limpa.
- **Expressivos:** Brasa, Aurora azul, Horizonte e Órbita.
- **Datas especiais:** Natal, Páscoa, Santa Ceia e Pentecostes.

Para criar um tema: **Tema** e depois **+ Criar tema**, ou **Copiar e editar** num tema pronto. Dá para escolher:
- o fundo: animação, cor, degradê, imagem ou vídeo, com escurecimento e desfoque;
- as cores e as fontes, e se a palavra-chave fica em maiúsculas;
- o logo, a posição dele e o tipo de transição.

A prévia mostra um louvor, o modo PT+EN e um versículo. Os arquivos ficam em `data/media` e são gerenciados no botão **Mídia**. Use vídeos curtos em loop, sem som, em 1920×1080 (mp4).

## Atualizações automáticas

O sistema se atualiza pelo GitHub (repositório padrão: `marcusdev2526/projecao-igreja`).
- Quando sai uma versão nova, aparece o botão laranja **Atualizar** no topo do painel. Também dá para procurar em **Configurações → Atualizações**.
- Ao clicar, o sistema baixa a versão nova, instala, reabre sozinho e as telas recarregam. **Seus louvores, temas e configurações (pasta `data`) não são tocados.**
- Para isso funcionar, abra sempre com `npm start` (ou `iniciar.bat`), que usam o inicializador `launcher.js`.
- Repositório privado: cadastre um token do GitHub (permissão só de leitura do conteúdo) em **Configurações → Atualizações**.

## Migrar do Holyrics

No Holyrics, exporte as músicas para um arquivo `.mufl`. Depois, no painel, use **Importar** e arraste esse arquivo. O sistema lê título, artista, notas (ex.: `CC160`, para a busca), hinário (vira tag) e a **ordem dos slides** de cada música. Também:

- Cada bloco separado por linha em branco no Holyrics vira uma parte do louvor, como lá.
- O bloco marcado com `Refrão`/`Coro` na primeira linha, ou o que mais se repete, vira o Refrão.
- Um bloco só com `Coro` vira "repetir o refrão".
- Números de estrofe dos hinários (`2`, `3`) saem do telão.
- Músicas que já existem (mesmo título e artista) aparecem como "Pular". Dá para trocar para "Substituir" na prévia.

O arquivo `.mufl` é lido só como dados (o leitor fica em `server/javaser.js`). Nada do arquivo é executado.

## Estrutura

```
launcher.js      inicializador: abre o sistema e reabre depois de atualizar
server/
  index.js       servidor: API REST + Socket.IO (estado ao vivo)
  updater.js     atualização automática pelo GitHub
  db.js          SQLite (node:sqlite): louvores, cultos, itens, histórico
  importers.js   TXT, DOCX, OpenLyrics, backup JSON
  holyrics.js    converte músicas do Holyrics (.mufl)
  bibleimport.js lê Bíblias em JSON e instala as que vêm em seed/biblias
  ai.js          tradução e palavra-chave com a IA (opcional)
  urlimport.js   importa a letra a partir do link de uma página
  javaser.js     leitor do formato do arquivo .mufl
  seed.js        2 louvores de demonstração (letras originais)
public/
  index.html     painel do operador (operator/app.js, operator/bible.js, operator.css)
  screen.html    telão
  stage.html     retorno do palco
  remote.html    controle pelo celular
  shared/
    parser.js    leitura da letra → partes, ordem, slides (usado no servidor e no navegador)
    render.js    desenho do slide 1920×1080, modos PT/EN, ajuste automático de tamanho
    themes.js    temas prontos, fundos animados e temas personalizados
    bible.js     livros da Bíblia e leitura de referências
    enhance.js   sugestão de palavra-chave e controle das traduções
    stage.css    fontes, estilos do texto, temas e transições
seed/biblias/    Bíblia Livre e KJV compactadas (carregadas na 1ª execução)
test/            testes (npm test)
```

## Próximas fases

- **Fase 2 (em andamento)**: importação CSV, contagem regressiva, imagens e vídeos soltos no culto (sem ser fundo).
- **Fase 3**: saída com fundo transparente para OBS, escala da equipe, relatórios, backup e sincronização na VPS.

## Mídia, apresentações e avisos

- **Abas no topo:** Louvores · Bíblia · Mídia · Apresentações · Avisos. A biblioteca da esquerda muda conforme a aba.
- **Arrastar e soltar:** solte qualquer arquivo na tela e ele entra no culto aberto.
  - Vídeo (mp4, webm, mov), imagem (jpg, png, webp) e áudio (mp3, wav, m4a).
  - PowerPoint (.pptx/.ppt) é convertido em slides pelo próprio PowerPoint do Windows.
  - PDF é convertido em slides no navegador.
- **Receber do pregador:** em Apresentações, o botão mostra um QR code. O celular (no mesmo Wi-Fi) abre `/enviar.html`, o pregador põe o nome e escolhe o arquivo, e ele entra direto no culto.
- **Player:** vídeo e áudio tocam na janela do telão. Embaixo da prévia ficam:
  - tocar/pausar, do começo e parar;
  - barra de tempo e volume;
  - "ao terminar": tema, próximo item, repetir ou parar.
- **Playback com letra:** no item do louvor no culto, o botão de fone liga um áudio ao louvor. Você passa os slides normalmente e controla o som pelo player.
- **Avisos:** aviso de texto, ou carrossel de imagens que passa sozinho (segundos por imagem, com repetição).

Se o navegador bloquear o som do telão, clique uma vez na janela do telão.

## Organização do culto

- **Blocos:** "+ Bloco" cria Abertura, Louvor, Palavra, Ofertas, Avisos (ou outro nome), com tempo previsto. Arraste o bloco: os itens abaixo dele fazem parte dele.
- **Cronômetro:** fica no topo da coluna da direita, com o relógio, o tempo de culto e o tempo do bloco atual (fica vermelho quando passa). O retorno do palco também mostra o bloco e o tempo.
- **Barra de comando** embaixo dos slides: Anterior, Próximo, Tela preta, Sem letra, Logo (atalho L) e Espera.
- **Tela de espera:** logo da igreja, contagem regressiva até o horário do culto e carrossel de avisos. Configure em ⚙ › Igreja e tela de espera.
- **Modelos:** em "+ Culto", salve o culto atual como modelo e crie os próximos a partir dele.
- **Backup automático:** em ⚙ › Backup, escolha uma pasta (pen drive ou Google Drive). Uma vez por dia é gerado um .zip, e os 10 últimos ficam guardados.
- **Bíblia:** versículo longo vira 2 telas e o fundo fica mais calmo. A referência fica no canto, embaixo.

## Operação rápida e equipe

- **Telão de reserva:** se o sistema fechar, ele reabre sozinho e volta para o mesmo slide, cartaz e tema.
- **Ctrl+K:** busca louvores, Bíblia, cartazes, mídias, apresentações e itens do culto. Enter mostra no telão; Shift+Enter adiciona ao culto.
- **Atalhos:** 1–9 pulam para o slide, R vai para o próximo refrão, F congela, Esc mostra o cartaz, L mostra a logo.
- **Ensaio:** o telão fica parado enquanto a equipe passa o culto na prévia e no retorno.
- **Letra com playback:** no player do louvor, "Gravar tempos" uma vez; depois o modo "Auto" passa a letra sozinho.
- **Escala** (dirigente, pregador, louvor, banda) aparece no retorno do palco junto com a lista do culto.
- **Pedidos pelo celular:** `/pedidos.html?s=ID` (QR no painel) para o ministro de louvor montar a lista.
- **Histórico:** louvores cantados por culto e os mais cantados.
- **Celular completo** (`/remote.html`): congelar, cartaz, Bíblia e controles de vídeo.
- **OBS:** `/obs.html` mostra só a letra com fundo transparente (`?faixa=1`, `?pos=topo`, `?tamanho=80`).
