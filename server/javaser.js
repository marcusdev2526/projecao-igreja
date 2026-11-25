// Leitor mínimo do formato de serialização Java (java.io.ObjectOutputStream).
// O Holyrics é feito em Java e o arquivo .mufl de exportação é uma lista
// de objetos com.limagiran.holyrics.model.Music serializada nesse formato.
// Este leitor só LÊ dados: não executa nada do arquivo.

const TC = {
  NULL: 0x70, REFERENCE: 0x71, CLASSDESC: 0x72, OBJECT: 0x73, STRING: 0x74, ARRAY: 0x75, CLASS: 0x76,
  BLOCKDATA: 0x77, ENDBLOCKDATA: 0x78, RESET: 0x79, BLOCKDATALONG: 0x7a, EXCEPTION: 0x7b,
  LONGSTRING: 0x7c, PROXYCLASSDESC: 0x7d, ENUM: 0x7e,
};
const SC_WRITE_METHOD = 0x01, SC_SERIALIZABLE = 0x02, SC_EXTERNALIZABLE = 0x04, SC_BLOCK_DATA = 0x08;
const BASE_HANDLE = 0x7e0000;
const END = Symbol('end');

// UTF-8 modificado do Java (NUL como C0 80, caracteres fora do BMP em pares substitutos)
function modUtf8(buf, start, len) {
  let out = '';
  let i = start;
  const end = start + len;
  while (i < end) {
    const a = buf[i++];
    if (a < 0x80) out += String.fromCharCode(a);
    else if ((a & 0xe0) === 0xc0) out += String.fromCharCode(((a & 0x1f) << 6) | (buf[i++] & 0x3f));
    else {
      const b = buf[i++], c = buf[i++];
      out += String.fromCharCode(((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f));
    }
  }
  return out;
}

export function readJavaSerialized(buf, { maxObjects = 5_000_000 } = {}) {
  let p = 0;
  let count = 0;
  const handles = [];
  const u8 = () => buf[p++];
  const u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
  const i32 = () => { const v = buf.readInt32BE(p); p += 4; return v; };
  const i64 = () => { const v = buf.readBigInt64BE(p); p += 8; return v; };
  const utf = () => { const n = u16(); const s = modUtf8(buf, p, n); p += n; return s; };
  const longUtf = () => { const n = Number(i64()); const s = modUtf8(buf, p, n); p += n; return s; };
  const newHandle = (v) => { handles.push(v); return handles.length - 1; };
  const guard = () => { if (++count > maxObjects) throw new Error('Arquivo grande demais'); };

  if (u16() !== 0xaced) throw new Error('Não é um arquivo de exportação do Holyrics (.mufl)');
  u16(); // versão

  function readClassDesc() {
    const tc = u8();
    if (tc === TC.NULL) return null;
    if (tc === TC.REFERENCE) return handles[i32() - BASE_HANDLE];
    if (tc === TC.PROXYCLASSDESC) {
      const desc = { name: '$Proxy', fields: [], flags: 0, proxy: true };
      newHandle(desc);
      const n = i32();
      for (let k = 0; k < n; k++) utf();
      skipAnnotation();
      desc.super = readClassDesc();
      return desc;
    }
    if (tc !== TC.CLASSDESC) throw new Error(`Formato inesperado (classDesc 0x${tc.toString(16)} em ${p - 1})`);
    const desc = { name: utf() };
    i64(); // serialVersionUID
    newHandle(desc);
    desc.flags = u8();
    const nf = u16();
    desc.fields = [];
    for (let k = 0; k < nf; k++) {
      const type = String.fromCharCode(u8());
      const name = utf();
      let cls = null;
      if (type === 'L' || type === '[') cls = readContent();
      desc.fields.push({ type, name, cls });
    }
    skipAnnotation();
    desc.super = readClassDesc();
    return desc;
  }

  function readBlockAndObjectsUntilEnd() {
    const items = [];
    for (;;) {
      const tc = buf[p];
      if (tc === TC.ENDBLOCKDATA) { p++; return items; }
      if (tc === TC.BLOCKDATA) { p++; const n = u8(); items.push({ block: buf.subarray(p, p + n) }); p += n; continue; }
      if (tc === TC.BLOCKDATALONG) { p++; const n = i32(); items.push({ block: buf.subarray(p, p + n) }); p += n; continue; }
      items.push(readContent());
    }
  }
  const skipAnnotation = () => { readBlockAndObjectsUntilEnd(); };

  function readValue(type) {
    switch (type) {
      case 'B': return buf.readInt8(p++);
      case 'C': return String.fromCharCode(u16());
      case 'D': { const v = buf.readDoubleBE(p); p += 8; return v; }
      case 'F': { const v = buf.readFloatBE(p); p += 4; return v; }
      case 'I': return i32();
      case 'J': return Number(i64());
      case 'S': { const v = buf.readInt16BE(p); p += 2; return v; }
      case 'Z': return u8() !== 0;
      default: return readContent();
    }
  }

  function hierarchy(desc) {
    const list = [];
    for (let d = desc; d; d = d.super) list.unshift(d);
    return list;
  }

  function readObject() {
    const desc = readClassDesc();
    const obj = { $class: desc?.name };
    const h = newHandle(obj);
    guard();
    for (const d of hierarchy(desc)) {
      if (d.flags & SC_EXTERNALIZABLE) {
        if (d.flags & SC_BLOCK_DATA) obj.$annotation = readBlockAndObjectsUntilEnd();
        else throw new Error('Classe externalizável sem dados em bloco não suportada: ' + d.name);
        continue;
      }
      for (const f of d.fields) obj[f.name] = readValue(f.type);
      if (d.flags & SC_WRITE_METHOD) {
        const ann = readBlockAndObjectsUntilEnd();
        (obj.$annotation ||= []).push(...ann);
      }
    }
    const v = simplify(obj);
    handles[h] = v;
    return v;
  }

  // Converte coleções Java comuns em valores JS
  function simplify(obj) {
    const c = obj.$class || '';
    const objs = (obj.$annotation || []).filter((x) => !(x && x.block));
    if (/^java\.util\.(ArrayList|LinkedList|Vector|Arrays\$ArrayList)$/.test(c)) return objs.length ? objs : obj.a || obj.elementData || [];
    if (/^java\.util\.(HashMap|LinkedHashMap|TreeMap|Hashtable)$/.test(c)) {
      const m = {};
      for (let k = 0; k + 1 < objs.length; k += 2) m[String(objs[k])] = objs[k + 1];
      return m;
    }
    if (/^java\.lang\.(Integer|Long|Short|Byte|Double|Float|Boolean|Character)$/.test(c)) return obj.value;
    return obj;
  }

  function readArray() {
    const desc = readClassDesc();
    const arr = [];
    newHandle(arr);
    const n = i32();
    const elType = desc.name[1];
    for (let k = 0; k < n; k++) arr.push(readValue(elType));
    guard();
    return arr;
  }

  function readContent() {
    const tc = u8();
    switch (tc) {
      case TC.NULL: return null;
      case TC.REFERENCE: return handles[i32() - BASE_HANDLE];
      case TC.STRING: { const s = utf(); newHandle(s); return s; }
      case TC.LONGSTRING: { const s = longUtf(); newHandle(s); return s; }
      case TC.OBJECT: return readObject();
      case TC.ARRAY: return readArray();
      case TC.CLASS: { const d = readClassDesc(); newHandle(d); return d; }
      case TC.CLASSDESC: case TC.PROXYCLASSDESC: p--; return readClassDesc();
      case TC.ENUM: { readClassDesc(); const o = {}; newHandle(o); o.$enum = readContent(); return o.$enum; }
      case TC.ENDBLOCKDATA: return END;
      case TC.RESET: handles.length = 0; return readContent();
      default: throw new Error(`Byte inesperado 0x${tc.toString(16)} na posição ${p - 1}`);
    }
  }

  const out = [];
  while (p < buf.length) {
    const tc = buf[p];
    if (tc === TC.BLOCKDATA) { p++; p += u8(); continue; }
    out.push(readContent());
  }
  return out.length === 1 ? out[0] : out;
}
