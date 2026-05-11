
import XLSX from "xlsx";
import fs from "node:fs/promises";

async function checkHeaders() {
  const filePath = "C:\\Users\\Felipe\\Dropbox\\XP SALDO TEMPORARIO\\SALDO VENDAS - 月出单 XP 08.05.xlsx";
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = "RESUMO";
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.log("Sheet 'RESUMO' not found. Available sheets:", workbook.SheetNames);
      return;
    }
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log("Headers:", json[0]);
    console.log("First row:", json[1]);
  } catch (e) {
    console.error("Error:", e.message);
  }
}

checkHeaders();
