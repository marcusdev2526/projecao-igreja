// Recursos com IA (opcionais): tradução sugerida e palavra-chave.
// Usa a API da Anthropic (Claude) com a chave que a igreja cadastra em Configurações.
// Sem chave ou sem internet, a palavra-chave usa a sugestão automática local.
import { sameWords } from '../public/shared/enhance.js';

export const DEFAULT_MODEL = 'claude-haiku-5-5';

export async function askClaude({ apiKey, model = DEFAULT_MODEL, system, prompt, maxTokens = 4000, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('Cadastre a chave da IA em Configurações');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || r.statusText;
      if (r.status === 401) throw new Error('Chave da IA inválida. Confira em Configurações.');
      throw new Error('IA: ' + msg);
    }
    return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A IA demorou demais para responder. Tente de novo.');
    if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(e.message)) throw new Error('Sem internet para usar a IA');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Pega o primeiro array JSON da resposta
function jsonArray(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('Resposta da IA em formato inesperado');
  return JSON.parse(m[0]);
}

// Traduz linhas de louvor, mantendo a mesma quantidade de linhas
export async function translateLines(lines, { apiKey, model, fetchImpl, title = '', target = 'inglês' }) {
  if (!lines.length) return [];
  const system = `Você traduz letras de louvores cristãos para projeção bilíngue no culto. Traduza para ${target}, linha por linha, de forma natural e cantável, fiel ao sentido bíblico. Responda SOMENTE com um array JSON de strings, com exatamente uma tradução para cada linha recebida, na mesma ordem. Não inclua as marcações *, _, ^ ou ~.`;
  const out = [];
  for (let i = 0; i < lines.length; i += 80) {
    const part = lines.slice(i, i + 80).map((l) => l.replace(/[*_^~]/g, ''));
    const prompt = `Louvor: ${title || 'sem título'}\nLinhas (${part.length}):\n${JSON.stringify(part, null, 0)}`;
    const arr = jsonArray(await askClaude({ apiKey, model, fetchImpl, system, prompt }));
    if (!Array.isArray(arr) || arr.length !== part.length) throw new Error('A IA devolveu uma quantidade diferente de linhas. Tente de novo.');
    out.push(...arr.map((s) => String(s ?? '').trim()));
  }
  return out;
}

// Sugere a palavra-chave de cada slide; só aceita respostas que mantêm as mesmas palavras
export async function keywordChunks(chunks, { apiKey, model, fetchImpl, title = '' }) {
  const system = `Você estiliza letras de louvor para o telão no estilo "lyric video": em cada slide escolha UMA palavra-chave forte (a palavra emocional ou teológica central) e marque:
*PALAVRA* = palavra-chave gigante; _texto_ = trecho curto em itálico serifado colado antes da palavra-chave (até 3 palavras); ^texto^ = trecho pequeno acima; ~texto~ = trecho pequeno abaixo.
Regras: não mude, não acrescente e não remova nenhuma palavra; só adicione as marcações. Linhas inteiras que não têm a palavra-chave viram ^linha^ (antes) ou ~linha~ (depois).
Responda SOMENTE com um array JSON: um item por slide, cada item é um array com as linhas marcadas, mesma quantidade de linhas do slide.
Exemplo: [["Sem você","não sei pra onde ir"]] → [["^sem^ *VOCÊ*","~não sei pra onde ir~"]]`;
  const prompt = `Louvor: ${title || 'sem título'}\nSlides:\n${JSON.stringify(chunks)}`;
  const arr = jsonArray(await askClaude({ apiKey, model, fetchImpl, system, prompt, maxTokens: 6000 }));
  return chunks.map((ch, k) => {
    const m = arr[k];
    if (!Array.isArray(m) || m.length !== ch.length) return null;
    return m.every((line, j) => typeof line === 'string' && sameWords(line, ch[j])) ? m : null;
  });
}

// Encaixa a letra OFICIAL em inglês nas linhas em português (versões: "A Bênção" ↔ "The Blessing").
// Não traduz: escolhe, para cada linha em PT, o trecho correspondente da letra oficial.
export async function alignOfficial(ptLines, englishText, { apiKey, model, fetchImpl, title = '' }) {
  if (!ptLines.length) return [];
  const system = `Você monta projeção bilíngue de louvores. Recebe as linhas da versão em português (em ordem) e a letra OFICIAL em inglês da mesma música.
Para cada linha em português, devolva o trecho da letra oficial em inglês que é cantado no mesmo lugar da música (mesma parte e mesma posição).
Use SOMENTE frases da letra oficial, copiadas como estão; não traduza nem invente. Se uma linha em português não tiver correspondente, devolva "".
Linhas em português repetidas (refrão) recebem o mesmo trecho em inglês. Uma linha em inglês pode ser dividida entre duas linhas em português, se a versão em português dividir assim.
Responda SOMENTE com um array JSON de strings, exatamente uma por linha em português, na mesma ordem.`;
  const out = [];
  for (let i = 0; i < ptLines.length; i += 80) {
    const part = ptLines.slice(i, i + 80).map((l) => l.replace(/[*_^~]/g, ''));
    const prompt = `Louvor: ${title || 'sem título'}\n\nLETRA OFICIAL EM INGLÊS:\n${englishText.slice(0, 12000)}\n\nLINHAS EM PORTUGUÊS (${part.length}):\n${JSON.stringify(part)}`;
    const arr = jsonArray(await askClaude({ apiKey, model, fetchImpl, system, prompt, maxTokens: 6000 }));
    if (!Array.isArray(arr) || arr.length !== part.length) throw new Error('A IA devolveu uma quantidade diferente de linhas. Tente de novo.');
    out.push(...arr.map((s) => String(s ?? '').trim()));
  }
  return out;
}
