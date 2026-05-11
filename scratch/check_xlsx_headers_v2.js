
import XLSX from "xlsx";
import fs from "node:fs/promises";

async function checkHeaders() {
  const filePath = "C:\\Users\\Felipe\\Dropbox\\XP SALDO TEMPORARIO\\SALDO VENDAS - 月出单 XP 08.05.xlsx";
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = "RESUMO";
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log("First 15 Headers:", json[0].slice(0, 15));
    
    // Check if 'COD' exists in the headers
    const headers = json[0];
    const codIndex = headers.indexOf('COD');
    console.log("COD Index:", codIndex);
    
    // Check for "RESUMO" sheet case sensitivity
    console.log("Sheet names:", workbook.SheetNames);
    
  } catch (e) {
    console.error("Error:", e.message);
  }
}

checkHeaders();
