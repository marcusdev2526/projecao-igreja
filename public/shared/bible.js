// Livros da Bíblia (ordem protestante, 66 livros) e leitura de referências como "jo 3 16", "1co 13:4-7", "Salmos 23".
// Abreviação exibida na grade de livros
const SHORT = 'Gn Ex Lv Nm Dt Js Jz Rt 1Sm 2Sm 1Rs 2Rs 1Cr 2Cr Ed Ne Et Jó Sl Pv Ec Ct Is Jr Lm Ez Dn Os Jl Am Ob Jn Mq Na Hc Sf Ag Zc Ml Mt Mc Lc Jo At Rm 1Co 2Co Gl Ef Fp Cl 1Ts 2Ts 1Tm 2Tm Tt Fm Hb Tg 1Pe 2Pe 1Jo 2Jo 3Jo Jd Ap'.split(' ');

// Grupos dos livros (cores da grade)
export const GROUPS = {
  lei: 'Lei', hist: 'Históricos', poet: 'Poéticos', pmaior: 'Profetas maiores', pmenor: 'Profetas menores',
  evang: 'Evangelhos', atos: 'Atos', paulo: 'Cartas de Paulo', gerais: 'Cartas gerais', apoc: 'Apocalipse',
};
function groupOf(n) {
  if (n <= 5) return 'lei';
  if (n <= 17) return 'hist';
  if (n <= 22) return 'poet';
  if (n <= 27) return 'pmaior';
  if (n <= 39) return 'pmenor';
  if (n <= 43) return 'evang';
  if (n === 44) return 'atos';
  if (n <= 57) return 'paulo';
  if (n <= 65) return 'gerais';
  return 'apoc';
}

export const BOOKS = [
  ['Gênesis', 'Genesis', 'gn gen'], ['Êxodo', 'Exodus', 'ex exo'], ['Levítico', 'Leviticus', 'lv lev'],
  ['Números', 'Numbers', 'nm num'], ['Deuteronômio', 'Deuteronomy', 'dt deut'], ['Josué', 'Joshua', 'js jos josh'],
  ['Juízes', 'Judges', 'jz jui judg'], ['Rute', 'Ruth', 'rt rute'], ['1 Samuel', '1 Samuel', '1sm 1sam 1s'],
  ['2 Samuel', '2 Samuel', '2sm 2sam 2s'], ['1 Reis', '1 Kings', '1rs 1re 1kgs'], ['2 Reis', '2 Kings', '2rs 2re 2kgs'],
  ['1 Crônicas', '1 Chronicles', '1cr 1cro 1chr'], ['2 Crônicas', '2 Chronicles', '2cr 2cro 2chr'], ['Esdras', 'Ezra', 'ed esd ezr'],
  ['Neemias', 'Nehemiah', 'ne nee neh'], ['Ester', 'Esther', 'et est esth'], ['Jó', 'Job', 'job'],
  ['Salmos', 'Psalms', 'sl sal salmo ps psa'], ['Provérbios', 'Proverbs', 'pv pr prov'], ['Eclesiastes', 'Ecclesiastes', 'ec ecl eccl'],
  ['Cânticos', 'Song of Solomon', 'ct can cantares sng song'], ['Isaías', 'Isaiah', 'is isa'], ['Jeremias', 'Jeremiah', 'jr jer'],
  ['Lamentações', 'Lamentations', 'lm lam'], ['Ezequiel', 'Ezekiel', 'ez eze ezk'], ['Daniel', 'Daniel', 'dn dan'],
  ['Oséias', 'Hosea', 'os ose hos'], ['Joel', 'Joel', 'jl joel'], ['Amós', 'Amos', 'am amo'],
  ['Obadias', 'Obadiah', 'ob oba obd'], ['Jonas', 'Jonah', 'jn jon'], ['Miquéias', 'Micah', 'mq miq mic'],
  ['Naum', 'Nahum', 'na nau nam'], ['Habacuque', 'Habakkuk', 'hc hab'], ['Sofonias', 'Zephaniah', 'sf sof zep'],
  ['Ageu', 'Haggai', 'ag age hag'], ['Zacarias', 'Zechariah', 'zc zac zec'], ['Malaquias', 'Malachi', 'ml mal'],
  ['Mateus', 'Matthew', 'mt mat matt'], ['Marcos', 'Mark', 'mc mar mrk'], ['Lucas', 'Luke', 'lc luc luk'],
  ['João', 'John', 'jo joa jhn joao'], ['Atos', 'Acts', 'at ato act'], ['Romanos', 'Romans', 'rm rom'],
  ['1 Coríntios', '1 Corinthians', '1co 1cor'], ['2 Coríntios', '2 Corinthians', '2co 2cor'], ['Gálatas', 'Galatians', 'gl gal'],
  ['Efésios', 'Ephesians', 'ef efe eph'], ['Filipenses', 'Philippians', 'fp fil php phil'], ['Colossenses', 'Colossians', 'cl col'],
  ['1 Tessalonicenses', '1 Thessalonians', '1ts 1tes 1th'], ['2 Tessalonicenses', '2 Thessalonians', '2ts 2tes 2th'],
  ['1 Timóteo', '1 Timothy', '1tm 1tim 1ti'], ['2 Timóteo', '2 Timothy', '2tm 2tim 2ti'], ['Tito', 'Titus', 'tt tit'],
  ['Filemom', 'Philemon', 'fm flm phm'], ['Hebreus', 'Hebrews', 'hb heb'], ['Tiago', 'James', 'tg tia jas jms'],
  ['1 Pedro', '1 Peter', '1pe 1ped 1pt'], ['2 Pedro', '2 Peter', '2pe 2ped 2pt'], ['1 João', '1 John', '1jo 1joa 1jn'],
  ['2 João', '2 John', '2jo 2joa 2jn'], ['3 João', '3 John', '3jo 3joa 3jn'], ['Judas', 'Jude', 'jd jud'],
  ['Apocalipse', 'Revelation', 'ap apo apoc rev re'],
].map(([pt, en, ab], i) => ({ n: i + 1, pt, en, abbr: ab.split(' '), short: SHORT[i], group: groupOf(i + 1) }));

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// "Jó" sem acento vira "jo", que no Brasil é a abreviação de João: Jó só com acento ou "job"
const KEYS = BOOKS.map((b) => ({ b, keys: [b.pt === 'Jó' ? 'job' : norm(b.pt), norm(b.en), ...b.abbr.map(norm)] }));

// Acha o livro pelo nome, abreviação ou início do nome ("joao", "jo", "1 cor", "apoc")
export function findBook(text) {
  if (/^\s*j[óò]\s*$/i.test(text)) return BOOKS[17];
  const t = norm(text);
  if (!t) return null;
  const exact = KEYS.find((k) => k.keys.includes(t));
  if (exact) return exact.b;
  const pre = KEYS.find((k) => k.keys.slice(0, 2).some((x) => x.startsWith(t)));
  return pre ? pre.b : null;
}

// "jo 3 16" | "João 3:16-18" | "1co 13" | "sl 23.1" → { book, chapter, verse, verseEnd } ou null
export function parseRef(input) {
  const s = String(input || '').trim().replace(/\s+/g, ' ');
  const m = s.match(/^([1-3]?\s*[^\d:.,]+?)\s*(\d+)?(?:\s*[:., ]\s*(\d+))?(?:\s*-\s*(\d+))?$/);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  return { book: book.n, chapter: m[2] ? +m[2] : 1, verse: m[3] ? +m[3] : null, verseEnd: m[4] ? +m[4] : null };
}

export const bookName = (n, lang = 'pt') => (BOOKS[n - 1] ? BOOKS[n - 1][lang === 'en' ? 'en' : 'pt'] : '?');
export const refText = (book, chapter, verse, lang = 'pt') => `${bookName(book, lang)} ${chapter}${verse ? ':' + verse : ''}`;
