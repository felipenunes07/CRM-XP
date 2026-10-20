import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, FileUp, Search, SlidersHorizontal, XCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";

type CompetitorItem = { id: string; code: string; name: string; price: number };
type CatalogItem = { sku: string; model: string; quality: string | null; price: number; stockQuantity: number };
type Filter = "all" | "better" | "above" | "missing" | "review";

const ignoredWords = new Set([
  "dr", "tela", "screen", "display", "doc", "carga", "bateria", "battery", "com", "sem", "para", "de", "da", "do", "o", "a", "e",
  "original", "fhd", "incell", "in", "cell", "prime", "premier", "oled", "ips", "service", "copy",
]);
const qualityWords = ["original", "fhd", "incell", "in cell", "prime", "premier", "oled", "ips", "service", "copy"];

function normalise(value: string) {
  return value
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function modelTokens(value: string) {
  return normalise(value).split(" ").filter((word) => word.length > 1 && !ignoredWords.has(word));
}

function quality(value: string) {
  const text = normalise(value);
  return qualityWords.find((word) => text.includes(word)) ?? null;
}

function scoreMatch(competitor: CompetitorItem, catalog: CatalogItem) {
  const left = modelTokens(competitor.name);
  const right = modelTokens(`${catalog.model} ${catalog.quality ?? ""}`);
  const overlap = left.filter((word) => right.includes(word));
  if (!overlap.length) return 0;
  const union = new Set([...left, ...right]).size;
  const base = overlap.length / union;
  const sameQuality = quality(competitor.name) && quality(competitor.name) === quality(`${catalog.model} ${catalog.quality ?? ""}`);
  const categoryMatch = ["iphone", "samsung", "motorola", "xiaomi", "redmi", "huawei", "realme"].some(
    (brand) => normalise(competitor.name).includes(brand) && normalise(catalog.model).includes(brand),
  );
  return Math.min(1, base + (sameQuality ? 0.28 : 0) + (categoryMatch ? 0.14 : 0));
}

function confidence(score: number) {
  if (score >= 0.76) return "Alta";
  if (score >= 0.45) return "Revisar";
  return "Baixa";
}

function parseSheet(file: File): Promise<CompetitorItem[]> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new Error("Não encontrei uma aba válida no arquivo.");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    const header = (rows[0] ?? []).map((cell) => normalise(String(cell)));
    const nameColumn = header.findIndex((cell) => cell.includes("nome") || cell.includes("name") || cell.includes("商品名称"));
    const priceColumn = header.findIndex((cell) => cell.includes("preco") || cell.includes("valor") || cell.includes("售价"));
    const codeColumn = header.findIndex((cell) => cell.includes("codigo") || cell.includes("sku") || cell.includes("编号"));
    const nameIndex = nameColumn >= 0 ? nameColumn : 2;
    const priceIndex = priceColumn >= 0 ? priceColumn : 3;
    const codeIndex = codeColumn >= 0 ? codeColumn : 1;
    const records = rows.slice(1).map((row, index) => {
      const rawPrice = row[priceIndex];
      const price = typeof rawPrice === "number" ? rawPrice : Number(String(rawPrice).replace(/[^0-9,.-]/g, "").replace(",", "."));
      return { id: `${index}-${String(row[nameIndex] ?? "")}`, code: String(row[codeIndex] ?? "").trim(), name: String(row[nameIndex] ?? "").trim(), price };
    }).filter((row) => row.name && Number.isFinite(row.price) && row.price > 0);
    if (!records.length) throw new Error("Não encontrei colunas de produto e preço com dados válidos.");
    return records;
  });
}

export function PriceComparisonPage() {
  const { token } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [competitorItems, setCompetitorItems] = useState<CompetitorItem[]>([]);
  const [fileName, setFileName] = useState("");
  const [margin, setMargin] = useState(() => {
    const saved = Number(globalThis.localStorage?.getItem("xpcrm-price-comparison-margin"));
    return Number.isFinite(saved) && saved >= 0 ? saved : 5;
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const catalogQuery = useQuery({ queryKey: ["inventory-price-catalog"], queryFn: () => api.inventoryPriceCatalog(token!), enabled: Boolean(token) });
  const catalog = catalogQuery.data?.items ?? [];

  useEffect(() => {
    globalThis.localStorage?.setItem("xpcrm-price-comparison-margin", String(margin));
  }, [margin]);

  const rows = useMemo(() => competitorItems.map((competitor) => {
    const ranked = catalog.map((item) => ({ item, score: scoreMatch(competitor, item) })).sort((a, b) => b.score - a.score || a.item.price - b.item.price);
    const bestCandidate = ranked[0];
    const automatic = bestCandidate && bestCandidate.score >= 0.3 ? bestCandidate : null;
    const chosen = overrides[competitor.id] ? catalog.find((item) => item.sku === overrides[competitor.id]) ?? null : automatic?.item ?? null;
    const selectedScore = chosen ? (ranked.find((candidate) => candidate.item.sku === chosen.sku)?.score ?? 1) : 0;
    const targetPrice = competitor.price + margin;
    const difference = chosen ? chosen.price - targetPrice : null;
    return { competitor, chosen, score: selectedScore, targetPrice, difference, alternatives: ranked.filter((candidate) => candidate.score >= 0.25).slice(0, 8) };
  }), [catalog, competitorItems, margin, overrides]);

  const summary = useMemo(() => ({
    matched: rows.filter((row) => row.chosen).length,
    better: rows.filter((row) => row.difference !== null && row.difference <= 0).length,
    above: rows.filter((row) => row.difference !== null && row.difference > 0).length,
    missing: rows.filter((row) => !row.chosen).length,
    review: rows.filter((row) => row.chosen && row.score < 0.76).length,
  }), [rows]);
  const visibleRows = rows
    .filter((row) => {
      const matchesFilter = filter === "all" || (filter === "better" && row.difference !== null && row.difference <= 0) || (filter === "above" && row.difference !== null && row.difference > 0) || (filter === "missing" && !row.chosen) || (filter === "review" && row.chosen && row.score < 0.76);
      return matchesFilter && `${row.competitor.name} ${row.chosen?.model ?? ""}`.toLowerCase().includes(search.toLowerCase());
    })
    .sort((left, right) => {
      const priority = (row: typeof left) => !row.chosen ? 0 : row.difference !== null && row.difference > 0 ? 1 : row.score < 0.76 ? 2 : 3;
      return priority(left) - priority(right) || left.competitor.name.localeCompare(right.competitor.name, "pt-BR");
    });

  async function handleFile(file?: File) {
    if (!file) return;
    setError("");
    try {
      setCompetitorItems(await parseSheet(file));
      setFileName(file.name);
      setOverrides({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível ler a planilha.");
    }
  }

  return <div className="page-stack price-comparison-page">
    <section className="hero-panel price-comparison-hero">
      <div className="hero-copy"><p className="eyebrow">Inteligência de preços</p><h2>Comparação de preço</h2><p>Importe a tabela de um concorrente e compare com o preço atual do seu estoque. O alvo soma a margem definida ao menor preço do concorrente.</p></div>
      <label className="price-upload-button"><FileUp size={18} /><span>{fileName ? "Trocar planilha" : "Importar Excel"}</span><input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleFile(event.target.files?.[0])} /></label>
    </section>

    <section className="panel price-comparison-controls">
      <div><span className="eyebrow">Regra de comparação</span><strong>Preço da XP contra concorrente + margem</strong></div>
      <label className="price-margin-control"><SlidersHorizontal size={16} /> Margem padrão <input type="number" min="0" step="1" value={margin} onChange={(event) => setMargin(Math.max(0, Number(event.target.value) || 0))} /> <b>{formatCurrency(margin)}</b></label>
      <p className="muted-copy">Você pode ajustar esta margem a qualquer momento. Ex.: concorrente R$ 59 + R$ 5 = alvo XP de R$ 64.</p>
    </section>

    {error ? <div className="price-message error"><AlertTriangle size={18} />{error}</div> : null}
    {catalogQuery.isLoading ? <div className="panel price-empty">Carregando catálogo e preços atuais da XP...</div> : null}
    {!catalogQuery.isLoading && !competitorItems.length ? <section className="panel price-empty"><FileUp size={32} /><h3>Importe a planilha do concorrente</h3><p>A leitura reconhece automaticamente as colunas de código, produto e preço. Para a tabela UUF, os campos identificados são produto e preço mínimo.</p></section> : null}

    {competitorItems.length ? <>
      <section className="price-summary-grid">
        <button type="button" className={`price-summary-card ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}><span>Itens importados</span><strong>{formatNumber(competitorItems.length)}</strong><small>{formatNumber(summary.matched)} com equivalente XP</small></button>
        <button type="button" className={`price-summary-card success ${filter === "better" ? "active" : ""}`} onClick={() => setFilter("better")}><CheckCircle2 size={18} /><span>Preço melhor ou igual</span><strong>{formatNumber(summary.better)}</strong><small>XP no alvo ou abaixo</small></button>
        <button type="button" className={`price-summary-card warning ${filter === "above" ? "active" : ""}`} onClick={() => setFilter("above")}><AlertTriangle size={18} /><span>Acima do alvo</span><strong>{formatNumber(summary.above)}</strong><small>revisar oportunidade</small></button>
        <button type="button" className={`price-summary-card neutral ${filter === "missing" ? "active" : ""}`} onClick={() => setFilter("missing")}><XCircle size={18} /><span>Sem equivalente XP</span><strong>{formatNumber(summary.missing)}</strong><small>modelo ou qualidade ausente</small></button>
        <button type="button" className={`price-summary-card review ${filter === "review" ? "active" : ""}`} onClick={() => setFilter("review")}><AlertTriangle size={18} /><span>Conferir pareamento</span><strong>{formatNumber(summary.review)}</strong><small>equivalência aproximada</small></button>
      </section>
      <section className="panel price-table-panel">
        <div className="price-table-header"><div><h3>Leitura da concorrência</h3><p className="muted-copy">Os itens que pedem ação aparecem primeiro. Confira apenas os marcados como “Revisar” e ajuste pelo seletor quando necessário.</p></div><label className="price-search"><Search size={16} /><input placeholder="Buscar produto" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
        <div className="price-table-wrap"><table className="data-table price-table"><thead><tr><th>Concorrente</th><th>Preço UUF</th><th>Equivalente XP</th><th>Preço XP</th><th>Alvo XP</th><th>Diferença</th><th>Confiança</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.competitor.id}><td><strong>{row.competitor.name}</strong><small>{row.competitor.code || "Sem código"}</small></td><td>{formatCurrency(row.competitor.price)}</td><td><select value={row.chosen?.sku ?? ""} onChange={(event) => setOverrides((current) => ({ ...current, [row.competitor.id]: event.target.value }))}><option value="">Sem equivalente</option>{row.alternatives.map(({ item }) => <option key={item.sku} value={item.sku}>{item.model}{item.quality ? ` · ${item.quality}` : ""} ({item.sku})</option>)}</select>{row.chosen ? <small>{formatNumber(row.chosen.stockQuantity)} em estoque</small> : <small>Não localizado no catálogo XP</small>}</td><td>{row.chosen ? formatCurrency(row.chosen.price) : "—"}</td><td>{formatCurrency(row.targetPrice)}</td><td>{row.difference === null ? <span className="price-status missing">Sem comparação</span> : <span className={`price-status ${row.difference <= 0 ? "better" : "above"}`}>{row.difference <= 0 ? "Melhor" : "Acima"} {formatCurrency(Math.abs(row.difference))}</span>}</td><td>{row.chosen ? <span className={`confidence confidence-${confidence(row.score).toLowerCase()}`}>{confidence(row.score)}</span> : "—"}</td></tr>)}</tbody></table></div>
      </section>
    </> : null}
  </div>;
}
