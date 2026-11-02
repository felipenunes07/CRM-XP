import { writeFile } from "node:fs/promises";
import { pool } from "../db/client.js";
import { prepareLiliReactivation, previewLiliReactivation } from "../modules/crm/reactivationSetupService.js";
import { listMessageAutomations, updateMessageAutomation } from "../modules/crm/automationService.js";
import { isReactivationPreset } from "../modules/crm/reactivationCore.js";
import { reactivationSalesAreFresh, requireReactivationSender } from "../modules/crm/reactivationAudience.js";

async function main() {
  const command = process.argv[2] ?? "preview";
  if (!["prepare", "preview", "activate", "pause"].includes(command)) throw new Error("Use prepare, preview, activate ou pause.");
  if (command === "prepare") await prepareLiliReactivation();
  if (command === "activate" || command === "pause") {
    const rules = (await listMessageAutomations()).filter(isReactivationPreset);
    if (rules.length !== 3) throw new Error("Prepare as tres faixas antes de alterar o agendamento.");
    if (command === "activate") {
      if (!await reactivationSalesAreFresh()) throw new Error("Atualize as vendas antes de ativar a regua.");
      for (const rule of rules) await requireReactivationSender(rule.whatsappInstanceId, true);
    }
    for (const rule of rules) await updateMessageAutomation(rule.id, { ...rule, status: command === "activate" ? "ACTIVE" : "PAUSED" });
  }
  const preview = await previewLiliReactivation();
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0) {
    const destination = process.argv[outputIndex + 1];
    if (!destination) throw new Error("Informe o caminho depois de --output.");
    await writeFile(destination, JSON.stringify(preview, null, 2), "utf8");
  }
  console.log(JSON.stringify({ command, sender: preview.sender, generatedAt: preview.generatedAt,
    stages: preview.stages.map(({ rows, ...stage }) => ({ ...stage, pendingReview: rows.length - stage.ready })) }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha na regua Lili."); process.exitCode = 1; })
  .finally(async () => { await pool.end(); process.exit(); });
