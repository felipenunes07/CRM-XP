import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AlertTriangle, FileUp, Plus, Search, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { comparisonNote, hasFrame, indexCatalog, matchCatalog, normalise, type CatalogItem, type CompetitorItem, type PartKind } from "./priceComparison.helpers";

type Filter = "all" | "above" | "better" | "matched" | "missing";
type Supplier = { id: string; name: string; fileName: string; items: CompetitorItem[] };

type ComparisonRow = { item: CompetitorItem; kind: PartKind; quality: string | null; candidates: CatalogItem[]; totalCandidates: number };

export function PriceComparisonRows({ row }: { row: ComparisonRow }) {
  const available = row.candidates.filter((xp) => xp.stockQuantity > 0 && hasFrame(xp.model) === hasFrame(row.item.name));
  const offers: (CatalogItem | null)[] = available.length ? available : [null];
  return <Fragment>{offers.map((xp, index) => {
    const difference = xp ? xp.price - row.item.price : null;
    return <tr key={xp?.sku ?? "missing"} className={`comparison-offer ${index === 0 ? "comparison-group-start" : ""}`}>
      {index === 0 ? <td rowSpan={offers.length} className="comparison-competitor"><strong>{row.item.name}</strong><small><span className={`comparison-kind ${row.kind === "Dock de carga" ? "dock" : ""}`}>{row.kind}</span>{row.item.code}</small>{row.kind === "Frontal" ? <small><span className={`comparison-frame ${hasFrame(row.item.name) ? "with-frame" : "without-frame"}`}>{hasFrame(row.item.name) ? "Com aro" : "Sem aro"}</span></small> : null}<small>{row.quality ? `Qualidade: ${row.quality}` : "Qualidade não informada"}</small><small>{formatNumber(available.length)} opções XP disponíveis</small></td> : null}
      <td>{xp ? <><strong><span className="comparison-quality">{xp.quality ?? "Sem qualidade informada"}</span>{row.kind === "Frontal" ? <span className={`comparison-frame ${hasFrame(xp.model) ? "with-frame" : "without-frame"}`}>{hasFrame(xp.model) ? "Com aro" : "Sem aro"}</span> : null}</strong><span className="comparison-offer-model">{xp.model}</span><small>{xp.sku} · <span className="comparison-stock-available">{formatNumber(xp.stockQuantity)} em estoque</span></small><small>{index === 0 ? "Mais semelhante · " : ""}{comparisonNote(row.item, xp)}</small></> : <span className="comparison-muted">Nenhum similar disponível no estoque XP com este modelo, tipo de peça e aro.</span>}</td>
      <td className="comparison-money comparison-supplier-price">{formatCurrency(row.item.price)}</td>
      <td className="comparison-money">{xp ? formatCurrency(xp.price) : "—"}</td>
      <td>{difference !== null ? <span className={`comparison-result ${difference > 0 ? "above" : "better"}`}>{difference > 0 ? "+" : difference < 0 ? "−" : ""}{formatCurrency(Math.abs(difference))}<small>{difference > 0 ? "mais caro que UUF" : difference < 0 ? "mais barato que UUF" : "mesmo preço da UUF"}</small></span> : "—"}</td>
    </tr>;
  })}</Fragment>;
}

export function parseSheet(file: File): Promise<CompetitorItem[]> {
  return file.arrayBuffer().then((buffer) => {
    const csv = file.name?.toLowerCase().endsWith(".csv");
    const workbook = XLSX.read(csv ? new TextDecoder("utf-8").decode(buffer) : buffer, { type: csv ? "string" : "array", raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new Error("Não encontrei uma aba válida no arquivo.");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    const headers = rows.map((row) => row.map((cell) => String(cell).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()));
    const isName = (cell: string) => /produto|descricao|nome|name|商品名称/.test(cell);
    const isPrice = (cell: string) => /preco|valor|price|售价/.test(cell);
    const headerIndex = headers.findIndex((row) => row.some(isName) && row.some(isPrice));
    const header = headers[headerIndex];
    if (!header) throw new Error("Não identifiquei o cabeçalho. Use colunas Produto e Preço (ou Preço mínimo).");
    const nameColumn = header.findIndex(isName);
    const minimumPriceColumn = header.findIndex((cell) => isPrice(cell) && /minim|minimum/.test(cell));
    const priceColumn = minimumPriceColumn >= 0 ? minimumPriceColumn : header.findIndex(isPrice);
    const codeColumn = header.findIndex((cell) => cell.includes("codigo") || cell.includes("sku") || cell.includes("编号"));
    const nameIndex = nameColumn;
    const priceIndex = priceColumn;
    const codeIndex = codeColumn;
    const records = rows.slice(headerIndex + 1).map((row, index) => {
      const rawPrice = row[priceIndex];
      const textPrice = String(rawPrice).replace(/[^0-9,.-]/g, "");
      const price = typeof rawPrice === "number" ? rawPrice : Number(textPrice.includes(",") ? textPrice.replace(/\./g, "").replace(",", ".") : textPrice);
      return { id: `${index}-${String(row[nameIndex] ?? "")}`, code: String(row[codeIndex] ?? "").trim(), name: String(row[nameIndex] ?? "").trim(), price };
    }).filter((row) => row.name && Number.isFinite(row.price) && row.price > 0);
    if (!records.length) throw new Error("Não encontrei colunas de produto e preço com dados válidos.");
    return records;
  });
}

export function PriceComparisonPage() {
  const { token } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const loadMore = useRef<HTMLDivElement>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([{ id: "uuf", name: "UUF", fileName: "", items: [] }]);
  const [activeId, setActiveId] = useState("uuf");
  const [adding, setAdding] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<PartKind | "all">("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [error, setError] = useState("");
  const catalogQuery = useQuery({ queryKey: ["inventory-price-catalog"], queryFn: () => api.inventoryPriceCatalog(token!), enabled: Boolean(token) });
  const catalog = catalogQuery.data?.items ?? [];
  const active = suppliers.find((supplier) => supplier.id === activeId)!;
  const catalogIndex = useMemo(() => indexCatalog(catalog), [catalog]);
  useEffect(() => {
    setVisibleCount(20);
  }, [filter, kind, search, activeId, active.items]);

  const matches = useMemo(() => active.items.map((item) => {
    const match = matchCatalog(item, catalogIndex);
    return { item, ...match };
  }), [active, catalogIndex]);
  const rows = matches.map((row) => ({ ...row, totalCandidates: row.candidates.length }));
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "Todos" }, { id: "above", label: "XP mais caro" }, { id: "better", label: "XP igual ou menor" },
    { id: "matched", label: "Com opções XP" }, { id: "missing", label: "Sem opção disponível" },
  ];
  const inFilter = (row: typeof rows[number], value: Filter) => value === "all" || (value === "matched" && row.candidates.length > 0) || (value === "missing" && row.totalCandidates === 0) || (value === "above" && row.candidates.some((xp) => xp.price > row.item.price)) || (value === "better" && row.candidates.some((xp) => xp.price <= row.item.price));
  const visible = rows.filter((row) => inFilter(row, filter) && (kind === "all" || row.kind === kind) && normalise(`${row.item.name} ${row.item.code} ${row.candidates.map((xp) => `${xp.model} ${xp.quality ?? ""} ${xp.sku}`).join(" ")}`).includes(normalise(search)));
  const displayedCount = Math.min(visibleCount, visible.length);
  const kinds: PartKind[] = ["Frontal", "Dock de carga", "Bateria", "Outras peças"];
  useEffect(() => {
    const sentinel = loadMore.current;
    if (!sentinel || visibleCount >= visible.length) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((count) => Math.min(count + 20, visible.length));
    }, { rootMargin: "500px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible.length, visibleCount]);

  function addSupplier(event: React.FormEvent) {
    event.preventDefault();
    const name = supplierName.trim();
    if (!name) return;
    const existing = suppliers.find((supplier) => normalise(supplier.name) === normalise(name));
    if (existing) { setActiveId(existing.id); }
    else {
      const id = crypto.randomUUID();
      setSuppliers((current) => [...current, { id, name, fileName: "", items: [] }]);
      setActiveId(id);
    }
    setAdding(false); setSupplierName(""); setError("");
  }

  async function handleFile(file?: File) {
    if (!file) return;
    const importingId = activeId;
    setError(""); setIsImporting(true);
    try {
      const items = await parseSheet(file);
      setSuppliers((current) => current.map((supplier) => supplier.id === importingId ? { ...supplier, fileName: file.name, items } : supplier));
      setFilter("all"); setKind("all"); setSearch(""); setVisibleCount(20);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível ler a planilha.");
    } finally {
      setIsImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return <div className="comparison-workspace">
    <header className="comparison-heading">
      <div><h2>Comparação de preços</h2><p>Seu estoque e a concorrência, lado a lado.</p></div>
      <button type="button" className="comparison-primary" disabled={isImporting} onClick={() => fileInput.current?.click()}><FileUp size={16} />{isImporting ? "Importando…" : "Importar planilha"}</button>
      <input ref={fileInput} type="file" hidden aria-label="Selecionar planilha do concorrente" accept=".xlsx,.xls,.csv" onChange={(event) => void handleFile(event.target.files?.[0])} />
    </header>

    <section className="comparison-surface">
      <div className="comparison-suppliers">
        <div role="tablist" aria-label="Concorrentes">{suppliers.map((supplier) => <button role="tab" aria-selected={activeId === supplier.id} aria-controls="comparison-content" id={`supplier-${supplier.id}`} key={supplier.id} type="button" onClick={() => { setActiveId(supplier.id); setError(""); }}><span>{supplier.name}</span><small>{supplier.items.length ? formatNumber(supplier.items.length) : "Sem tabela"}</small></button>)}</div>
        <button type="button" className="comparison-add" onClick={() => setAdding(true)}><Plus size={15} />Adicionar concorrente</button>
      </div>
      {adding ? <form className="comparison-add-form" onSubmit={addSupplier}><label htmlFor="supplier-name">Nome do concorrente</label><input id="supplier-name" autoFocus maxLength={50} placeholder="Ex.: UUF, fornecedor..." value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /><button className="comparison-primary" disabled={!supplierName.trim()}>Adicionar</button><button type="button" aria-label="Cancelar" onClick={() => setAdding(false)}><X size={16} /></button></form> : null}

      <div id="comparison-content" role="tabpanel" aria-labelledby={`supplier-${activeId}`}>
        <div className="comparison-context"><span><strong>{active.name}</strong>{active.fileName ? <span title={active.fileName}> · {active.fileName}</span> : " · Importe uma tabela para começar"}</span></div>
        {error ? <div role="alert" className="comparison-alert"><AlertTriangle size={16} />{error}</div> : null}
        {catalogQuery.isError ? <div role="alert" className="comparison-alert">Não foi possível carregar o estoque XP.<button onClick={() => void catalogQuery.refetch()}>Tentar novamente</button></div> : null}
        <div className="comparison-toolbar">
          <label className="comparison-search"><Search size={16} /><input aria-label="Buscar modelo ou código" placeholder="Buscar modelo ou código" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select aria-label="Tipo de peça" value={kind} onChange={(event) => setKind(event.target.value as PartKind | "all")}><option value="all">Todas as peças</option>{kinds.map((value) => <option key={value}>{value}</option>)}</select>
          <span className="comparison-availability">Somente XP disponível · Mesmo tipo de aro · Mais semelhantes primeiro</span>
        </div>
        <div className="comparison-filters" aria-label="Situação dos preços">{filters.map(({ id, label }) => <button type="button" key={id} aria-pressed={filter === id} className={`comparison-filter ${id}`} onClick={() => setFilter(id)}>{label}<b>{formatNumber(rows.filter((row) => inFilter(row, id)).length)}</b></button>)}</div>

        {!active.items.length ? <div className="comparison-empty"><FileUp size={28} /><h3>Adicione a tabela de {active.name}</h3><p>Importe Excel ou CSV com produto e preço.<br />Para outra empresa, use “Adicionar concorrente”.</p><button type="button" className="comparison-primary" disabled={isImporting} onClick={() => fileInput.current?.click()}>Selecionar planilha</button></div> : catalogQuery.isLoading ? <div className="comparison-empty" role="status">Carregando os preços XP…</div> : <><div className="comparison-table-scroll" role="region" aria-label="Comparação de preços com rolagem contínua"><table className="comparison-table"><thead><tr><th>Produto · {active.name}</th><th>Opções XP · todas as qualidades</th><th>{active.name}</th><th>Preço XP</th><th>Diferença</th></tr></thead><tbody>{visible.slice(0, visibleCount).map((row) => <PriceComparisonRows key={row.item.id} row={row} />)}{!visible.length ? <tr><td colSpan={5} className="comparison-no-results">Nenhum produto neste filtro. Ajuste a busca ou selecione “Todos”.</td></tr> : null}</tbody></table></div>{displayedCount < visible.length ? <div className="comparison-load-more" ref={loadMore} aria-hidden="true" /> : null}</>}
        <footer className="comparison-footer"><span role="status">{active.items.length ? `${formatNumber(displayedCount)} de ${formatNumber(visible.length)} produtos${displayedCount < visible.length ? " · role para ver mais" : " · todos carregados"}` : "Cada concorrente tem sua própria tabela."}</span><small>Diferença = preço XP menos preço da {active.name}. Cada qualidade XP tem seu próprio resultado. Dados nesta sessão.</small></footer>
      </div>
    </section>
  </div>;
}
