import type { MessageAutomation, SegmentDefinition } from "@olist-crm/shared";

export const REACTIVATION_PHONE = "5511911279702";
export const REACTIVATION_PRESET = "lili-inactivity-v1";
export const REACTIVATION_STAGES = [
  {
    days: 30, maxDays: 59,
    message: "Oi {nome}, tudo bem? Como estão as vendas por aí? 💙\nQual modelo está girando mais pra você hoje? Me passa 2 ou 3 que eu vejo em quais consigo te oferecer um desconto maior.\nAcho que tem uma boa oportunidade de melhorar sua margem nessa próxima reposição. Vamos olhar juntos? 😉",
  },
  {
    days: 60, maxDays: 89,
    message: "Oi {nome}! Faz um tempinho que não fazemos negócio juntos! 💙\nQueria ver uma oportunidade com você: quais peças você mais compra hoje e quanto de lucro elas estão te deixando?\nMe passa os modelos que mais giram aí, que eu vejo em quais conseguimos uma condição especial pra essa parceria ficar ainda mais interessante pra você. 😉",
  },
  {
    days: 90, maxDays: null,
    message: "Oi {nome}, tudo bem?  🥰\nNão podemos perder um cliente como você! 💙\nMe avisa quando posso te ligar rapidinho. Tenho uma notícia muito boa da XP pra te contar, mas me pediram pra passar só por ligação 🤭📞",
  },
] as const;

export function isReactivationPreset(automation: Pick<MessageAutomation, "flowDefinition">) {
  return automation.flowDefinition.reactivationPreset === REACTIVATION_PRESET;
}

export function reactivationStage(definition: SegmentDefinition) {
  const days = definition.minDaysInactive;
  const maxDays = REACTIVATION_STAGES.find((item) => item.days === days)?.maxDays ?? null;
  if (days === undefined || !Number.isInteger(days) || days < 1 || days > 3650 ||
      (definition.maxDaysInactive != null && definition.maxDaysInactive !== maxDays)) {
    throw new Error("Informe um dia de inatividade valido entre 1 e 3650.");
  }
  return { days, maxDays };
}

export function reactivationEventKey(stageDays: number, purchaseDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) throw new Error("Data da ultima compra invalida.");
  return `lili-inactivity:${stageDays}:purchase:${purchaseDate}`;
}

export function reactivationCustomerName(value: string) {
  return value.replace(/^\s*(?:(?:CL|KH|LJ)\d+)\s*[-–—:]?\s*/i, "").trim() || "cliente";
}

export function reactivationIdentityConflict(customerCode: string | null, customerName: string, groupCode: string | null) {
  const stored = /^(?:CL|KH|LJ)\d+$/i.test(customerCode ?? '') ? customerCode!.toUpperCase() : null;
  const named = customerName.match(/^\s*((?:CL|KH|LJ)\d+)\b/i)?.[1]?.toUpperCase();
  return new Set([stored, named, groupCode?.toUpperCase()].filter(Boolean)).size > 1;
}

export function reactivationDispatchReason(input: {
  expectedPurchase: string | undefined;
  actualPurchase: string | null;
  daysInactive: number | null;
  minDays: number;
  maxDays: number | null;
  jid: string;
  groupMatches: boolean;
  senderPhone: string;
  senderReady: boolean;
  identityConflict?: boolean;
}) {
  if (!input.senderReady || input.senderPhone.replace(/\D/g, "") !== REACTIVATION_PHONE) return "A instancia Lili Assistente esta indisponivel ou o numero foi alterado.";
  if (!/^\d+(?:-\d+)?@g\.us$/.test(input.jid) || !input.groupMatches) return "Grupo sem vinculo confirmado com este cliente.";
  if (input.identityConflict) return "Codigo do cliente diverge do nome ou do grupo. Revise o vinculo antes de enviar.";
  if (!input.expectedPurchase || input.actualPurchase !== input.expectedPurchase) return "Cliente recomprou ou a ultima compra foi atualizada.";
  if (input.daysInactive === null || input.daysInactive < input.minDays || (input.maxDays !== null && input.daysInactive > input.maxDays)) return "Cliente saiu da faixa de inatividade.";
  return null;
}
