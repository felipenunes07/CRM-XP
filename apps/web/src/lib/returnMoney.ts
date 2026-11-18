export function centsFromInput(raw:string){
 const match=/^(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(raw.trim());
 if(!match)throw Error('Informe o valor com até duas casas decimais, sem separador de milhar');
 const cents=Number(match[1])*100+Number((match[2]??'').padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<=0||cents>1000000000000)throw Error('Valor fora do intervalo permitido');return cents;
}
