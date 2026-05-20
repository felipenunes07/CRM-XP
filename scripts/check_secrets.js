#!/usr/bin/env node
/**
 * Script para verificar se há credenciais hardcoded no código
 * Execute: node scripts/check_secrets.js
 */

const fs = require('fs');
const path = require('path');

// Padrões suspeitos
const patterns = [
  { name: 'PostgreSQL Connection String', regex: /postgresql:\/\/[^:]+:[^@]+@[^\/]+\/\w+/gi },
  { name: 'API Key', regex: /(api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi },
  { name: 'Access Token', regex: /(access[_-]?token|token)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi },
  { name: 'Password', regex: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi },
  { name: 'Secret', regex: /(secret|secret[_-]?key)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi },
  { name: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi },
];

// Diretórios e arquivos a ignorar
const ignoreDirs = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.runtime',
  'coverage',
  '.playwright-cli'
];

const ignoreFiles = [
  '.env',
  '.env.local',
  '.env.example',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml'
];

const results = [];

function shouldIgnore(filePath) {
  const parts = filePath.split(path.sep);
  return ignoreDirs.some(dir => parts.includes(dir)) ||
         ignoreFiles.some(file => filePath.endsWith(file));
}

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    patterns.forEach(({ name, regex }) => {
      lines.forEach((line, index) => {
        const matches = line.match(regex);
        if (matches) {
          results.push({
            file: filePath,
            line: index + 1,
            type: name,
            content: line.trim().substring(0, 100) + (line.length > 100 ? '...' : '')
          });
        }
      });
    });
  } catch (err) {
    // Ignorar erros de leitura
  }
}

function scanDirectory(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    entries.forEach(entry => {
      const fullPath = path.join(dir, entry.name);
      
      if (shouldIgnore(fullPath)) {
        return;
      }
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        // Apenas arquivos de código
        if (['.js', '.ts', '.jsx', '.tsx', '.json', '.yml', '.yaml', '.sh'].includes(ext)) {
          scanFile(fullPath);
        }
      }
    });
  } catch (err) {
    // Ignorar erros de leitura de diretório
  }
}

console.log('🔍 Escaneando o projeto em busca de credenciais hardcoded...\n');

scanDirectory('.');

if (results.length === 0) {
  console.log('✅ Nenhuma credencial hardcoded encontrada!\n');
} else {
  console.log(`🚨 Encontradas ${results.length} possíveis credenciais hardcoded:\n`);
  
  results.forEach(({ file, line, type, content }) => {
    console.log(`📁 ${file}:${line}`);
    console.log(`   Tipo: ${type}`);
    console.log(`   Conteúdo: ${content}`);
    console.log('');
  });
  
  console.log('⚠️  AÇÃO NECESSÁRIA: Remova estas credenciais e use variáveis de ambiente!\n');
  process.exit(1);
}
