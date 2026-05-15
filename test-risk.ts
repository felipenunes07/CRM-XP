import { detectWhatsappMessageRisk } from "./apps/api/src/modules/whatsapp/whatsappMonitorCore.js";

console.log("Bom diaa", detectWhatsappMessageRisk("Bom diaa"));
console.log("Si ta certo", detectWhatsappMessageRisk("Si ta certo"));
console.log("Frete pra 35630306", detectWhatsappMessageRisk("Frete pra 35630306"));
console.log("Pode deixar aviso sim amigo 🤩", detectWhatsappMessageRisk("Pode deixar aviso sim amigo 🤩"));
console.log("-", detectWhatsappMessageRisk("-"));
