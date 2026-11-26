// Atualização automática a partir do GitHub.
// 1) compara o último commit do repositório com a versão instalada (data/version.json)
// 2) baixa o zip do GitHub, copia por cima dos arquivos do sistema
//    (sem tocar em data/, node_modules/ e .git/), roda "npm install" se as dependências mudaram
// 3) sai com o código 42: o inicializador (launcher.js) reabre o sistema já atualizado
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import AdmZip from 'adm-zip';

export const RESTART_CODE = 42;
const SKIP = /^(data|node_modules|\.git)(\/|$)/;

export function makeUpdater({ root, dataDir, getRepo, getToken, fetchImpl = (...a) => fetch(...a) }) {
  const versionFile = path.join(dataDir, 'version.json');
  const installed = () => {
    try { return JSON.parse(fs.readFileSync(versionFile, 'utf8')); } catch { return {}; }
  };
  const headers = () => {
    const h = { 'user-agent': 'projecao-igreja-updater', accept: 'application/vnd.github+json' };
    const t = getToken();
    if (t) h.authorization = 'Bearer ' + t;
    return h;
  };
  const repoParts = () => {
    const r = String(getRepo() || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw new Error('Repositório inválido. Use o formato usuario/repositorio');
    return r;
  };
  const gh = async (url) => {
    let r;
    try {
      r = await fetchImpl(url, { headers: headers() });
    } catch {
      throw new Error('Sem internet para procurar atualização');
    }
    if (r.status === 404) throw new Error('Repositório não encontrado (se for privado, cadastre o token)');
    if ((r.status === 403 || r.status === 429) && r.headers?.get?.('x-ratelimit-remaining') === '0') {
      const reset = new Date(+r.headers.get('x-ratelimit-reset') * 1000);
      throw new Error(`O GitHub limita as consultas sem login (60 por hora). Tente de novo às ${reset.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`);
    }
    if (r.status === 401 || r.status === 403) throw new Error('O GitHub recusou o acesso (token inválido ou limite de consultas; tente mais tarde)');
    if (!r.ok) throw new Error('GitHub respondeu com erro ' + r.status);
    return r;
  };

  async function check() {
    const repo = repoParts();
    const branch = 'main';
    // Sem token (repositório público): usa o feed de commits do site do GitHub, que não tem o limite de 60 consultas/hora da API
    const c = getToken() ? await (await gh(`https://api.github.com/repos/${repo}/commits/HEAD`)).json() : await latestFromFeed(repo);
    const cur = installed();
    const tests = await testStatus(repo, c.sha);
    return {
      tests,
      repo,
      branch,
      latest: { sha: c.sha, short: c.sha?.slice(0, 7), message: c.commit?.message?.split('\n')[0] || '', date: c.commit?.committer?.date || '' },
      installed: cur.sha ? { sha: cur.sha, short: cur.sha.slice(0, 7), date: cur.date } : null,
      // só oferece a versão nova depois que os testes automáticos do GitHub passarem
      available: (!cur.sha || cur.sha !== c.sha) && tests !== 'falhou' && tests !== 'rodando',
    };
  }

  async function latestFromFeed(repo) {
    let r;
    try { r = await fetchImpl(`https://github.com/${repo}/commits/main.atom`, { headers: { 'user-agent': 'projecao-igreja-updater' } }); } catch { throw new Error('Sem internet para procurar atualização'); }
    if (r.status === 404) throw new Error('Repositório não encontrado (se for privado, cadastre o token)');
    if (!r.ok) throw new Error('GitHub respondeu com erro ' + r.status);
    const xml = await r.text();
    const entry = xml.split('<entry>')[1] || '';
    const sha = (entry.match(/Commit\/([0-9a-f]{40})/) || [])[1];
    if (!sha) throw new Error('Não consegui ler a versão no GitHub');
    const title = (entry.match(/<title>\s*([\s\S]*?)\s*<\/title>/) || [])[1] || '';
    const date = (entry.match(/<updated>([^<]+)<\/updated>/) || [])[1] || '';
    const dec = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    return { sha, commit: { message: dec(title), committer: { date } } };
  }

  // Resultado dos testes automáticos (GitHub Actions) daquela versão: 'ok' | 'falhou' | 'rodando' | 'sem-testes'
  async function testStatus(repo, sha) {
    let runs;
    try {
      const r = await fetchImpl(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs`, { headers: headers() });
      if (!r.ok) return 'sem-testes'; // limite de consultas etc.: não bloqueia a atualização
      runs = (await r.json()).check_runs || [];
    } catch {
      return 'sem-testes';
    }
    if (!runs.length) return 'sem-testes';
    if (runs.some((x) => x.status !== 'completed')) return 'rodando';
    if (runs.some((x) => !['success', 'skipped', 'neutral'].includes(x.conclusion))) return 'falhou';
    return 'ok';
  }

  async function apply() {
    const st = await check();
    const { repo, latest } = st;
    if (st.tests === 'falhou') throw new Error('A versão nova não passou nos testes automáticos. Aguarde a correção.');
    if (st.tests === 'rodando') throw new Error('A versão nova ainda está sendo testada. Tente de novo em alguns minutos.');
    // baixa exatamente a versão que foi testada (não a que chegou depois)
    // sem token: baixa pelo codeload (não usa a cota da API)
    const r = getToken() ? await gh(`https://api.github.com/repos/${repo}/zipball/${latest.sha}`) : await gh(`https://codeload.github.com/${repo}/zip/${latest.sha}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const zip = new AdmZip(buf);
    const pkgBefore = readJson(path.join(root, 'package.json'));
    let files = 0;
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      // tira a primeira pasta do zip ("usuario-repo-abc123/")
      const rel = e.entryName.split('/').slice(1).join('/');
      if (!rel || SKIP.test(rel) || rel.includes('..') || path.isAbsolute(rel)) continue;
      const dest = path.join(root, rel);
      if (!dest.startsWith(root + path.sep)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, e.getData());
      files++;
    }
    if (!files) throw new Error('O pacote baixado veio vazio');
    const pkgAfter = readJson(path.join(root, 'package.json'));
    const depsChanged = JSON.stringify(pkgBefore?.dependencies || {}) !== JSON.stringify(pkgAfter?.dependencies || {});
    if (depsChanged) {
      execSync('npm install --omit=dev --no-audit --no-fund', { cwd: root, stdio: 'inherit', shell: true });
    }
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(versionFile, JSON.stringify({ sha: latest.sha, date: latest.date, message: latest.message, updatedAt: new Date().toISOString() }, null, 2));
    return { files, depsChanged, latest };
  }

  return { check, apply, installed };
}

function readJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}
