export type CompetitorItem = { id: string; code: string; name: string; price: number };
export type CatalogItem = { sku: string; model: string; quality: string | null; price: number; stockQuantity: number };
export type PartKind = "Frontal" | "Dock de carga" | "Bateria" | "Outras peças";

export function normalise(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\+/g, " plus ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function partKind(name: string, catalog = false): PartKind {
  const text = normalise(name);
  if (/\b(doc|dock|conector|placa de carga|flex de carga)\b/.test(text)) return "Dock de carga";
  if (/\b(bateria|battery|bat)\b/.test(text)) return "Bateria";
  if (/\b(tampa|camera|lente|carcaca|botao|alto falante|auricular)\b/.test(text)) return "Outras peças";
  if (/\b(frontal|tela|display|screen|dr|kelai|lcd|oled|incell)\b/.test(text)) return "Frontal";
  if (/\b(aro|flex)\b/.test(text) && !catalog) return "Outras peças";
  return catalog ? "Frontal" : "Outras peças";
}

export function qualityLabel(name: string) {
  const text = normalise(name);
  const qualities = ["premier max", "select max", "soft oled", "hard oled", "oled yk", "ori yk", "original soft", "original dd", "incell jk", "premier", "select", "vivid", "incell", "original", "ori", "amoled", "oled", "fhd", "lcd", "prime"];
  const value = qualities.find((quality) => new RegExp(`\\b${quality}\\b`).test(text.replace(/in cell/g, "incell")));
  return value === "ori" ? "ORIGINAL" : value?.toUpperCase() ?? null;
}

function qualityFamily(quality: string | null) {
  if (quality === "ORIGINAL SOFT") return "SOFT OLED";
  if (quality === "INCELL JK") return "INCELL";
  if (quality === "ORIGINAL DD") return "ORIGINAL";
  if (quality === "ORI YK") return "OLED YK";
  return quality;
}

export function hasFrame(name: string) {
  return /\bcom aro\b/.test(normalise(name));
}

function brand(name: string) {
  const text = normalise(name);
  const aliases = [/\b(samsung|sm)\b/, /\b(motorola|moto|mt)\b/, /\b(xiaomi|redmi|mi|poco)\b/, /\b(iphone|ip|apple)\s*\d*\b/, /\bhuawei\b/, /\brealme\b/];
  return aliases.findIndex((pattern) => pattern.test(text));
}

const stopWords = new Set("frontal tela display screen lcd doc dock de carga conector placa flex bateria battery bat samsung sm motorola moto mt xiaomi mi redmi iphone ip apple huawei realme dr kelai original ori fhd incell in cell prime premier select oled amoled ips service pack copy com sem troca ci aro preto branco azul destaque nacional premium qualidade touch compativel para vivid jk dd soft hard cof borda hz outlet yk max".split(" "));

export function modelKeys(name: string): string[] {
  const text = normalise(name.replace(/^\d[\w/-]*\s+-\s+/, ""));
  // Read the phone variant before removing commercial quality suffixes such as SELECT MAX.
  const iphone = [...text.matchAll(/\b(?:iphone|ip)\s*(\d{1,2}|xs|xr|x|se)\b(?:\s*(pro max|pro|mini|plus|(?:max)(?=\s|$)))?/g)];
  if (iphone.length) return [...new Set(iphone.map((match) => `iphone${match[1]} ${match[2] ?? ""}`.trim()))];
  return [...new Set(name.split("/").map((segment) => {
    const cleaned = normalise(segment)
      .replace(/\b(premier|select|prime)\s+max\b/g, " ")
      .split(" ").filter((word) => !stopWords.has(word) && !/^\d+hz$/.test(word)).join(" ")
      .replace(/\b([a-z]+)\s+(\d+[a-z]*)\b/g, "$1$2");
    const tokens = cleaned.split(" ").filter(Boolean);
    // A shared digit is not a model: require a model identifier, retaining CORE / PRO / 5G.
    return tokens.some((token) => /\d/.test(token)) ? [...new Set(tokens)].sort().join(" ") : "";
  }).filter(Boolean))];
}

type IndexedItem = { item: CatalogItem; brand: number; quality: string | null; frame: boolean };
export function indexCatalog(catalog: CatalogItem[]) {
  const index = new Map<string, IndexedItem[]>();
  for (const item of catalog) {
    if (!(item.stockQuantity > 0)) continue;
    const entry = { item, brand: brand(item.model), quality: qualityLabel(item.quality ?? "") ?? qualityLabel(item.model), frame: hasFrame(item.model) };
    for (const model of modelKeys(item.model)) {
      const key = `${partKind(item.model, true)}|${model}`;
      const group = index.get(key) ?? [];
      group.push(entry);
      index.set(key, group);
    }
  }
  return index;
}

export function matchCatalog(item: CompetitorItem, catalog: CatalogItem[] | ReturnType<typeof indexCatalog>) {
  const kind = partKind(item.name);
  const index = Array.isArray(catalog) ? indexCatalog(catalog) : catalog;
  const itemBrand = brand(item.name);
  const itemQuality = qualityLabel(item.name);
  const frame = hasFrame(item.name);
  const found = new Map<string, IndexedItem>();
  if (kind !== "Outras peças") {
    for (const model of modelKeys(item.name)) {
      for (const entry of index.get(`${kind}|${model}`) ?? []) {
        if (entry.frame === frame && (itemBrand < 0 || entry.brand < 0 || itemBrand === entry.brand)) found.set(entry.item.sku, entry);
      }
    }
  }
  const ranked = [...found.values()].sort((a, b) => {
    const targetQuality = qualityFamily(itemQuality);
    const rank = (entry: IndexedItem) => (entry.quality === itemQuality && itemQuality ? 200 : qualityFamily(entry.quality) === targetQuality && targetQuality ? 100 : 0);
    return rank(b) - rank(a) || a.item.price - b.item.price || a.item.sku.localeCompare(b.item.sku);
  });
  return { kind, quality: itemQuality, candidates: ranked.map((entry) => entry.item) };
}

export function comparisonNote(competitor: CompetitorItem, xp: CatalogItem) {
  const left = qualityLabel(competitor.name);
  const right = qualityLabel(xp.quality ?? "") ?? qualityLabel(xp.model);
  const notes = [left && qualityFamily(left) === qualityFamily(right) ? "Qualidade semelhante no nome" : left ? "Outra qualidade XP" : "Qualidade do concorrente não informada"];
  if (hasFrame(competitor.name) !== hasFrame(xp.model)) notes.push(hasFrame(xp.model) ? "XP com aro" : "XP sem aro explícito");
  return notes.join(" · ");
}
