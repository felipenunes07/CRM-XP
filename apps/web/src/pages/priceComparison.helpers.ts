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

export function supplierFrame(name: string): boolean | null {
  if (hasFrame(name)) return true;
  return /\bsem aro\b/.test(normalise(name)) ? false : null;
}

export function compatibleFrame(name: string, model: string) {
  const frame = supplierFrame(name);
  return frame === null || frame === hasFrame(model);
}

function brand(name: string) {
  const text = normalise(name);
  const aliases = [/\b(samsung|sam|sm)\b/, /\b(motorola|moto|mt)\b/, /\b(xiaomi|redmi|mi|poco)\b/, /\b(iphone|ip|apple)\s*\d*\b/, /\bhuawei\b/, /\b(realme|oppo)\b/, /\blg\b/, /\binfinix\b/, /\bnokia\b/, /\b(asus|zenfone|zf)\b/];
  return aliases.findIndex((pattern) => pattern.test(text));
}

const stopWords = new Set("frontal tela display screen lcd doc dock de carga conector placa flex bateria battery bat samsung sam sm motorola moto mt xiaomi mi redmi iphone ip apple huawei realme oppo dr kelai original origina originao ori fhd incell incelll in cell prime premier select oled amoled ips service pack copy com sem troca ci aro preto branco azul cinza dourado dourodo rosa roxo vermelha vermelho verde prata destaque nacional premium qualidade touch compativel para vivid jk dd soft hard cof borda hz outlet yk max big grande grange menor".split(" "));

export function modelKeys(name: string): string[] {
  const modelName = name.replace(/\[[^\]]*\]/g, " ").replace(/\\/g, "/").replace(/\b1\s*:\s*1\b/g, " ");
  const text = normalise(modelName.replace(/^\d[\w/-]*\s+-\s+/, "")).replace(/\b(ip|iphone)(?=\d|x\b|xs\b|xr\b|se\b)/g, "$1 ");
  // Read the phone variant before removing commercial quality suffixes such as SELECT MAX.
  if (/\b(?:iphone|ip)\b/.test(text)) {
    const segments = modelName.split("/");
    return [...new Set(segments.flatMap((segment, index) => {
      const cleaned = normalise(segment).replace(/\b(ip|iphone)(?=\d|x\b|xs\b|xr\b|se\b)/g, "$1 ");
      const start = (index === 0 ? cleaned.replace(/^.*?\b(?:iphone|ip)\s*/, "") : cleaned).replace(/^(?:(?:iphone|ip)\s*)+/, "");
      const match = start.match(/^(\d{1,2}[se]?|xs|xr|x|se)(?:g)?(?:\s*(pro\s*max|pro|mini|plus|max))?(?=\s|$)/);
      return match ? [`iphone${match[1]} ${(match[2] ?? "").replace(/pro\s*max/, "pro max")}`.trim()] : [];
    }))];
  }
  const keys: string[] = [];
  let previousModel = "";
  for (const segment of modelName.split("/")) {
    const cleaned = normalise(segment)
      .replace(/(\d)(core|pro|max|plus|ultra|lite|play|power|fusion)\b/g, "$1 $2")
      .replace(/\b(premier|select|prime)\s+max\b/g, " ")
      .replace(/\b(lg|infinix|nokia|asus|zenfone|zf|realmi|diamonds|diamond|master|prteo|vremlha|tled|incel|biometria|biomenteria|fuciona|funciona|maior)\b/g, " ")
      .replace(/\b(s\d+)\s+fe\b/g, "$1fe")
      .split(" ").filter((word) => !stopWords.has(word) && !/^\d+hz$/.test(word)).join(" ")
      .replace(/\b([a-z]+)\s+(\d+[a-z]*)\b/g, "$1$2");
    const tokens = cleaned.split(" ").filter(Boolean);
    const networks = tokens.filter((token) => /^(?:4|5)g$/.test(token));
    const modelTokens = tokens.filter((token) => !/^(?:4|5)g$/.test(token));
    if (!modelTokens.some((token) => /\d/.test(token)) && !/\b(one|edge|z)\b/.test(modelTokens.join(" "))) {
      if (previousModel && networks.length === 1 && tokens.length === 1) keys.push(`${previousModel} ${networks[0]}`);
      continue;
    }
    const model = [...new Set(modelTokens)].sort().join(" ");
    previousModel = model;
    if (networks.length) networks.forEach((network) => keys.push(`${model} ${network}`));
    else keys.push(model);
  }
  return [...new Set(keys)];
}

type IndexedItem = { item: CatalogItem; brand: number; quality: string | null; frame: boolean };
export function indexCatalog(catalog: CatalogItem[], inStockOnly = true) {
  const index = new Map<string, IndexedItem[]>();
  for (const item of catalog) {
    if (inStockOnly && !(item.stockQuantity > 0)) continue;
    const entry = { item, brand: brand(item.model), quality: qualityLabel(item.quality ?? "") ?? qualityLabel(item.model), frame: hasFrame(item.model) };
    for (const model of modelKeys(item.model)) {
      const key = `${partKind(item.model, true)}|${model}`;
      const group = index.get(key) ?? [];
      group.push(entry);
      index.set(key, group);
      if (/\s[45]g$/.test(model)) {
        const variantKey = `${partKind(item.model, true)}|${model.replace(/\s[45]g$/, "")}|network-unspecified`;
        const variants = index.get(variantKey) ?? [];
        variants.push(entry);
        index.set(variantKey, variants);
      }
    }
  }
  return index;
}

export function matchCatalog(item: CompetitorItem, catalog: CatalogItem[] | ReturnType<typeof indexCatalog>) {
  const kind = partKind(item.name);
  const index = Array.isArray(catalog) ? indexCatalog(catalog) : catalog;
  const itemBrand = brand(item.name);
  const itemQuality = qualityLabel(item.name);
  const frame = supplierFrame(item.name);
  const found = new Map<string, IndexedItem>();
  const addMatches = (models: string[], includeVariants = true) => {
    for (const model of models) {
      const entries = [...index.get(`${kind}|${model}`) ?? [], ...(includeVariants && !/\s[45]g$/.test(model) ? index.get(`${kind}|${model}|network-unspecified`) ?? [] : [])];
      for (const entry of entries) {
        if ((frame === null || entry.frame === frame) && (itemBrand < 0 || entry.brand < 0 || itemBrand === entry.brand)) found.set(entry.item.sku, entry);
      }
    }
  };
  if (kind !== "Outras peças") {
    const models = modelKeys(item.name);
    addMatches(models);
    // XP's grouped compatibility records sometimes omit 4G/5G. Use them only
    // as a fallback; explicit variants are never cross-matched.
    if (!found.size) addMatches(models.map((model) => model.replace(/\s+[45]g$/, "")), false);
  }
  const ranked = [...found.values()].sort((a, b) => {
    const targetQuality = qualityFamily(itemQuality);
    const rank = (entry: IndexedItem) => (entry.quality === itemQuality && itemQuality ? 200 : qualityFamily(entry.quality) === targetQuality && targetQuality ? 100 : 0);
    return rank(b) - rank(a) || a.item.price - b.item.price || a.item.sku.localeCompare(b.item.sku);
  });
  return { kind, quality: itemQuality, candidates: ranked.map((entry) => entry.item) };
}

export function compareCatalogItem(item: CompetitorItem, catalog: ReturnType<typeof indexCatalog>, fullCatalog: ReturnType<typeof indexCatalog>) {
  const full = matchCatalog(item, fullCatalog);
  const match = matchCatalog(item, catalog);
  return { item, ...match, totalCandidates: full.candidates.length, missingReason: match.candidates.length ? null : missingReason(item, fullCatalog) };
}

export type MissingReason = "out-of-stock" | "frame" | "brand" | "model";

export function missingReason(item: CompetitorItem, fullCatalog: ReturnType<typeof indexCatalog>): MissingReason {
  if (matchCatalog(item, fullCatalog).candidates.length) return "out-of-stock";
  const kind = partKind(item.name);
  const models = modelKeys(item.name);
  const entries = models.flatMap((model) => [...fullCatalog.get(`${kind}|${model}`) ?? [], ...(!/\s[45]g$/.test(model) ? fullCatalog.get(`${kind}|${model}|network-unspecified`) ?? [] : [])]);
  if (!entries.length) entries.push(...models.flatMap((model) => fullCatalog.get(`${kind}|${model.replace(/\s[45]g$/, "")}`) ?? []));
  const itemBrand = brand(item.name);
  const compatibleBrand = entries.filter((entry) => itemBrand < 0 || entry.brand < 0 || itemBrand === entry.brand);
  const sameFrame = compatibleBrand.filter((entry) => compatibleFrame(item.name, entry.item.model));
  if (sameFrame.length) return "out-of-stock";
  if (compatibleBrand.length) return "frame";
  if (entries.length) return "brand";
  return "model";
}

export function comparisonNote(competitor: CompetitorItem, xp: CatalogItem) {
  const left = qualityLabel(competitor.name);
  const right = qualityLabel(xp.quality ?? "") ?? qualityLabel(xp.model);
  const notes = [left && qualityFamily(left) === qualityFamily(right) ? "Qualidade semelhante no nome" : left ? "Outra qualidade XP" : "Qualidade do concorrente não informada"];
  if (supplierFrame(competitor.name) === null && partKind(competitor.name) === "Frontal") notes.push("Aro do fornecedor não informado; confira antes de comprar");
  if (!modelKeys(competitor.name).some((key) => /\s[45]g$/.test(key)) && modelKeys(xp.model).some((key) => /\s[45]g$/.test(key))) notes.push("Rede do fornecedor não informada; confira 4G/5G");
  if (hasFrame(competitor.name) !== hasFrame(xp.model)) notes.push(hasFrame(xp.model) ? "XP com aro" : "XP sem aro explícito");
  return notes.join(" · ");
}
