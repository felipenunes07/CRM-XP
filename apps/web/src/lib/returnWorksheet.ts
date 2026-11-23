import {RETURN_OUTCOME_LABELS,type ReturnItem,type ReturnItemInput,type ReturnItemChange} from '@olist-crm/shared';
export type ItemFields=Omit<ReturnItemInput,'version'>;
export interface SheetRow {id:string;base:ItemFields|null;fields:ItemFields;removed:boolean}
export const FIELD_LABELS:Record<keyof ItemFields,string>={model:'Modelo',sku:'SKU',frame:'Aro',color:'Cor',quantity:'Quantidade',manufacturer:'Fábrica',seal:'Selo',reasonCode:'Motivo selecionado',outcome:'Resultado',testNotes:'Teste realizado',reason:'Motivo / observação',customerReportedDefect:'Defeito informado pelo cliente',customerEvidenceReference:'Vídeo ou documento do cliente',testFinding:'Constatação no teste',routingOverride:'Autorização de exceção',factoryCode:'Código da fábrica'};
export function itemFields(item?:Partial<ReturnItem>):ItemFields{return {model:item?.model??'',sku:item?.sku??'',frame:item?.frame??'',color:item?.color??'',quantity:item?.quantity??1,manufacturer:item?.manufacturer??'',seal:item?.seal??'',outcome:item?.outcome??'pending',reasonCode:item?.reasonCode??'',testNotes:item?.testNotes??'',reason:item?.reason??'',customerReportedDefect:item?.customerReportedDefect??'',customerEvidenceReference:item?.customerEvidenceReference??'',testFinding:item?.testFinding??'not_tested',routingOverride:item?.routingOverride??''};}
export const sameFields=(a:ItemFields|null,b:ItemFields|null)=>JSON.stringify(a)===JSON.stringify(b);
export const rowFromItem=(item:ReturnItem):SheetRow=>({id:item.id,base:itemFields(item),fields:itemFields(item),removed:false});
export const emptyRow=():SheetRow=>({id:crypto.randomUUID(),base:null,fields:itemFields(),removed:false});
export function rowChanged(row:SheetRow){return row.base?row.removed||!sameFields(row.base,row.fields):!row.removed&&!sameFields(row.fields,itemFields());}
export function sheetChanges(rows:SheetRow[]):ReturnItemChange[]{return rows.filter(rowChanged).map(r=>r.removed?{kind:'remove',id:r.id}:{kind:r.base?'update':'add',id:r.id,fields:r.fields});}
export function rowErrors(row:SheetRow):string[]{
 if(row.removed||!rowChanged(row))return[];const f=row.fields,errors:string[]=[];
 if(!Number.isInteger(f.quantity)||f.quantity<1||f.quantity>100000)errors.push('Informe uma quantidade inteira positiva.');
 if(!['pending','review'].includes(f.outcome)){if(!f.manufacturer.trim())errors.push('Escolha a fábrica.');if(!f.model.trim())errors.push('Identifique o modelo.');if(!f.testNotes.trim())errors.push('Registre o teste realizado.');}
 if(['refused','no_defect','resale'].includes(f.outcome)&&!f.reasonCode&&!f.reason.trim())errors.push('Informe o motivo.');return errors;
}
// Excel clipboard text may quote tabs/newlines. Parse text only; never execute formulas.
function clipboardCells(text:string):string[][]{
 if(text.length>200000)throw Error('Cole até 100 linhas por vez.');
 const rows:string[][]=[],row:string[]=[];let cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=c;}
  else if(!quoted&&(c==='\t'||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!=='\t'){if(c==='\r'&&text[i+1]==='\n')i++;rows.push([...row]);row.length=0;}}
  else cell+=c;
 }
 if(quoted)throw Error('Há um texto entre aspas incompleto. Confira a seleção copiada.');
 row.push(cell);rows.push(row);return rows.filter(r=>r.some(v=>v.trim()));
}
const clean=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function pasteSheetRows(text:string):SheetRow[]{
 let cells=clipboardCells(text);if(!cells.length)return[];
 const aliases:Record<string,string>={modelo:'model',descricao:'model',produto:'model',sku:'sku',codigosku:'sku',aro:'frame',cor:'color',quantidade:'quantity',qtd:'quantity',qtde:'quantity',und:'quantity',fabrica:'manufacturer',origem:'manufacturer',selo:'seal',carimbo:'seal',motivo:'reason',obs:'reason',observacao:'reason',resultado:'outcome',teste:'testNotes',testerealizado:'testNotes',troca:'yes',naotroca:'no'};
 const hasHeader=cells[0]!.some(c=>['modelo','sku','descricao'].includes(clean(c)));
 const columns=hasHeader?cells.shift()!.map(c=>aliases[clean(c)]??''):['model','sku','frame','color','quantity','outcome','reason','manufacturer','seal','testNotes'];
 if(cells.length>100)throw Error('Cole até 100 linhas por vez.');
 const outcomes:Record<string,ItemFields['outcome']>={troca:'approved',aprovado:'approved',aprovada:'approved',naotroca:'refused',recusada:'refused',recusado:'refused',analise:'external_analysis',analisefabrica:'external_analysis',revenda:'resale',semdefeito:'no_defect',pendente:'pending',revisao:'review'};
 const result:SheetRow[]=[];
 for(const [index,values] of cells.entries()){
  const quantity=(raw:string)=>{const n=Number(raw.replace(',','.'));if(!Number.isInteger(n)||n<0||n>100000)throw Error(`Linha ${index+1}: confira a quantidade; use um número inteiro positivo.`);return n;};
  const mapped=Object.fromEntries(columns.map((c,n)=>[c,values[n]?.trim()??''])),f=itemFields();
  for(const key of ['model','sku','frame','color','manufacturer','seal','reason','testNotes'] as const)if(mapped[key])f[key]=mapped[key];
  if(mapped.outcome){const raw=mapped.outcome;const outcome=outcomes[clean(raw)]??Object.entries(RETURN_OUTCOME_LABELS).find(([key,label])=>key===raw||clean(label)===clean(raw))?.[0] as ItemFields['outcome']|undefined;if(!outcome)throw Error(`Linha ${index+1}: resultado não reconhecido. Use o nome de uma opção do CRM.`);f.outcome=outcome;}
  if(columns.includes('yes')||columns.includes('no')){
   for(const [column,outcome] of [['yes','approved'],['no','refused']] as const){if(mapped[column]&&quantity(mapped[column])!==0)result.push({...emptyRow(),fields:{...f,quantity:quantity(mapped[column]),outcome}});}
  }else result.push({...emptyRow(),fields:{...f,quantity:mapped.quantity?quantity(mapped.quantity):0}});
 }
 if(!result.length)throw Error('A seleção não contém peças com quantidade para lançar.');
 if(result.length>100)throw Error('A seleção gera mais de 100 linhas. Divida a seleção.');return result;
}
