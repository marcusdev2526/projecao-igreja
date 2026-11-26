// Segurança do acesso pela rede (Wi-Fi da igreja).
//
// Quem pode o quê:
//   • Este computador (localhost)  → tudo, sem senha.
//   • Celular/notebook na rede     → precisa do PIN uma vez (fica lembrado no aparelho).
//   • Pregador / ministro (QR)     → só envia arquivos ou pede louvores no culto do QR (chave no link).
//   • Telão/retorno em outra máquina sem PIN → só assistem (não comandam nada).
// Além disso: bloqueia sites maliciosos que tentem comandar o sistema pelo navegador
// (checagem de Host e Origin) e limita tentativas de PIN.
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import dns from 'node:dns/promises';

const COOKIE = 'pj_sess';
const SESSION_DAYS = 180;

export function isLoopback(ip = '') {
  ip = String(ip).replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
}

// IPs que não podem ser acessados pelo "baixar por link" (rede interna, roteador, etc.)
export function isPrivateIp(ip) {
  ip = String(ip).replace(/^::ffff:/, '').toLowerCase();
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) return ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb') || ip.startsWith('ff');
  return true;
}

// fetch para links colados pelo usuário: só internet pública, segue no máx. 5 redirecionamentos conferindo cada um
export async function safeFetch(url, opts = {}, hops = 5) {
  for (let i = 0; i <= hops; i++) {
    let u;
    try { u = new URL(url); } catch { throw new Error('Link inválido'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('Link inválido');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new Error('Endereço não encontrado: ' + host); });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Esse link não pode ser baixado (endereço da rede interna)');
    const r = await fetch(url, { ...opts, redirect: 'manual' });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      url = new URL(r.headers.get('location'), url).toString();
      continue;
    }
    return r;
  }
  throw new Error('Redirecionamentos demais');
}

const parseCookies = (h = '') => Object.fromEntries(String(h).split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const eq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function makeSecurity(repo) {
  const get = (k, d) => repo.getSetting(k, d);
  const set = (k, v) => repo.setSetting(k, v);
  const json = (k, d) => { try { return JSON.parse(get(k, '')) ?? d; } catch { return d; } };
  const secret = (k) => { let s = get(k, ''); if (!s) { s = crypto.randomBytes(24).toString('base64url'); set(k, s); } return s; };

  // ---------- PIN ----------
  const hasPin = () => !!get('pin_hash', '');
  function setPin(pin) {
    pin = String(pin || '').trim();
    if (!/^\d{4,8}$/.test(pin)) throw new Error('O PIN precisa ter de 4 a 8 números');
    if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) throw new Error('PIN fácil demais (evite 1111, 1234…)');
    const salt = crypto.randomBytes(16).toString('hex');
    set('pin_hash', salt + ':' + crypto.scryptSync(pin, salt, 32).toString('hex'));
    revokeAll(); // trocou o PIN: todos os aparelhos precisam entrar de novo
  }
  function checkPin(pin) {
    const [salt, h] = get('pin_hash', '').split(':');
    if (!salt) return false;
    return eq(crypto.scryptSync(String(pin || ''), salt, 32).toString('hex'), h);
  }
  function removePin() { set('pin_hash', ''); revokeAll(); }

  // ---------- Tentativas (contra adivinhar o PIN) ----------
  const tries = new Map(); // ip -> { n, until }
  let global = { n: 0, since: Date.now(), until: 0 };
  function blocked(ip) {
    const t = tries.get(ip);
    const now = Date.now();
    if (global.until > now) return Math.ceil((global.until - now) / 1000);
    if (t?.until > now) return Math.ceil((t.until - now) / 1000);
    return 0;
  }
  function fail(ip) {
    const now = Date.now();
    const t = tries.get(ip) || { n: 0, until: 0 };
    t.n++;
    if (t.n >= 5) { t.until = now + 5 * 60e3 * Math.min(6, t.n - 4); }
    tries.set(ip, t);
    if (now - global.since > 10 * 60e3) global = { n: 0, since: now, until: 0 };
    if (++global.n >= 30) global.until = now + 10 * 60e3;
  }
  const success = (ip) => tries.delete(ip);

  // ---------- Sessões (aparelhos que já digitaram o PIN) ----------
  const sessions = () => json('sessions', {});
  function createSession(ua = '') {
    const token = crypto.randomBytes(32).toString('base64url');
    const all = sessions();
    const now = Date.now();
    for (const [k, v] of Object.entries(all)) if (now - v.at > SESSION_DAYS * 864e5) delete all[k];
    all[sha(token)] = { at: now, ua: String(ua).slice(0, 120) };
    set('sessions', JSON.stringify(all));
    return token;
  }
  function validSession(token) {
    if (!token) return false;
    const s = sessions()[sha(token)];
    return !!s && Date.now() - s.at < SESSION_DAYS * 864e5;
  }
  function endSession(token) { const all = sessions(); delete all[sha(token)]; set('sessions', JSON.stringify(all)); }
  function revokeAll() { set('sessions', '{}'); }
  const sessionCount = () => Object.keys(sessions()).length;
  const cookieHeader = (token, secure = false) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
  const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

  // ---------- Links do pregador / pedidos (valem só para o culto do QR) ----------
  const inviteKey = (sid) => crypto.createHmac('sha256', secret('invite_secret')).update('s:' + +sid).digest('base64url').slice(0, 18);
  const checkInvite = (sid, k) => !!sid && !!k && eq(inviteKey(sid), k);
  const rotateInvites = () => set('invite_secret', crypto.randomBytes(24).toString('base64url'));

  // ---------- Chave do Stream Deck / controle por link ----------
  const controlKey = () => secret('control_key');
  const rotateControl = () => set('control_key', crypto.randomBytes(18).toString('base64url'));

  // ---------- Quem está pedindo? ----------
  function level(req) {
    if (isLoopback(req.socket?.remoteAddress)) return 'local';
    if (validSession(parseCookies(req.headers.cookie)[COOKIE])) return 'admin';
    return null;
  }

  // Host precisa ser localhost, um IP ou o nome deste computador (bloqueia "DNS rebinding")
  const myNames = new Set(['localhost', os.hostname().toLowerCase(), os.hostname().toLowerCase() + '.local']);
  function hostOk(host = '') {
    const h = String(host).toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    return !h || net.isIP(h) > 0 || myNames.has(h) || h.endsWith('.localhost');
  }
  // Pedidos que mudam algo precisam vir de páginas do próprio sistema (bloqueia sites maliciosos / CSRF)
  function originOk(req) {
    const o = req.headers.origin;
    if (o && o !== 'null') {
      try { return new URL(o).host === req.headers.host; } catch { return false; }
    }
    if (o === 'null') return false;
    return req.headers['sec-fetch-site'] !== 'cross-site';
  }

  return {
    COOKIE, parseCookies, hasPin, setPin, checkPin, removePin, blocked, fail, success,
    createSession, validSession, endSession, revokeAll, sessionCount, cookieHeader, clearCookie,
    inviteKey, checkInvite, rotateInvites, controlKey, rotateControl, level, hostOk, originOk,
  };
}
