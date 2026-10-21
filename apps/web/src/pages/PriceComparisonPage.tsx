import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AlertTriangle, FileUp, Plus, Search, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { indexCatalog, matchCatalog, normalise, type CompetitorItem, type PartKind } from "./priceComparison.helpers";

type Filter = "all" | "above" | "better" | "review" | "missing";
type Supplier = { id: string; name: string; fileName: string; items: CompetitorItem[]; overrides: Record<string, string> };

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([{ id: "uuf", name: "UUF", fileName: "", items: [], overrides: {} }]);
  const [activeId, setActiveId] = useState("uuf");
  const [adding, setAdding] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [margin, setMargin] = useState(() => {
    const saved = Number(globalThis.localStorage?.getItem("xpcrm-price-comparison-margin") ?? 5);
    return Number.isFinite(saved) && saved >= 0 ? saved : 5;
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<PartKind | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const catalogQuery = useQuery({ queryKey: ["inventory-price-catalog"], queryFn: () => api.inventoryPriceCatalog(token!), enabled: Boolean(token) });
  const catalog = catalogQuery.data?.items ?? [];
  const active = suppliers.find((supplier) => supplier.id === activeId)!;
  const catalogIndex = useMemo(() => indexCatalog(catalog), [catalog]);
  useEffect(() => { globalThis.localStorage?.setItem("xpcrm-price-comparison-margin", String(margin)); }, [margin]);
  useEffect(() => { setPage(1); }, [filter, kind, search, activeId]);

  const matches = useMemo(() => active.items.map((item) => {
    const match = matchCatalog(item, catalogIndex);
    const override = active.overrides[item.id];
    const selected = override !== undefined ? match.candidates.find((xp) => xp.sku === override) ?? null : match.automatic;
    return { item, ...match, selected, manual: Boolean(override) };
  }), [active, catalogIndex]);
  const rows = matches.map((row) => {
    const target = row.item.price + margin;
    const difference = row.selected ? row.selected.price - target : null;
    const status: Filter = !row.selected ? row.candidates.length ? "review" : "missing" : difference! > 0 ? "above" : "better";
    return { ...row, target, difference, status };
  });
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "Todos" }, { id: "above", label: "XP acima" }, { id: "better", label: "XP no alvo" },
    { id: "review", label: "Revisar vínculo" }, { id: "missing", label: "Sem equivalente" },
  ];
  const visible = rows.filter((row) => (filter === "all" || row.status === filter) && (kind === "all" || row.kind === kind) && normalise(`${row.item.name} ${row.item.code} ${row.selected?.model ?? ""}`).includes(normalise(search)));
  const pageCount = Math.max(1, Math.ceil(visible.length / 50));
  const currentPage = Math.min(page, pageCount);
  const kinds: PartKind[] = ["Frontal", "Dock de carga", "Bateria", "Outras peças"];

  function addSupplier(event: React.FormEvent) {
    event.preventDefault();
    const name = supplierName.trim();
    if (!name) return;
    const existing = suppliers.find((supplier) => normalise(supplier.name) === normalise(name));
    if (existing) { setActiveId(existing.id); }
    else {
      const id = crypto.randomUUID();
      setSuppliers((current) => [...current, { id, name, fileName: "", items: [], overrides: {} }]);
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
      setSuppliers((current) => current.map((supplier) => supplier.id === importingId ? { ...supplier, fileName: file.name, items, overrides: {} } : supplier));
      setFilter("all"); setKind("all"); setSearch(""); setPage(1);
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
        <div className="comparison-context"><span><strong>{active.name}</strong>{active.fileName ? <span title={active.fileName}> · {active.fileName}</span> : " · Importe uma tabela para começar"}</span><label>Margem sobre concorrente <span>R$</span><input aria-label="Margem em reais" type="number" min="0" step="0.5" value={margin} onChange={(event) => setMargin(Math.max(0, Number(event.target.value) || 0))} /></label></div>
        {error ? <div role="alert" className="comparison-alert"><AlertTriangle size={16} />{error}</div> : null}
        {catalogQuery.isError ? <div role="alert" className="comparison-alert">Não foi possível carregar o estoque XP.<button onClick={() => void catalogQuery.refetch()}>Tentar novamente</button></div> : null}
        <div className="comparison-toolbar">
          <label className="comparison-search"><Search size={16} /><input aria-label="Buscar modelo ou código" placeholder="Buscar modelo ou código" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select aria-label="Tipo de peça" value={kind} onChange={(event) => setKind(event.target.value as PartKind | "all")}><option value="all">Todas as peças</option>{kinds.map((value) => <option key={value}>{value}</option>)}</select>
          <span className="comparison-rule">Alvo XP = concorrente + {formatCurrency(margin)}</span>
        </div>
        <div className="comparison-filters" aria-label="Situação dos preços">{filters.map(({ id, label }) => <button type="button" key={id} aria-pressed={filter === id} className={`comparison-filter ${id}`} onClick={() => setFilter(id)}>{label}<b>{formatNumber(id === "all" ? rows.length : rows.filter((row) => row.status === id).length)}</b></button>)}</div>

        {!active.items.length ? <div className="comparison-empty"><FileUp size={28} /><h3>Adicione a tabela de {active.name}</h3><p>Importe Excel ou CSV com produto e preço.<br />Para outra empresa, use “Adicionar concorrente”.</p><button type="button" className="comparison-primary" disabled={isImporting} onClick={() => fileInput.current?.click()}>Selecionar planilha</button></div> : catalogQuery.isLoading ? <div className="comparison-empty" role="status">Carregando os preços XP…</div> : <div className="comparison-table-scroll"><table className="comparison-table"><thead><tr><th>Produto · {active.name}</th><th>Equivalente XP</th><th>{active.name}</th><th>Preço XP</th><th>Alvo XP</th><th>Resultado</th></tr></thead><tbody>{visible.slice((currentPage - 1) * 50, currentPage * 50).map((row) => <tr key={row.item.id}>
          <td><strong>{row.item.name}</strong><small><span className={`comparison-kind ${row.kind === "Dock de carga" ? "dock" : ""}`}>{row.kind}</span>{row.item.code}</small></td>
          <td>{row.selected ? <><strong>{row.selected.model}</strong><small>{row.selected.quality ?? "Qualidade não informada"} · {formatNumber(row.selected.stockQuantity)} em estoque</small></> : <span className="comparison-muted">{row.candidates.length ? "Confirme o equivalente e a qualidade" : "Sem peça do mesmo tipo e modelo"}</span>}
            {row.candidates.length ? <select aria-label={`Equivalente XP para ${row.item.name}`} value={row.selected?.sku ?? ""} onChange={(event) => { const sku = event.target.value; setSuppliers((current) => current.map((supplier) => supplier.id === activeId ? { ...supplier, overrides: { ...supplier.overrides, [row.item.id]: sku } } : supplier)); }}><option value="">Não comparar este item</option>{row.candidates.map((xp) => <option key={xp.sku} value={xp.sku}>{xp.model} · {xp.quality ?? "Sem qualidade"} · {xp.sku}</option>)}</select> : null}
          </td>
          <td className="comparison-money">{formatCurrency(row.item.price)}</td><td className="comparison-money">{row.selected ? formatCurrency(row.selected.price) : "—"}</td><td className="comparison-money comparison-muted">{formatCurrency(row.target)}</td>
          <td>{row.difference !== null ? <span className={`comparison-result ${row.status}`}>{row.difference > 0 ? "+" : row.difference < 0 ? "−" : ""}{formatCurrency(Math.abs(row.difference))}<small>{row.difference > 0 ? "acima do alvo" : "dentro do alvo"}</small></span> : <span className={`comparison-result ${row.status}`}>{row.status === "review" ? "Revisar vínculo" : "Sem comparação"}</span>}</td>
        </tr>)}{!visible.length ? <tr><td colSpan={6} className="comparison-no-results">Nenhum produto neste filtro. Ajuste a busca ou selecione “Todos”.</td></tr> : null}</tbody></table></div>}
        <footer className="comparison-footer"><span>{active.items.length ? `${formatNumber(visible.length)} produtos · página ${currentPage} de ${pageCount}` : "Cada concorrente tem sua própria tabela."}</span>{pageCount > 1 ? <div><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</button></div> : null}<small>Dados nesta sessão · importar novamente atualiza apenas {active.name}.</small></footer>
      </div>
    </section>
  </div>;
}
