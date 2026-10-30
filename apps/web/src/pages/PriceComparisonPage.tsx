import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AlertTriangle, Download, FileUp, History, Plus, RefreshCw, Search, X } from "lucide-react";
import { parsePriceRows, type PriceSupplier } from "@olist-crm/shared";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { compareCatalogItem, comparisonNote, compatibleFrame, hasFrame, supplierFrame, indexCatalog, normalise, type CatalogItem, type CompetitorItem, type MissingReason, type PartKind } from "./priceComparison.helpers";

type Filter = "all" | "above" | "better" | "matched" | "missing" | "unavailable";
const defaultSuppliers: PriceSupplier[] = [
  { id: "uuf", name: "UUF", sourceKind: "upload", sourceUrl: null },
  { id: "fff", name: "FFF", sourceKind: "fff", sourceUrl: "https://fffpecas.com.br" },
  { id: "feihu", name: "Feihu", sourceKind: "feihu", sourceUrl: "https://us.wps.com/l/cbEaatsWAN2LaU3z" },
  { id: "skytech", name: "SkyTech", sourceKind: "skytech", sourceUrl: "https://docs.google.com/spreadsheets/d/1vVY6oEatrgRmMxWTAAfDeQmCjQYGHFosSCRxnGPi6Lc/htmlview#gid=1414860671" },
].map((supplier) => ({ ...supplier, autoSync: supplier.id === "fff", lastAttemptAt: null, lastSuccessAt: null, lastError: null, latestSnapshotId: null, latestCapturedAt: null, itemCount: 0 })) as PriceSupplier[];
const dateLabel = (date: string) => new Date(date).toLocaleString("pt-BR");
function saveDownload(bytes: BlobPart, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes]));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const missingLabels: Record<MissingReason, string> = { "out-of-stock": "Só sem estoque", frame: "Aro diferente", brand: "Revisar marca", model: "Modelo ou peça sem vínculo" };
type ComparisonRow = { item: CompetitorItem; kind: PartKind; quality: string | null; candidates: CatalogItem[]; totalCandidates: number; missingReason?: MissingReason | null };

export function PriceComparisonRows({ row, inStockOnly = true, supplierName = "UUF", onHistory }: { row: ComparisonRow; inStockOnly?: boolean; supplierName?: string; onHistory?: (item: CompetitorItem) => void }) {
  const available = row.candidates.filter((xp) => (!inStockOnly || xp.stockQuantity > 0) && compatibleFrame(row.item.name, xp.model));
  const offers: (CatalogItem | null)[] = available.length ? available : [null];
  return <Fragment>{offers.map((xp, index) => {
    const difference = xp ? xp.price - row.item.price : null;
    return <tr key={xp?.sku ?? "missing"} className={`comparison-offer ${index === 0 ? "comparison-group-start" : ""}`}>
      {index === 0 ? <td rowSpan={offers.length} className="comparison-competitor"><strong>{row.item.name}</strong><small><span className={`comparison-kind ${row.kind === "Dock de carga" ? "dock" : ""}`}>{row.kind}</span>{row.item.code}</small>{row.kind === "Frontal" ? <small><span className={`comparison-frame ${hasFrame(row.item.name) ? "with-frame" : "without-frame"}`}>{supplierFrame(row.item.name) === null ? "Aro não informado" : hasFrame(row.item.name) ? "Com aro" : "Sem aro"}</span></small> : null}<small>{row.quality ? `Qualidade: ${row.quality}` : "Qualidade não informada"}</small><small>{formatNumber(available.length)} opções XP disponíveis</small>{onHistory ? <button type="button" className="comparison-history-button" onClick={() => onHistory(row.item)}><History size={12} />Histórico de preço</button> : null}</td> : null}
      <td>{xp ? <><strong>{xp.model}</strong><small><span className="comparison-quality">{xp.quality ?? "Sem qualidade informada"}</span>{row.kind === "Frontal" ? <span className={`comparison-frame ${hasFrame(xp.model) ? "with-frame" : "without-frame"}`}>{hasFrame(xp.model) ? "Com aro" : "Sem aro"}</span> : null}</small><small>{xp.sku} · <span className={xp.stockQuantity > 0 ? "comparison-stock-available" : "comparison-stock-empty"}>{xp.stockQuantity > 0 ? `${formatNumber(xp.stockQuantity)} em estoque` : "Sem estoque"}</span></small><small>{index === 0 ? "Mais semelhante · " : ""}{comparisonNote(row.item, xp)}</small></> : <span className="comparison-muted">{row.missingReason ? missingLabels[row.missingReason] : "Nenhum equivalente XP"}</span>}</td>
      <td className="comparison-money comparison-supplier-price">{formatCurrency(row.item.price)}</td>
      <td className="comparison-money">{xp ? formatCurrency(xp.price) : "—"}</td>
      <td>{difference !== null ? <span className={`comparison-result ${difference > 0 ? "above" : "better"}`}>{difference > 0 ? "+" : difference < 0 ? "−" : ""}{formatCurrency(Math.abs(difference))}<small>{difference > 0 ? `mais caro que ${supplierName}` : difference < 0 ? `mais barato que ${supplierName}` : `mesmo preço da ${supplierName}`}</small></span> : "—"}</td>
    </tr>;
  })}</Fragment>;
}

export function parseSheet(file: File): Promise<CompetitorItem[]> {
  return file.arrayBuffer().then((buffer) => {
    const csv = file.name?.toLowerCase().endsWith(".csv");
    const workbook = XLSX.read(csv ? new TextDecoder("utf-8").decode(buffer) : buffer, { type: csv ? "string" : "array", raw: true });
    const records = workbook.SheetNames.flatMap((name) => {
      const sheet = workbook.Sheets[name];
      return sheet ? parsePriceRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" })) : [];
    });
    if (!records.length) throw new Error("Não identifiquei o cabeçalho ou dados válidos. Use Produto e Preço (ou Preço mínimo).");
    return records;
  });
}

export function PriceComparisonPage() {
  const { token } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ["price-suppliers", token], queryFn: () => api.priceSuppliers(token!), enabled: Boolean(token) });
  const suppliers = suppliersQuery.data?.suppliers ?? defaultSuppliers;
  const [selectedVersion, setSelectedVersion] = useState<{ supplierId: string; id: string } | null>(null);
  const [historyItem, setHistoryItem] = useState<CompetitorItem | null>(null);
  useEffect(() => { if (historyItem) historyDialog.current?.showModal(); }, [historyItem]);
  const [activeId, setActiveId] = useState("uuf");
  const [adding, setAdding] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<PartKind | "all">("all");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [error, setError] = useState("");
  const catalogQuery = useQuery({ queryKey: ["inventory-price-catalog"], queryFn: () => api.inventoryPriceCatalog(token!), enabled: Boolean(token) });
  const catalog = catalogQuery.data?.items ?? [];
  const active = suppliers.find((supplier) => supplier.id === activeId) ?? suppliers[0]!;
  const snapshotsQuery = useQuery({ queryKey: ["price-snapshots", token, active.id], queryFn: () => api.priceSnapshots(token!, active.id), enabled: Boolean(token) });
  const snapshots = snapshotsQuery.data?.snapshots ?? [];
  const versionId = selectedVersion?.supplierId === active.id ? selectedVersion.id : active.latestSnapshotId ?? "";
  const versionQuery = useQuery({ queryKey: ["price-snapshot", token, active.id, versionId], queryFn: () => api.priceSnapshot(token!, active.id, versionId), enabled: Boolean(token && versionId) });
  const version = versionQuery.data;
  const items = version?.items ?? [];
  const historyQuery = useQuery({ queryKey: ["supplier-product-history", token, active.id, historyItem?.code, historyItem?.name], queryFn: () => api.supplierProductHistory(token!, active.id, historyItem!.code, historyItem!.name), enabled: Boolean(token && historyItem) });
  async function refreshSaved(supplierId: string, snapshotId?: string) {
    if (snapshotId) setSelectedVersion({ supplierId, id: snapshotId });
    await queryClient.invalidateQueries({ queryKey: ["price-suppliers", token] });
    await queryClient.invalidateQueries({ queryKey: ["price-snapshots", token, supplierId] });
    await queryClient.invalidateQueries({ queryKey: ["supplier-product-history", token, supplierId] });
  }
  const catalogIndex = useMemo(() => indexCatalog(catalog, inStockOnly), [catalog, inStockOnly]);
  const fullCatalogIndex = useMemo(() => indexCatalog(catalog, false), [catalog]);
  useEffect(() => {
    setVisibleCount(20);
  }, [filter, kind, search, inStockOnly, activeId, items]);

  const matches = useMemo(() => items.map((item) => compareCatalogItem(item, catalogIndex, fullCatalogIndex)), [items, catalogIndex, fullCatalogIndex]);
  const rows = matches;
  const missingCounts = rows.reduce((counts, row) => {
    if (row.missingReason) counts[row.missingReason]++;
    return counts;
  }, { "out-of-stock": 0, frame: 0, brand: 0, model: 0 } as Record<MissingReason, number>);
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "Todos" }, { id: "above", label: "XP mais caro" }, { id: "better", label: "XP igual ou menor" },
    { id: "matched", label: "Tem equivalente XP" }, { id: "unavailable", label: "Equivalente sem estoque" }, { id: "missing", label: "Sem equivalente XP" },
  ];
  const inFilter = (row: typeof rows[number], value: Filter) => value === "all" || (value === "matched" && row.totalCandidates > 0) || (value === "unavailable" && row.totalCandidates > 0 && !row.candidates.some((xp) => xp.stockQuantity > 0)) || (value === "missing" && row.totalCandidates === 0) || (value === "above" && row.candidates.some((xp) => xp.price > row.item.price)) || (value === "better" && row.candidates.some((xp) => xp.price <= row.item.price));
  const visible = rows.filter((row) => inFilter(row, filter) && (kind === "all" || row.kind === kind) && normalise(`${row.item.name} ${row.item.code} ${row.candidates.map((xp) => `${xp.model} ${xp.quality ?? ""} ${xp.sku}`).join(" ")}`).includes(normalise(search)));
  const displayedCount = Math.min(visibleCount, visible.length);
  const kinds: PartKind[] = ["Frontal", "Dock de carga", "Bateria", "Outras peças"];
  useEffect(() => {
    if (visibleCount >= visible.length) return;
    const loadMore = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 500) setVisibleCount((count) => Math.min(count + 20, visible.length));
    };
    window.addEventListener("scroll", loadMore, { passive: true });
    loadMore();
    return () => window.removeEventListener("scroll", loadMore);
  }, [visible.length, visibleCount]);

  async function addSupplier(event: React.FormEvent) {
    event.preventDefault();
    const name = supplierName.trim();
    if (!name || !token || isImporting) return;
    setIsImporting(true); setError("");
    try {
      const saved = await api.createPriceSupplier(token, name);
      await refreshSaved(saved.id);
      setActiveId(saved.id); setAdding(false); setSupplierName("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o fornecedor."); }
    finally { setIsImporting(false); }
  }

  async function syncSource() {
    if (!token) return;
    const supplierId = active.id;
    setIsImporting(true); setError("");
    try { const saved = await api.syncPriceSupplier(token, supplierId); await refreshSaved(supplierId, saved.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha na coleta."); await refreshSaved(supplierId); }
    finally { setIsImporting(false); }
  }

  async function downloadOriginal() {
    if (!token || !versionId) return;
    try {
      const file = await api.downloadPriceSnapshot(token, active.id, versionId);
      const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
      saveDownload(bytes, file.fileName);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao baixar arquivo."); }
  }

  function exportComparison() {
    const data = visible.flatMap((row) => (row.candidates.length ? row.candidates : [null]).map((xp) => ({
      Fornecedor: active.name, "Data da tabela": version?.capturedAt ?? "", Código: row.item.code, Produto: row.item.name,
      "Preço fornecedor": row.item.price, "SKU XP": xp?.sku ?? "", "Produto XP": xp?.model ?? "", "Qualidade XP": xp?.quality ?? "",
      "Estoque XP": xp?.stockQuantity ?? "", "Preço XP": xp?.price ?? "", "Diferença XP - fornecedor": xp ? Number((xp.price - row.item.price).toFixed(2)) : "",
      Observação: xp ? comparisonNote(row.item, xp) : row.missingReason ? missingLabels[row.missingReason] : "",
    })));
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(data);
    sheet["!cols"] = [14, 28, 16, 65, 20, 16, 65, 22, 16, 20, 25, 80].map((wch) => ({ wch }));
    if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
    for (let row = 1; row <= data.length; row++) {
      for (const column of [4, 9, 10]) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell?.t === "n") cell.z = '"R$" #,##0.00';
      }
    }
    XLSX.utils.book_append_sheet(book, sheet, "Comparação");
    XLSX.writeFile(book, `comparacao-${active.name}.xlsx`);
  }

  async function handleFile(file?: File) {
    if (!file || !token) return;
    const importingId = active.id;
    setError(""); setIsImporting(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("O arquivo deve ter até 20 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      const saved = await api.importPriceSnapshot(token, importingId, file.name, base64);
      await refreshSaved(importingId, saved.id);
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
      <button type="button" className="comparison-primary" disabled={isImporting || suppliersQuery.isError} onClick={() => fileInput.current?.click()}><FileUp size={16} />{isImporting ? "Importando…" : "Importar planilha"}</button>
      <input ref={fileInput} type="file" hidden aria-label="Selecionar planilha do concorrente" accept=".xlsx,.xls,.csv" onChange={(event) => void handleFile(event.target.files?.[0])} />
    </header>

    <section className="comparison-surface">
      <div className="comparison-suppliers">
        <div role="tablist" aria-label="Concorrentes">{suppliers.map((supplier) => <button role="tab" aria-selected={activeId === supplier.id} aria-controls="comparison-content" id={`supplier-${supplier.id}`} key={supplier.id} type="button" onClick={() => { setActiveId(supplier.id); setHistoryItem(null); setError(""); }}><span>{supplier.name}</span><small>{supplier.itemCount ? formatNumber(supplier.itemCount) : "Sem tabela"}</small></button>)}</div>
        <button type="button" className="comparison-add" onClick={() => setAdding(true)}><Plus size={15} />Adicionar concorrente</button>
      </div>
      {adding ? <form className="comparison-add-form" onSubmit={addSupplier}><label htmlFor="supplier-name">Nome do concorrente</label><input id="supplier-name" autoFocus maxLength={50} placeholder="Ex.: UUF, fornecedor..." value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /><button className="comparison-primary" disabled={!supplierName.trim() || isImporting}>Adicionar</button><button type="button" aria-label="Cancelar" onClick={() => setAdding(false)}><X size={16} /></button></form> : null}

      <div id="comparison-content" role="tabpanel" aria-labelledby={`supplier-${activeId}`}>
        <div className="comparison-context"><span><strong>{active.name}</strong>{version ? <span title={version.fileName}> · {version.fileName} · {dateLabel(version.capturedAt)}</span> : " · Importe uma tabela para começar"}</span></div>
        <div className="comparison-history-toolbar">
          <label>Histórico de tabelas <select aria-label="Versão da tabela" value={versionId} onChange={(event) => setSelectedVersion({ supplierId: active.id, id: event.target.value })}><option value="" disabled>Sem importações</option>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{dateLabel(snapshot.capturedAt)} · {snapshot.fileName} · {snapshot.itemCount} itens</option>)}</select></label>
          <button type="button" disabled={!versionId} onClick={() => void downloadOriginal()}><Download size={14} />Arquivo original</button>
          <button type="button" disabled={!items.length || catalogQuery.isError || catalogQuery.isLoading} onClick={exportComparison}><Download size={14} />Exportar comparação Excel</button>
          {active.sourceKind !== "upload" ? <><a href={active.sourceUrl ?? "#"} target="_blank" rel="noreferrer">Abrir fonte</a><button type="button" disabled={isImporting || !active.autoSync} onClick={() => void syncSource()}><RefreshCw size={14} />{isImporting ? "Atualizando…" : "Coletar agora"}</button></> : null}
        </div>
        <p className="comparison-schedule">{!active.autoSync ? "Importe uma nova planilha a cada semana ou mês. Cada envio fica salvo no histórico." : `Coleta automática a cada 7 dias pelo servidor. Última coleta válida: ${active.lastSuccessAt ? dateLabel(active.lastSuccessAt) : "ainda não realizada"}.`}</p>
        {active.lastError ? <div role="alert" className="comparison-alert">{active.lastError} A última tabela válida foi preservada. Você também pode importar o Excel.</div> : null}
        {suppliersQuery.isError || snapshotsQuery.isError || versionQuery.isError ? <div role="alert" className="comparison-alert">Não foi possível carregar o histórico salvo. Recarregue para tentar novamente.</div> : null}
        {suppliersQuery.isLoading || snapshotsQuery.isLoading || (versionId && versionQuery.isLoading) ? <p role="status" className="comparison-schedule">Carregando tabelas salvas…</p> : null}
        {error ? <div role="alert" className="comparison-alert"><AlertTriangle size={16} />{error}</div> : null}
        {catalogQuery.isError ? <div role="alert" className="comparison-alert">Não foi possível carregar o estoque XP.<button onClick={() => void catalogQuery.refetch()}>Tentar novamente</button></div> : null}
        <div className="comparison-toolbar">
          <label className="comparison-search"><Search size={16} /><input aria-label="Buscar modelo ou código" placeholder="Buscar modelo ou código" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select aria-label="Tipo de peça" value={kind} onChange={(event) => setKind(event.target.value as PartKind | "all")}><option value="all">Todas as peças</option>{kinds.map((value) => <option key={value}>{value}</option>)}</select>
          <label className="comparison-stock-filter"><input aria-label="Somente peças em estoque" type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />Somente peças em estoque</label>
          <span className="comparison-availability">Aro informado respeitado · Mais semelhantes primeiro</span>
        </div>
        <div className="comparison-filters" aria-label="Situação dos preços">{filters.map(({ id, label }) => <button type="button" key={id} aria-pressed={filter === id} className={`comparison-filter ${id}`} onClick={() => setFilter(id)}>{label}<b>{formatNumber(rows.filter((row) => inFilter(row, id)).length)}</b></button>)}</div>
        {filter === "missing" && items.length && !catalogQuery.isLoading && !catalogQuery.isError ? <div className="comparison-missing-breakdown" aria-label="Motivos sem equivalente XP">{(Object.entries(missingLabels) as [MissingReason, string][]).filter(([reason]) => reason !== "out-of-stock").map(([reason, label]) => <span key={reason}>{label} <b>{formatNumber(missingCounts[reason])}</b></span>)}</div> : null}

        {!items.length ? <div className="comparison-empty"><FileUp size={28} /><h3>Adicione a tabela de {active.name}</h3><p>Importe Excel ou CSV com produto e preço.<br />Para outra empresa, use “Adicionar concorrente”.</p><button type="button" className="comparison-primary" disabled={isImporting} onClick={() => fileInput.current?.click()}>Selecionar planilha</button></div> : catalogQuery.isLoading ? <div className="comparison-empty" role="status">Carregando os preços XP…</div> : <div className="comparison-table-scroll" role="region" aria-label="Comparação de preços com rolagem contínua"><table className="comparison-table"><thead><tr><th>Produto · {active.name}</th><th>Opções XP · todas as qualidades</th><th>{active.name}</th><th>Preço XP</th><th>Diferença</th></tr></thead><tbody>{visible.slice(0, visibleCount).map((row) => <PriceComparisonRows key={row.item.id} row={row} inStockOnly={inStockOnly} supplierName={active.name} onHistory={setHistoryItem} />)}{!visible.length ? <tr><td colSpan={5} className="comparison-no-results">Nenhum produto neste filtro. Ajuste a busca ou selecione “Todos”.</td></tr> : null}</tbody></table></div>}
        {historyItem ? <dialog ref={historyDialog} onCancel={() => setHistoryItem(null)} className="comparison-product-history" aria-label="Histórico do produto"><div><h3>Histórico · {historyItem.name}</h3><button type="button" aria-label="Fechar histórico" onClick={() => setHistoryItem(null)}><X size={16} /></button></div><p>Mesmo código do fornecedor; em arquivos sem código, usamos a descrição igual. Cada preço é o observado na data da coleta.</p>{historyQuery.isLoading ? <p role="status">Carregando histórico…</p> : historyQuery.isError ? <p role="alert">Não foi possível carregar o histórico.</p> : <table><thead><tr><th>Coleta</th><th>Preço</th><th>Arquivo</th></tr></thead><tbody>{historyQuery.data?.points.map((point, index) => <tr key={`${point.snapshotId}-${index}`}><td>{dateLabel(point.capturedAt)}</td><td>{formatCurrency(point.price)}</td><td>{point.fileName}</td></tr>)}</tbody></table>}</dialog> : null}
        <footer className="comparison-footer"><span role="status">{items.length ? `${formatNumber(displayedCount)} de ${formatNumber(visible.length)} produtos${displayedCount < visible.length ? " · role para ver mais" : " · todos carregados"}` : "Cada concorrente tem sua própria tabela."}</span><small>Diferença = preço XP menos preço da {active.name}. Cada qualidade XP tem seu próprio resultado. Tabelas salvas no histórico. Preços XP refletem o catálogo atual.</small></footer>
      </div>
    </section>
  </div>;
}
