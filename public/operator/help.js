// Ajuda animada: botão "?" no topo.
//  • "Me mostre": lista de dúvidas → passo a passo animado em cima do painel de verdade
//    (escurece a tela, ilumina o lugar certo, um cursor vai até lá e "clica", um cartão explica).
//  • "O que é isto?": clique em qualquer parte do painel e aparece o que ela faz.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ------------------------------------------------------------------ passos de cada assunto
// sel: onde apontar · do: preparar a tela antes (abrir aba etc.) · click: o cursor faz o gesto de clique
const tab = (t) => () => document.querySelector(`#srcTabs [data-src="${t}"]`)?.click();
const view = (v) => () => document.querySelector(`#viewSeg [data-view="${v}"]`)?.click();
const clickEl = (sel) => () => document.querySelector(sel)?.click();
const closeDlg = (...ids) => () => ids.forEach((id) => { const d = document.getElementById(id); if (d?.open) d.close(); });
const openDlg = (id, btn) => () => { if (!document.getElementById(id)?.open) document.querySelector(btn)?.click(); };
// uma seção das Configurações: do título (h3) até o próximo título
const sec = (txt) => () => {
  const h = [...document.querySelectorAll('#settings .st-h')].find((x) => x.textContent.trim().startsWith(txt));
  if (!h) return null;
  const out = [h];
  for (let n = h.nextElementSibling; n && !n.classList.contains('st-h'); n = n.nextElementSibling) out.push(n);
  return out;
};
const inSet = (fn) => () => { openDlg('settings', '#settingsBtn')(); return fn?.(); };
const TOURS = [
  { id: 'comecar', icon: '🚀', title: 'Primeiros passos', desc: 'Abrir o telão e projetar o primeiro louvor', steps: [
    { sel: '#openScreen', click: true, t: 'Abra o telão', d: 'Abre a janela que vai para o projetor. Arraste-a para a segunda tela e aperte F11 para tela cheia.' },
    { sel: '#screenWarn', t: 'Confira se está projetando', d: 'Vermelho = telão fechado (clique para abrir). Verde = projetando.' },
    { sel: '#serviceSel', t: 'Escolha o culto', d: 'Cada culto tem a sua lista. Use “+ Culto” para criar um novo.' },
    { sel: '#itemList .item', click: true, t: 'Clique num item do culto', d: 'Os trechos dele aparecem no centro.' },
    { sel: '#slideGrid .slide', click: true, t: 'Clique num trecho', d: 'Ele vai na hora para o telão. Daí em diante, use as setas → ← do teclado.' },
    { sel: '#nextBtn', t: 'Próximo', d: 'Passa para o próximo trecho. Atalhos: seta →, Espaço ou Page Down (passador de slides).' },
  ] },
  { id: 'montar', icon: '🗂️', title: 'Montar o culto', desc: 'Adicionar louvores, avisos e organizar a ordem', do: view('inicio'), steps: [
    { sel: '#newServiceBtn', t: 'Novo culto', d: 'Cria a lista de um culto (data e nome).' },
    { sel: '#srcTabs [data-src="louvores"]', do: tab('louvores'), click: true, t: 'Aba Louvores', d: 'Sua biblioteca de letras.' },
    { sel: '#search', t: 'Busque o louvor', d: 'Pelo título, artista ou um pedaço da letra. Se não tiver, o sistema já procura na internet.' },
    { sel: '#songList .song', t: 'Adicione ao culto', d: 'Arraste para a lista da esquerda, clique no ＋ ou dê dois cliques para projetar na hora.' },
    { sel: '#itemList', t: 'Reorganize', d: 'Arraste os itens para mudar a ordem do culto.' },
    { sel: '#addTextBtn', t: 'Avisos e blocos', d: '“+ Aviso” cria um texto livre; “+ Bloco” separa o culto em partes com tempo previsto.' },
  ] },
  { id: 'projetar', icon: '🎤', title: 'Projetar durante o culto', desc: 'Passar trechos, tela preta, logo e espera', do: view('inicio'), steps: [
    { sel: '#livePreview', t: 'Prévia do telão', d: 'É exatamente o que o público está vendo agora.' },
    { sel: '#slideGrid', t: 'Trechos', d: 'Clique em qualquer trecho para pular direto. Laranja = no ar.' },
    { sel: '#prevBtn', t: 'Anterior / Próximo', d: 'Setas ← → também funcionam, e o passador de slides sem fio.' },
    { sel: '#blackBtn', click: true, t: 'Tela preta', d: 'Apaga o telão (tecla T). Clique de novo para voltar.' },
    { sel: '#clearBtn', t: 'Sem letra', d: 'Tira só a letra e deixa o fundo do tema.' },
    { sel: '#logoBtn', t: 'Logo', d: 'Mostra a logo da igreja se montando — ótima para abertura e intervalos.' },
    { sel: '#waitBtn', t: 'Espera', d: 'Tela de “o culto já vai começar”, com contagem.' },
    { sel: '#modes', t: 'Idioma', d: 'PT, PT+EN (português com inglês embaixo), EN ou EN+PT.' },
  ] },
  { id: 'congelar', icon: '❄️', title: 'Congelar o telão', desc: 'Preparar o próximo sem o público ver', do: view('inicio'), steps: [
    { sel: '#freezeBtn', click: true, after: () => { if (!document.body.classList.contains('is-frozen')) document.getElementById('freezeBtn')?.click(); }, t: 'Congelar (tecla C)', d: 'O telão fica parado no que está agora. Você pode mexer à vontade sem o público ver.' },
    { sel: '#prepPreview', t: 'Preparado', d: 'À esquerda, o que você está preparando.' },
    { sel: '#livePreview', t: 'No telão', d: 'À direita, o que o público vê. Com letra no telão, as setas continuam passando a letra AQUI.' },
    { sel: '#liveNav', t: 'Controle do telão', d: 'Botões ◀ ▶ e um atalho para cada trecho da letra que está no ar.' },
    { sel: '#prepGo', t: 'Jogar no telão (Enter)', d: 'Quando estiver pronto, solta o que preparou e o telão volta ao normal. Vídeo ou playback preparado já começa tocando, com som.' },
  ], after: () => { if (document.body.classList.contains('is-frozen')) document.getElementById('freezeBtn')?.click(); }, cleanup: true },
  { id: 'biblia', icon: '📖', title: 'Bíblia', desc: 'Achar e projetar versículos', steps: [
    { sel: '#srcTabs [data-src="biblia"]', do: tab('biblia'), t: 'Busca rápida', d: 'Na aba Bíblia da direita, digite a referência: “jo 3 16”, “sl 23”, “rm 8 28-30”.' },
    { sel: '#viewSeg [data-view="biblia"]', click: true, t: 'Bíblia completa', d: 'Tela própria com todos os livros, capítulos e versículos.', after: view('biblia') },
    { sel: '.bv-search', do: view('biblia'), t: 'Digite a referência', d: 'Ou clique no livro, no capítulo e no versículo.' },
    { sel: '.bv-left', do: view('biblia'), t: 'Versões', d: 'Escolha a versão principal e a tradução. “＋ Baixar mais versões…” instala outras (ARC, NVI, KJV…).' },
    { sel: '#viewSeg [data-view="inicio"]', do: view('biblia'), click: true, t: 'Voltar ao Início', d: 'O versículo continua no telão.', after: view('inicio') },
  ] },
  { id: 'video', icon: '🎬', title: 'Vídeos, imagens e playback', desc: 'Enviar arquivos e controlar o vídeo', do: view('inicio'), steps: [
    { sel: '#srcTabs [data-src="midia"]', do: tab('midia'), click: true, t: 'Aba Mídia', d: 'Vídeos, imagens e playbacks da igreja.' },
    { sel: '#mediaList', do: tab('midia'), t: 'Envie arquivos', d: 'Arraste do computador, cole com Ctrl+V (WhatsApp, Telegram) ou use “Procurar na pasta”. Aceita MP4, MOV, WEBM, imagens e áudio MP3, M4A, WAV.' },
    { sel: '#mediaList .mrow', do: tab('midia'), t: 'Mostrar no telão', d: 'Arraste para a prévia do telão, ou clique no ▶ do arquivo.' },
    { sel: '#mediaSelBtn', do: tab('midia'), t: 'Em lote', d: 'Marque vários arquivos na ordem e crie uma sequência para passar com →.' },
    { sel: '#mediaFiltBtn', do: tab('midia'), t: 'Filtro', d: 'Separe por categoria, data ou origem (WhatsApp, gravações…).' },
    { sel: '#playerBar', t: 'Player', d: 'Com vídeo no telão aparece aqui: play/pausa, linha do tempo, volume e o que fazer ao terminar.' },
  ], after: tab('louvores') },
  { id: 'celular', icon: '📱', title: 'Controlar pelo celular', desc: 'Passar slides de qualquer lugar da igreja', steps: [
    { sel: '#phoneBtn', click: true, t: 'Botão do celular', d: 'Mostra um QR code. Leia com a câmera do celular, no mesmo Wi-Fi: ele já entra controlando, sem senha.' },
    { sel: '#settingsBtn', t: 'PIN (opcional)', d: 'Em Configurações › Segurança você cria um PIN para quem não puder ler o QR.' },
    { sel: '#reqBtn', t: 'Pedidos pelo celular', d: 'QR para o ministro de louvor montar a lista do culto pelo celular.' },
  ] },
  { id: 'aparencia', icon: '🎨', title: 'Temas e aparência', desc: 'Fundo do telão e cores do painel', steps: [
    { sel: '#themeBtn', click: true, t: 'Tema do telão', d: 'Fundos animados, cenas ilustradas, ADPC, Gravura… Também dá para criar o seu.' },
    { sel: '#lightBtn', t: 'Aparência do painel', d: 'Preto, Grafite ou três claros (ADPC, areia, gelo). Vale só para este computador.' },
    { sel: '#focusBtn', t: 'Modo culto', d: 'Esconde o que não é usado durante o culto, para não errar.' },
  ] },
  { id: 'emergencia', icon: '🆘', title: 'Se algo der errado', desc: 'Atalhos para não passar aperto', steps: [
    { sel: '#blackBtn', t: 'Apague o telão', d: 'Tecla T (ou ponto): tela preta na hora enquanto você resolve.' },
    { sel: '#screenWarn', t: 'Telão fechou?', d: 'Se ficar vermelho, clique nele para abrir de novo. O telão também reconecta sozinho se o sistema reiniciar.' },
    { sel: '#settingsBtn', t: 'Backup e atualização', d: 'Em Configurações: backup automático, “Fechar o sistema” e atualização.' },
    { sel: '#itemList', t: 'Errou? Ctrl+Z', d: 'Ctrl+Z desfaz o que você fez no culto: item adicionado ou tirado, lote de vídeos, ordem trocada, mídia ou louvor apagado. Ctrl+Y refaz.' },
  ] },
  { id: 'importar', icon: '📥', title: 'Importar um louvor', desc: 'Pela internet, colando a letra ou por arquivo (Holyrics, Word)', do: () => { view('inicio')(); tab('louvores')(); }, steps: [
    { sel: '#search', t: 'Jeito mais rápido: busque', d: 'Digite o nome do louvor. Se ele não estiver na biblioteca, aparece “Buscar na internet”: clique, confira a letra e importe com 1 clique.' },
    { sel: '#importBtn', click: true, t: 'Ou use o botão Importar', d: 'Abre a janela de importação com três jeitos de trazer letras.', after: openDlg('importer', '#importBtn') },
    { sel: '#imUrl', do: openDlg('importer', '#importBtn'), t: '1 · Link da letra', d: 'Copie o endereço da página da letra (site de letras ou cifras), cole aqui e clique em Buscar. O sistema tira a cifra e as propagandas sozinho.' },
    { sel: '#imText', do: openDlg('importer', '#importBtn'), t: '2 · Colar a letra', d: 'Cole o texto. A primeira linha vira o título. Para vários louvores de uma vez, separe com uma linha ===. Linha começando com | é a tradução em inglês.' },
    { sel: '#drop', do: openDlg('importer', '#importBtn'), t: '3 · Arquivos', d: 'Arraste arquivos do Holyrics (.mufl), Word (.docx), texto (.txt), OpenLyrics (.xml) ou um backup (.json). Pode ser vários de uma vez.' },
    { sel: '#imPreview', do: openDlg('importer', '#importBtn'), click: true, t: 'Ver prévia', d: 'Mostra a lista do que vai entrar, avisa os repetidos e deixa escolher: importar, pular ou substituir. Depois clique em Importar.' },
    { sel: '#imClose', do: openDlg('importer', '#importBtn'), t: 'Pronto!', d: 'Os louvores aparecem na biblioteca. Arraste para o culto ou clique no ＋.' },
  ], after: closeDlg('importer'), cleanup: true },
  { id: 'editor', icon: '✏️', title: 'Criar e editar a letra', desc: 'Partes, palavra-chave, inglês, tom e etiquetas', do: () => { view('inicio')(); tab('louvores')(); }, steps: [
    { sel: '#newSongBtn', click: true, t: '+ Novo louvor', d: 'Abre o editor com um modelo pronto. Para editar um que já existe, dê dois cliques nele ou use o lápis.', after: openDlg('editor', '#newSongBtn') },
    { sel: '#edSource', do: openDlg('editor', '#newSongBtn'), t: 'Escreva a letra', d: 'Primeira linha = título. Use [Verso 1], [Refrão], [Ponte] para as partes. Linha em branco = próximo slide.' },
    { sel: '.ed-metabar', do: openDlg('editor', '#newSongBtn'), t: 'Tom, BPM e etiquetas', d: 'Dados para a banda e para achar depois (ex.: etiqueta “Ceia”, “Adoração”). As etiquetas viram filtros na biblioteca.' },
    { sel: '#editor details.help', do: openDlg('editor', '#newSongBtn'), t: 'Como escrever', d: '*PALAVRA* fica gigante, _texto_ em itálico serifado, ^texto^ pequeno em cima. [Refrão] sozinho repete o refrão.' },
    { sel: '#edKw', do: openDlg('editor', '#newSongBtn'), t: 'Destacar palavras', d: 'Sugere a palavra-chave de cada slide automaticamente. Não gostou? ↶ Desfazer.' },
    { sel: '#edOfficial', do: openDlg('editor', '#newSongBtn'), t: 'Inglês', d: 'Tradução automática ou a letra oficial em inglês, linha por linha.' },
    { sel: '#edTheme', do: openDlg('editor', '#newSongBtn'), t: 'Tema do louvor', d: 'Opcional: este louvor sempre entra com esse tema no telão.' },
    { sel: '#edPreviews', do: openDlg('editor', '#newSongBtn'), t: 'Prévia', d: 'Cada slide como vai aparecer no telão, atualizado enquanto você digita.' },
    { sel: '#edSave', do: openDlg('editor', '#newSongBtn'), t: 'Salvar', d: 'Salva na biblioteca. (Neste passo a passo nada é salvo.)' },
  ], after: closeDlg('editor'), cleanup: true },
  { id: 'tema', icon: '🖼️', title: 'Tema: tudo o que tem', desc: 'Galeria, categorias e o editor de tema por dentro', steps: [
    { sel: '#themeBtn', click: true, t: 'Botão Tema', d: 'Abre a galeria de temas do telão.', after: openDlg('themes', '#themeBtn') },
    { sel: '#themeGrid .theme-cat', do: openDlg('themes', '#themeBtn'), t: 'Categorias', d: 'Os temas estão separados: os da igreja (criados por vocês), animados, cenas ilustradas, fotos e vídeos, e os especiais (ADPC, Gravura).' },
    { sel: '#themeGrid .theme-card', do: openDlg('themes', '#themeBtn'), click: true, t: 'Clique para usar', d: 'O tema entra no telão na hora, em tudo que for letra e Bíblia. A borda azul marca o tema atual.' },
    { sel: '#themeGrid .theme-card .edit', do: openDlg('themes', '#themeBtn'), t: 'Copiar e editar', d: 'Faz uma cópia do tema para você mudar cores, fontes e fundo sem estragar o original.' },
    { sel: '#mediaBtn', do: openDlg('themes', '#themeBtn'), t: 'Mídia (fundos e logos)', d: 'Envie suas imagens e vídeos de fundo e a logo da igreja para usar nos temas.' },
    { sel: '#newThemeBtn', do: openDlg('themes', '#themeBtn'), click: true, t: '+ Criar tema', d: 'Vamos abrir o editor e ver cada parte.', after: openDlg('themeEd', '#newThemeBtn') },
    { sel: '#teName', do: openDlg('themeEd', '#newThemeBtn'), t: 'Nome do tema', d: 'Ex.: “Santa Ceia”, “Jovens”.' },
    { sel: '#teForm fieldset:nth-of-type(1)', do: openDlg('themeEd', '#newThemeBtn'), t: 'Fundo', d: 'Animado, cor, degradê, imagem ou vídeo. Em “Movimento” você coloca um motion por cima (partículas, luzes, brilho). “Escurecer” deixa a letra mais legível.' },
    { sel: '#teForm fieldset:nth-of-type(2)', do: openDlg('themeEd', '#newThemeBtn'), t: 'Texto', d: 'Cor da letra e da tradução, as três fontes (palavra-chave, texto e itálico), tamanho, MAIÚSCULAS e brilho.' },
    { sel: '#teForm fieldset:nth-of-type(3)', do: openDlg('themeEd', '#newThemeBtn'), t: 'Logo e transição', d: 'Logo no canto (posição e tamanho) e como um slide passa para o outro.' },
    { sel: '#teSample', do: openDlg('themeEd', '#newThemeBtn'), t: 'Prévia', d: 'Veja o tema com letra estilizada, com inglês e com versículo antes de usar.' },
    { sel: '#teApply', do: openDlg('themeEd', '#newThemeBtn'), t: 'Salvar e usar', d: 'Guarda o tema em “Temas da igreja” e já coloca no telão. (Neste passo a passo nada é salvo.)' },
  ], after: closeDlg('themeEd', 'themes'), cleanup: true },
  { id: 'config', icon: '⚙️', title: 'Configurações, uma por uma', desc: 'Segurança, Stream Deck, igreja, OBS, backup e atualização', steps: [
    { sel: '#settingsBtn', click: true, t: 'Botão Configurações', d: 'A engrenagem no canto de cima abre as configurações deste sistema.', after: openDlg('settings', '#settingsBtn') },
    { el: inSet(sec('Segurança')), t: 'Segurança', d: 'Quem pode controlar pela rede. Este computador nunca pede senha. Celulares entram pelo QR do botão 📱 ou pelo PIN.' },
    { el: inSet(() => document.querySelector('#secPin')?.parentElement), t: 'Criar o PIN', d: 'Digite de 4 a 8 números (evite 1234) e clique em Salvar PIN. Quem abrir o sistema por outro aparelho digita esse PIN uma vez.' },
    { el: inSet(() => document.querySelector('#secRevoke')?.parentElement), t: 'Se perder o controle', d: '“Desconectar todos” derruba os celulares conectados. “Invalidar QRs” cancela os links do pregador e dos pedidos.' },
    { el: inSet(sec('Passador')), t: 'Passador e Stream Deck', d: 'O passador sem fio já funciona. Para o Stream Deck, copie o link de cada ação (próximo, tela preta, congelar…) para um botão “Website”.' },
    { el: inSet(sec('Sistema')), t: 'Sistema', d: 'Liga/desliga a animação da logo na abertura e tem o botão “Fechar o sistema” (desliga tudo no fim do culto).' },
    { el: inSet(sec('Inteligência')), t: 'Inteligência artificial (opcional)', d: 'Com a chave da Anthropic, o sistema traduz letras para o inglês e escolhe a palavra-chave melhor. Sem ela, tudo continua funcionando.' },
    { el: inSet(sec('Igreja')), t: 'Igreja e tela de espera', d: 'Nome e logo da igreja, a marca pequena embaixo da letra, o horário do culto (contagem da tela de espera), a frase e os avisos que passam na espera.' },
    { el: inSet(sec('Transmissão')), t: 'Transmissão (OBS / YouTube)', d: 'Copie o endereço e cole numa fonte “Navegador” do OBS: a letra aparece por cima da câmera, no estilo que você escolher.' },
    { el: inSet(sec('Backup')), t: 'Backup automático', d: 'Escolha uma pasta (pen drive ou Google Drive) e marque “todo dia”. Se o computador der problema, nada se perde.' },
    { el: inSet(sec('Atualizações')), t: 'Atualizações', d: '“Procurar atualização” busca a versão nova no GitHub. Só instala versões que passaram nos testes, e reabre sozinho.' },
    { sel: '#stSave', do: openDlg('settings', '#settingsBtn'), click: true, t: 'Salvar', d: 'Depois de mudar algo, clique em Salvar. (Neste passo a passo nada é salvo.)' },
  ], after: closeDlg('settings'), cleanup: true },
  { id: 'avisos', icon: '📢', title: 'Avisos', desc: 'Aviso escrito, carrossel de artes e cartaz fixo', do: () => { view('inicio')(); tab('avisos')(); }, steps: [
    { sel: '#srcTabs [data-src="avisos"]', click: true, t: 'Aba Avisos', d: 'Tudo de aviso fica aqui.' },
    { sel: '.av-how', t: 'Como funciona', d: 'Escolha o tipo, ele entra na lista do culto e você clica para projetar quando chegar a hora.' },
    { sel: '#avTextBtn', t: 'Aviso escrito', d: 'Digite o recado (tem modelos prontos: boas-vindas, agenda, aniversariantes, ofertas). Linha em branco = próximo slide.' },
    { sel: '#avCarBtn', t: 'Carrossel de artes', d: 'Escolha as imagens na ordem. Elas passam sozinhas, em repetição — ótimo antes do culto começar.' },
    { sel: '#avPosterBtn', t: 'Cartaz fixo', d: 'Uma arte que fica de fundo entre os momentos. Tecla Esc volta para ele. Aceita imagem e PDF.' },
    { sel: '#avSvcList', t: 'Avisos deste culto', d: '▶ projeta, lápis edita, lixeira tira do culto (Ctrl+Z desfaz).' },
  ], after: tab('louvores') },
  { id: 'slides', icon: '📊', title: 'Slides, PowerPoint e PDF', desc: 'Pregação e apresentações', do: () => { view('inicio')(); tab('apresentacoes')(); }, steps: [
    { sel: '#srcTabs [data-src="apresentacoes"]', click: true, t: 'Aba Slides', d: 'Apresentações da pregação, estudos e eventos.' },
    { sel: '#decksPane [data-pick="deck"]', t: '+ Enviar', d: 'PowerPoint (.pptx) ou PDF viram slides sozinhos. Sem PowerPoint no computador? Salve como PDF: funciona igual.' },
    { sel: '#qrBtn', t: 'Receber do pregador', d: 'Mostra um QR: o pregador manda o arquivo pelo celular e ele entra direto no culto.' },
    { sel: '#deckList', t: 'Projetar', d: 'Clique no ▶ ou adicione ao culto. Passe com → e ← ou com o passador sem fio.' },
  ], after: tab('louvores') },
  { id: 'extras', icon: '🧰', title: 'Ferramentas extras', desc: 'Busca, escala, pedidos, ensaio, histórico', do: view('inicio'), steps: [
    { sel: '#palBtn', t: 'Buscar tudo (Ctrl+K)', d: 'Um campo só para achar louvor, versículo, cartaz, mídia ou slide. Enter projeta, Shift+Enter põe no culto.' },
    { sel: '#scaleBtn', t: 'Escala', d: 'Quem dirige, prega, ministra e opera neste culto.' },
    { sel: '#reqBtn', t: 'Pedidos', d: 'QR para o ministro de louvor escolher as músicas pelo celular. Cada pedido chega aqui com aviso.' },
    { sel: '#rehBtn', t: 'Ensaio', d: 'Congela o telão e deixa a equipe passar o culto só na prévia e no retorno.' },
    { sel: '#histBtn', t: 'Histórico', d: 'O que foi cantado em cada culto e quantas vezes.' },
    { sel: '#focusBtn', t: 'Modo culto', d: 'Esconde o que não é usado durante o culto para não errar.' },
  ] },
  { id: 'atalhos', icon: '⌨️', title: 'Atalhos do teclado', desc: 'Todas as teclas, num cartão só', steps: [
    { t: 'Atalhos', d: 'P · ir para a Projeção (Início)\nL · Louvores (já com a busca)\nB · Bíblia completa\nC ou F · Congelar · Enter · jogar no telão\n→ / Espaço · próximo · ← · anterior\n1 a 9 · pula para o trecho · R · próximo refrão\nT ou . · tela preta · W ou , · sem letra · O · logo\nEsc · cartaz · K · play/pausa do vídeo\nCtrl+Z · desfazer · Ctrl+Y · refazer · Ctrl+K · buscar · F1 · ajuda\nNa Bíblia, use Alt+letra (Alt+P, Alt+L…), porque digitar vai para a busca.' },
  ] },
];

// O que é cada coisa (modo "O que é isto?") — o primeiro seletor que bater vence
const WHAT = [
  ['#openScreen', 'Abrir o telão', 'Abre a janela que vai para o projetor.'],
  ['#openStage', 'Retorno do palco', 'Tela para a banda e o pregador: letra atual, próxima e relógio.'],
  ['#phoneBtn', 'Celular', 'QR code para controlar a projeção pelo celular.'],
  ['#screenWarn', 'Situação do telão', 'Verde = projetando. Vermelho = telão fechado (clique para abrir).'],
  ['#viewSeg', 'Início / Bíblia completa', 'Troca entre o painel do culto e a tela da Bíblia.'],
  ['#modes', 'Idioma da letra', 'PT, PT+EN, EN ou EN+PT no telão.'],
  ['#themeBtn', 'Tema', 'Fundo e estilo da letra no telão.'],
  ['#timerCard', 'Relógio do culto', 'Hora atual e quanto tempo de culto já passou (↺ zera).'],
  ['#palBtn', 'Buscar', 'Procura qualquer coisa (Ctrl+K): louvor, versículo, comando.'],
  ['#rehBtn', 'Ensaio', 'Congela o telão para ensaiar sem o público ver.'],
  ['#focusBtn', 'Modo culto', 'Esconde o que não é usado durante o culto.'],
  ['#lightBtn', 'Aparência', 'Cores do painel: Preto, Grafite ou claros.'],
  ['#settingsBtn', 'Configurações', 'Igreja, segurança, OBS, backup e atualização.'],
  ['#serviceSel', 'Culto', 'Escolha qual culto está montando ou projetando.'],
  ['#itemList', 'Ordem do culto', 'Clique para abrir, arraste para reordenar.'],
  ['#livePreview, .pv-frame', 'Prévia do telão', 'O que o público está vendo agora.'],
  ['#slideGrid', 'Trechos', 'Clique num trecho para mandá-lo ao telão.'],
  ['#playerBar', 'Player', 'Controles do vídeo ou playback que está tocando.'],
  ['#prevBtn', 'Anterior', 'Volta um trecho (seta ←).'],
  ['#nextBtn', 'Próximo', 'Avança um trecho (seta →, Espaço).'],
  ['#freezeBtn', 'Congelar', 'Para o telão para preparar o próximo sem o público ver (tecla C ou F).'],
  ['#blackBtn', 'Tela preta', 'Apaga o telão (tecla T ou ponto).'],
  ['#clearBtn', 'Sem letra', 'Tira a letra e deixa só o fundo.'],
  ['#baseBtn', 'Cartaz', 'Mostra o cartaz fixo do culto (Esc).'],
  ['#msgBtn', 'Recado', 'Mensagem rápida na tela (ex.: “carro placa X”).'],
  ['#logoBtn', 'Logo', 'Logo da igreja se montando no telão.'],
  ['#waitBtn', 'Espera', 'Tela de espera antes do culto, com contagem.'],
  ['#srcTabs', 'Fontes', 'Louvores, Bíblia, Cartazes, Mídia, Slides e Avisos para adicionar ao culto.'],
  ['#songList', 'Biblioteca de louvores', 'Arraste para o culto ou dê dois cliques para projetar.'],
  ['#mediaList', 'Mídia', 'Vídeos, imagens e playbacks. Arraste para o telão.'],
  ['.bv-search', 'Busca da Bíblia', 'Digite “jo 3 16” e aperte Enter.'],
  ['.bv-left', 'Versões da Bíblia', 'Versão principal, tradução e quantos versículos por slide.'],
  ['#importBtn', 'Importar', 'Traz letras por link, colando o texto ou por arquivo (Holyrics, Word, OpenLyrics).'],
  ['#newSongBtn', 'Novo louvor', 'Abre o editor para escrever uma letra.'],
  ['#search', 'Buscar louvor', 'Título, artista ou trecho. Se não achar, busca na internet.'],
  ['#tagRow', 'Etiquetas', 'Filtra a biblioteca por etiqueta. “Sugestões” mostra louvores que não aparecem há tempo.'],
  ['#postersPane', 'Cartazes', 'Artes fixas do evento. Esc volta para o cartaz.'],
  ['#decksPane', 'Slides', 'PowerPoint e PDF da pregação.'],
  ['#avisosPane', 'Avisos', 'Aviso escrito, carrossel de artes e cartaz fixo.'],
  ['#addBlockBtn', 'Bloco', 'Separa o culto em partes com tempo previsto.'],
  ['#addTextBtn', 'Aviso', 'Texto livre que entra no culto.'],
  ['#prepGo', 'Jogar no telão', 'Solta o que foi preparado (Enter). Vídeo e playback já tocam.'],
  ['#prepPreview', 'Preparado', 'O que você está preparando com o telão congelado.'],
  ['#helpBtn', 'Ajuda', 'Passo a passo animado de cada parte do sistema (F1).'],
];

// ------------------------------------------------------------------ interface
const css = document.createElement('style');
css.textContent = `
.hp-btn { width: 34px; height: 34px; border-radius: 50%; display: inline-grid; place-items: center; border: 1px solid var(--ds-border, #2b3440); background: var(--ds-raised, #151b24); color: var(--text); font: 700 15px Inter, system-ui, sans-serif; cursor: pointer; position: relative; }
.hp-btn:hover { border-color: var(--accent); color: #fff; background: var(--accent); }
.hp-btn::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--accent); opacity: 0; animation: hp-ping 2.6s ease-out 1.5s 3; }
@keyframes hp-ping { 0% { opacity: .8; transform: scale(.8); } 100% { opacity: 0; transform: scale(1.35); } }
.hp-menu { position: fixed; z-index: 9000; width: 380px; max-height: min(640px, calc(100vh - 80px)); overflow: auto; padding: 14px; border-radius: 14px; background: var(--panel); border: 1px solid var(--ds-border-strong, #333e4d); box-shadow: 0 24px 60px rgba(0,0,0,.45); animation: hp-pop .28s cubic-bezier(.16,1,.3,1); }
@keyframes hp-pop { from { opacity: 0; transform: translateY(-8px) scale(.98); } }
.hp-menu h3 { margin: 2px 4px 4px; font-size: 16px; } .hp-menu p.sub { margin: 0 4px 12px; color: var(--muted); font-size: 12.5px; }
.hp-what { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 12px; margin-bottom: 10px; border-radius: 10px; border: 1px dashed var(--accent); background: rgba(var(--accent-rgb), .08); color: var(--text); font: 600 13.5px Inter, system-ui, sans-serif; cursor: pointer; text-align: left; }
.hp-what:hover { background: rgba(var(--accent-rgb), .16); }
.hp-what span { font-size: 18px; } .hp-what small { display: block; font-weight: 400; color: var(--muted); font-size: 12px; }
.hp-search { width: 100%; margin: 0 0 8px; }
.hp-list { display: grid; gap: 4px; }
.hp-item { display: flex; gap: 12px; align-items: center; padding: 9px 10px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--text); cursor: pointer; text-align: left; font: inherit; }
.hp-item:hover { background: var(--ds-hover); border-color: var(--ds-border); }
.hp-item .ic { width: 36px; height: 36px; flex: none; border-radius: 10px; display: grid; place-items: center; font-size: 18px; background: var(--ds-raised); border: 1px solid var(--ds-border); }
.hp-item b { display: block; font-size: 13.5px; } .hp-item small { color: var(--muted); font-size: 12px; }
.hp-item .go { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; }

/* passo a passo */
.hp-tour { position: fixed; inset: 0; z-index: 9500; pointer-events: none; }
.hp-tour[popover] { inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; color: inherit; }
.hp-tour[popover]::backdrop { display: none; }
.hp-card p { white-space: pre-line; }
dialog[open] .st-h, dialog[open] fieldset, dialog[open] label, dialog[open] div { scroll-margin-top: 64px; scroll-margin-bottom: 12px; }
.hp-shade { position: fixed; border-radius: 12px; box-shadow: 0 0 0 9999px rgba(3, 6, 12, .68); transition: all .55s cubic-bezier(.16,1,.3,1); pointer-events: none; }
.hp-ring { position: fixed; border-radius: 12px; border: 2px solid #5fb4ff; box-shadow: 0 0 0 4px rgba(95,180,255,.25), 0 0 30px rgba(95,180,255,.45); transition: all .55s cubic-bezier(.16,1,.3,1); pointer-events: none; }
.hp-ring::after { content: ''; position: absolute; inset: -2px; border-radius: inherit; border: 2px solid #5fb4ff; animation: hp-ring 1.8s ease-out infinite; }
@keyframes hp-ring { 0% { opacity: .9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.12); } }
.hp-cursor { position: fixed; left: 0; top: 0; width: 30px; height: 30px; z-index: 2; transition: transform .9s cubic-bezier(.45,0,.2,1); pointer-events: none; filter: drop-shadow(0 4px 8px rgba(0,0,0,.5)); }
.hp-cursor svg { width: 30px; height: 30px; }
.hp-cursor.tap svg { animation: hp-tap .45s ease; }
@keyframes hp-tap { 40% { transform: scale(.78); } }
.hp-ripple { position: fixed; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 2px solid #fff; pointer-events: none; animation: hp-rip .7s ease-out forwards; }
@keyframes hp-rip { from { opacity: 1; transform: scale(.4); } to { opacity: 0; transform: scale(3.4); } }
.hp-card { position: fixed; width: 340px; padding: 16px 16px 14px; border-radius: 14px; background: #fff; color: #18202b; box-shadow: 0 24px 60px rgba(0,0,0,.45); pointer-events: auto; transition: left .55s cubic-bezier(.16,1,.3,1), top .55s cubic-bezier(.16,1,.3,1), opacity .25s; font-family: Inter, system-ui, sans-serif; }
.hp-card .k { font: 700 11px Inter, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #1f6fbf; }
.hp-card h4 { margin: 4px 0 6px; font-size: 17px; }
.hp-card p { margin: 0; font-size: 14px; line-height: 1.45; color: #3b4656; }
.hp-card .dots { display: flex; gap: 5px; margin: 14px 0 12px; } .hp-card .dots i { height: 5px; flex: 1; border-radius: 3px; background: #dfe5ec; } .hp-card .dots i.on { background: #1f6fbf; }
.hp-card .row { display: flex; gap: 8px; align-items: center; }
.hp-card button { height: 34px; padding: 0 14px; border-radius: 9px; border: 1px solid #d3dae3; background: #fff; color: #18202b; font: 600 13px Inter, sans-serif; cursor: pointer; }
.hp-card button.pri { background: #1f6fbf; border-color: #1f6fbf; color: #fff; margin-left: auto; }
.hp-card button.ghost { border-color: transparent; color: #6b7585; padding: 0 6px; }
.hp-card.miss p::after { content: ' (abra essa parte para ver no lugar)'; color: #9aa4b2; }

/* modo "O que é isto?" */
body.hp-pick, body.hp-pick * { cursor: help !important; }
.hp-hover { position: fixed; z-index: 9400; pointer-events: none; border: 2px dashed #5fb4ff; border-radius: 10px; background: rgba(95,180,255,.08); transition: all .15s ease; }
.hp-tag { position: fixed; z-index: 9401; pointer-events: none; padding: 5px 10px; border-radius: 8px; background: #1f6fbf; color: #fff; font: 600 12px Inter, sans-serif; white-space: nowrap; transition: all .15s ease; }
.hp-pickbar { position: fixed; left: 50%; top: 14px; transform: translateX(-50%); z-index: 9402; padding: 10px 14px 10px 18px; border-radius: 999px; background: #1f6fbf; color: #fff; font: 600 13.5px Inter, sans-serif; display: flex; gap: 12px; align-items: center; box-shadow: 0 12px 30px rgba(0,0,0,.4); animation: hp-pop .3s ease; }
.hp-pickbar button { height: 28px; padding: 0 12px; border-radius: 999px; border: 0; background: rgba(255,255,255,.2); color: #fff; font: 600 12.5px Inter, sans-serif; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .hp-shade, .hp-ring, .hp-cursor, .hp-card { transition: none; } }
`;
document.head.appendChild(css);

const CURSOR = '<svg viewBox="0 0 24 24"><path d="M5 3l14 7.5-6.2 1.6L10 18.5z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
const find = (sel) => [...document.querySelectorAll(sel)].find(visible) || null;
// alvo do passo: seletor ou função que devolve um ou vários elementos (o destaque abraça todos)
function targetOf(step) {
  let els = step.el ? step.el() : step.sel ? find(step.sel) : null;
  els = (Array.isArray(els) ? els : [els]).filter((e) => e && visible(e));
  return els.length ? els : null;
}
// o passo a passo fica por cima até das janelas abertas (fica na "camada do topo", dentro da janela aberta)
function mount(root) {
  const dlgs = [...document.querySelectorAll('dialog[open]')];
  const host = dlgs.at(-1) || document.body;
  if (root.parentNode !== host) host.appendChild(root);
  if (root.showPopover) { try { if (root.matches(':popover-open')) root.hidePopover(); root.showPopover(); } catch {} }
}

// ------------------------------------------------------------------ menu
function openMenu(anchor) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'hp-menu';
  m.innerHTML = `<h3>Como podemos ajudar?</h3><p class="sub">Escolha um assunto e veja o passo a passo animado no próprio painel.</p>
    <button class="hp-what"><span>👆</span><div>O que é isto?<small>Clique em qualquer parte do painel para saber o que ela faz</small></div></button>
    <input class="search hp-search" placeholder="Procurar dúvida (ex.: vídeo, celular, congelar)…">
    <div class="hp-list"></div>`;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = r.bottom + 8 + 'px';
  m.style.left = Math.max(8, Math.min(innerWidth - 390, r.right - 380)) + 'px';
  const list = m.querySelector('.hp-list');
  const draw = (q = '') => {
    const n = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    list.innerHTML = TOURS.filter((t) => !n || norm(t.title + ' ' + t.desc + ' ' + t.steps.map((s) => s.t + ' ' + s.d).join(' ')).includes(n))
      .map((t) => `<button class="hp-item" data-t="${t.id}"><span class="ic">${t.icon}</span><div><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></div><span class="go">${t.steps.length} passos ▸</span></button>`).join('') || '<div class="empty">Nada encontrado</div>';
  };
  draw();
  m.querySelector('.hp-search').oninput = (e) => draw(e.target.value);
  m.querySelector('.hp-what').onclick = () => { closeMenu(); startPick(); };
  list.onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { closeMenu(); runTour(TOURS.find((t) => t.id === b.dataset.t)); } };
  const outside = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
  m._outside = outside;
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  m.querySelector('.hp-search').focus();
}
function closeMenu() { document.querySelectorAll('.hp-menu').forEach((x) => { if (x._outside) document.removeEventListener('pointerdown', x._outside, true); x.remove(); }); }

// ------------------------------------------------------------------ passo a passo
let tourState = null;
async function runTour(tour) {
  endTour();
  tour.do?.();
  await sleep(250);
  const root = document.createElement('div');
  root.className = 'hp-tour';
  root.setAttribute('popover', 'manual');
  root.innerHTML = `<div class="hp-shade"></div><div class="hp-ring"></div><div class="hp-cursor">${CURSOR}</div><div class="hp-card"></div>`;
  mount(root);
  const st = (tourState = { tour, i: 0, root, cx: innerWidth / 2, cy: innerHeight - 60 });
  const cursor = root.querySelector('.hp-cursor');
  cursor.style.transform = `translate(${st.cx}px, ${st.cy}px)`;
  const keys = (e) => {
    if (!tourState) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); endTour(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(st.i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(st.i - 1); }
  };
  addEventListener('keydown', keys, true);
  st.keys = keys;
  const onResize = () => place(st.i, true);
  addEventListener('resize', onResize);
  st.onResize = onResize;
  // janelas que abrem depois (ex.: Configurações carrega antes de abrir): sobe o passo a passo para cima delas
  st.watch = setInterval(() => {
    const host = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
    if (root.parentNode !== host) { mount(root); place(st.i, true); }
  }, 200);
  go(0);

  async function go(i) {
    if (i < 0) return;
    if (i >= tour.steps.length) { if (!tour.cleanup) tour.after?.(); return endTour(); }
    const prev = tour.steps[st.i];
    if (i > st.i) prev?.after?.();
    st.i = i;
    const step = tour.steps[i];
    step.do?.();
    await sleep(step.do ? 300 : 40);
    if (tourState !== st) return;
    place(i, false);
  }
  function place(i, quick) {
    const step = tour.steps[i];
    const els = targetOf(step);
    if (!quick) mount(root);
    const el = els?.[0] || null;
    const card = root.querySelector('.hp-card');
    const shade = root.querySelector('.hp-shade');
    const ring = root.querySelector('.hp-ring');
    let r;
    if (el) {
      if (!quick) el.scrollIntoView({ block: els.length > 1 ? 'start' : 'nearest', inline: 'nearest' });
      const rs = els.map((e) => e.getBoundingClientRect());
      const b = { left: Math.min(...rs.map((x) => x.left)), top: Math.min(...rs.map((x) => x.top)), right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) };
      // dentro de uma janela: não passa da área visível dela (nem por baixo do cabeçalho fixo)
      const dlg = el.closest('dialog');
      if (dlg) {
        const d = dlg.getBoundingClientRect();
        const hd = dlg.querySelector('.modal-h');
        const top = hd && !els.some((e) => hd.contains(e)) ? hd.getBoundingClientRect().bottom : d.top;
        b.top = Math.max(b.top, top + 2); b.bottom = Math.min(b.bottom, d.bottom - 2);
        b.left = Math.max(b.left, d.left + 2); b.right = Math.min(b.right, d.right - 2);
      }
      b.width = b.right - b.left; b.height = Math.max(8, b.bottom - b.top);
      const pad = 6;
      r = { x: Math.max(4, b.left - pad), y: Math.max(4, b.top - pad), w: Math.min(innerWidth - 8, b.width + pad * 2), h: Math.min(innerHeight - 8, b.height + pad * 2) };
    } else r = { x: innerWidth / 2 - 1, y: innerHeight / 2 - 1, w: 2, h: 2 };
    for (const x of [shade, ring]) Object.assign(x.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', opacity: el ? 1 : 0 });
    shade.style.opacity = 1;
    card.classList.toggle('miss', !el && !!(step.sel || step.el));
    card.innerHTML = `<div class="k">${esc(tour.title)} · passo ${i + 1} de ${tour.steps.length}</div><h4>${esc(step.t)}</h4><p>${esc(step.d)}</p>
      <div class="dots">${tour.steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="row"><button class="ghost" data-a="x">Sair</button>${i ? '<button data-a="p">Voltar</button>' : ''}<button class="pri" data-a="n">${i === tour.steps.length - 1 ? 'Concluir ✓' : 'Próximo →'}</button></div>`;
    card.onclick = (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'n') go(i + 1); if (a === 'p') go(i - 1); if (a === 'x') endTour(); };
    // cartão ao lado do destaque, sem sair da tela
    const cw = 340;
    const ch = card.offsetHeight || 190;
    let cx = r.x + r.w + 18;
    let cy = r.y;
    if (cx + cw > innerWidth - 10) cx = r.x - cw - 18;
    if (cx < 10) { cx = Math.min(Math.max(10, r.x + r.w / 2 - cw / 2), innerWidth - cw - 10); cy = r.y + r.h + 16; if (cy + ch > innerHeight - 10) cy = r.y - ch - 16; }
    cy = Math.max(10, Math.min(cy, innerHeight - ch - 10));
    if (!el) { cx = innerWidth / 2 - cw / 2; cy = innerHeight / 2 - ch / 2; }
    card.style.left = cx + 'px';
    card.style.top = cy + 'px';
    // cursor vai até o alvo e "clica"
    const tx = el ? r.x + Math.min(r.w * 0.5, r.w - 14) : st.cx;
    const ty = el ? r.y + Math.min(r.h * 0.55, r.h - 10) : st.cy;
    cursor.style.opacity = el ? 1 : 0;
    cursor.style.transitionDuration = quick ? '0s' : '.9s';
    cursor.style.transform = `translate(${tx}px, ${ty}px)`;
    st.cx = tx;
    st.cy = ty;
    if (el && step.click && !quick) setTimeout(() => {
      if (tourState !== st || st.i !== i) return;
      cursor.classList.remove('tap'); void cursor.offsetWidth; cursor.classList.add('tap');
      const rp = document.createElement('div'); rp.className = 'hp-ripple'; rp.style.left = tx + 4 + 'px'; rp.style.top = ty + 4 + 'px'; root.appendChild(rp); setTimeout(() => rp.remove(), 800);
    }, 950);
  }
}
function endTour() {
  if (!tourState) return;
  if (tourState.tour.cleanup) try { tourState.tour.after?.(); } catch {}
  removeEventListener('keydown', tourState.keys, true);
  removeEventListener('resize', tourState.onResize);
  clearInterval(tourState.watch);
  try { tourState.root.hidePopover?.(); } catch {}
  tourState.root.remove();
  tourState = null;
}

// ------------------------------------------------------------------ "O que é isto?"
let pick = null;
function startPick() {
  stopPick();
  document.body.classList.add('hp-pick');
  const hover = document.createElement('div'); hover.className = 'hp-hover';
  const tag = document.createElement('div'); tag.className = 'hp-tag';
  const bar = document.createElement('div'); bar.className = 'hp-pickbar';
  bar.innerHTML = '👆 Clique em qualquer parte do painel para saber o que ela faz <button>Sair (Esc)</button>';
  document.body.append(hover, tag, bar);
  const match = (t) => { for (const [sel, name, d] of WHAT) { const el = t.closest?.(sel); if (el) return { el, name, d }; } return null; };
  const move = (e) => {
    if (bar.contains(e.target)) return;
    const m = match(e.target);
    hover.style.opacity = tag.style.opacity = m ? 1 : 0;
    if (!m) return;
    const b = m.el.getBoundingClientRect();
    Object.assign(hover.style, { left: b.left - 4 + 'px', top: b.top - 4 + 'px', width: b.width + 8 + 'px', height: b.height + 8 + 'px' });
    tag.textContent = m.name;
    tag.style.left = Math.min(innerWidth - 220, Math.max(6, b.left)) + 'px';
    tag.style.top = (b.top > 40 ? b.top - 34 : b.bottom + 8) + 'px';
  };
  const click = (e) => {
    if (bar.contains(e.target)) { stopPick(); return; }
    e.preventDefault(); e.stopPropagation();
    const m = match(e.target);
    if (!m) return;
    stopPick();
    // vira um "passo a passo" de um passo só, apontando para o que foi clicado (e os relacionados)
    const rel = TOURS.find((t) => t.steps.some((s) => m.el.matches?.(s.sel) || m.el.querySelector?.(s.sel)));
    const id = 'what-' + Date.now();
    m.el.dataset.hpWhat = id;
    runTour({ title: 'O que é isto?', steps: [{ sel: `[data-hp-what="${id}"]`, t: m.name, d: m.d + (rel ? ` · Quer ver o passo a passo de “${rel.title}”? Abra o ? de novo.` : '') }] });
  };
  const keys = (e) => { if (e.key === 'Escape') { e.preventDefault(); stopPick(); } };
  addEventListener('pointermove', move, true);
  addEventListener('click', click, true);
  addEventListener('keydown', keys, true);
  pick = { hover, tag, bar, move, click, keys };
}
function stopPick() {
  if (!pick) return;
  document.body.classList.remove('hp-pick');
  removeEventListener('pointermove', pick.move, true);
  removeEventListener('click', pick.click, true);
  removeEventListener('keydown', pick.keys, true);
  pick.hover.remove(); pick.tag.remove(); pick.bar.remove();
  pick = null;
}

// ------------------------------------------------------------------ botão "?"
export function initHelp() {
  const btn = document.createElement('button');
  btn.className = 'hp-btn';
  btn.id = 'helpBtn';
  btn.title = 'Ajuda: passo a passo animado (F1)';
  btn.textContent = '?';
  const settings = document.getElementById('settingsBtn');
  settings?.parentNode.insertBefore(btn, settings);
  btn.onclick = () => (document.querySelector('.hp-menu') ? closeMenu() : openMenu(btn));
  addEventListener('keydown', (e) => { if (e.key === 'F1') { e.preventDefault(); openMenu(btn); } });
  // na primeira vez, sugere o tour de primeiros passos
  try {
    if (!localStorage.getItem('helpSeen')) {
      localStorage.setItem('helpSeen', '1');
      setTimeout(() => { if (!document.querySelector('.intro, dialog[open]')) openMenu(btn); }, 1500);
    }
  } catch {}
}
export const HELP = { TOURS, runTour, startPick };
