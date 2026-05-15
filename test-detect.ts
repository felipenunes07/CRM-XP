import { detectEventType } from "./apps/api/src/modules/events/eventsService.js";

console.log("Bom diaa", detectEventType("Bom diaa", null));
console.log("Si ta certo", detectEventType("Si ta certo", null));
console.log("Frete pra 35630306", detectEventType("Frete pra 35630306", null));
console.log("Pode deixar aviso sim amigo 🤩", detectEventType("Pode deixar aviso sim amigo 🤩", null));
console.log("-", detectEventType("-", null));
