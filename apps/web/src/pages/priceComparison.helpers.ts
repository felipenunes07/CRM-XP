export type CompetitorItem = { id: string; code: string; name: string; price: number };
export type CatalogItem = { sku: string; model: string; quality: string | null; price: number; stockQuantity: number };
export type PartKind = "Frontal" | "Dock de carga" | "Bateria" | "Outras peças";

export function normalise(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function partKind(name: string, catalog = false): PartKind {
  const text = normalise(name);
  if (/\b(doc|dock|conector|placa de carga|flex de carga)\b/.test(text)) return "Dock de carga";
  if (/\b(bateria|battery|bat)\b/.test(text)) return "Bateria";
  if (/\b(tampa|camera|lente|aro|carcaca|botao|alto falante|auricular|flex)\b/.test(text)) return "Outras peças";
  if (/\b(frontal|tela|display|screen|lcd|oled|incell)\b/.test(text)) return "Frontal";
  // The XP inventory uses an unprefixed phone model for screens.
  return catalog ? "Frontal" : "Outras peças";
}

const ignored = new Set("frontal tela display screen lcd doc dock de carga conector placa flex bateria battery bat samsung sm motorola moto mt xiaomi mi redmi iphone ip apple huawei realme dr original fhd incell in cell prime premier oled amoled ips service pack copy com sem ci aro preto branco azul destaque nacional premium qualidade touch compativel para".split(" "));
function modelKey(name: string) {
  return [...new Set(normalise(name.replace(/^\d[\w/-]*\s+-\s+/, "")).replace(/\b([a-z]+)\s+(\d+)/g, "$1$2").split(" ").filter((token) => !ignored.has(token)))].sort().join(" ");
}
function qualityKey(name: string) {
  const text = normalise(name);
  return /\bamoled\b/.test(text) ? "amoled" : /\boled\b/.test(text) ? "oled" : /\bin ?cell\b/.test(text) ? "incell" : /\boriginal\b|service pack/.test(text) ? "original" : /\bpremier\b/.test(text) ? "premier" : /\bprime\b/.test(text) ? "prime" : /\bfhd\b/.test(text) ? "fhd" : null;
}
function brand(name: string) {
  const text = normalise(name);
  return [/\b(samsung|sm)\b/, /\b(motorola|moto|mt)\b/, /\b(xiaomi|redmi|mi)\b/, /\b(iphone|apple|ip)\b/, /\bhuawei\b/, /\brealme\b/].findIndex((pattern) => pattern.test(text));
}

export function indexCatalog(catalog: CatalogItem[]) {
  const index = new Map<string, CatalogItem[]>();
  for (const xp of catalog) {
    const key = `${partKind(xp.model, true)}|${modelKey(xp.model)}`;
    const group = index.get(key) ?? [];
    group.push(xp);
    index.set(key, group);
  }
  return index;
}

export function matchCatalog(item: CompetitorItem, catalog: CatalogItem[] | ReturnType<typeof indexCatalog>) {
  const kind = partKind(item.name);
  const key = modelKey(item.name);
  const index = Array.isArray(catalog) ? indexCatalog(catalog) : catalog;
  const candidates = (index.get(`${kind}|${key}`) ?? []).filter((xp) => {
    if (kind === "Outras peças" || !key) return false;
    const leftBrand = brand(item.name), rightBrand = brand(xp.model);
    if (leftBrand >= 0 && rightBrand >= 0 && leftBrand !== rightBrand) return false;
    const leftQuality = qualityKey(item.name), rightQuality = qualityKey(`${xp.model} ${xp.quality ?? ""}`);
    return !(leftQuality && rightQuality && leftQuality !== rightQuality);
  }).sort((a, b) => a.price - b.price);
  const exactQuality = qualityKey(item.name);
  const confirmed = candidates.filter((xp) => exactQuality && exactQuality === qualityKey(`${xp.model} ${xp.quality ?? ""}`));
  return { kind, candidates, automatic: confirmed.length === 1 ? confirmed[0] : null };
}
