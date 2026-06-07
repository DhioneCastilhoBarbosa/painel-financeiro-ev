#!/usr/bin/env node
/**
 * ABVE Data Scraper
 * Uso: node scripts/abve-scraper.mjs
 *
 * Tenta extrair dados de frotas EV e eletropostos dos dashboards Power BI da ABVE.
 * Requer: npm install playwright (instalar separadamente)
 *
 * Frequência recomendada: mensal
 * Saída: apps/web/public/data/abve/frotas_ev_por_uf.csv
 *         apps/web/public/data/abve/eletropostos_por_uf.csv
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../apps/web/public/data/abve');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');

const URLS = {
  frotas: 'https://abve.org.br/abve-data/bi-frotas/',
  eletropostos: 'https://abve.org.br/abve-data/bi-eletropostos/',
};

const TIMEOUT_MS = 30_000;

// Endpoint Microsoft Power BI para interceptação de respostas
const WABI_PATTERN = /wabi.*analysis\.windows\.net/;

async function scrapeUrl(page, url, label) {
  console.log(`\n[${label}] Abrindo ${url}…`);

  const capturedData = [];

  page.on('response', async (response) => {
    if (WABI_PATTERN.test(response.url())) {
      try {
        const body = await response.text();
        if (body.length > 100) {
          capturedData.push({ url: response.url(), body });
          console.log(`  → Resposta WABI capturada: ${response.url().slice(0, 80)}`);
        }
      } catch {
        // response body unavailable — ignorar
      }
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

  // Aguarda o iframe Power BI aparecer
  try {
    await page.waitForSelector('iframe[src*="powerbi"]', { timeout: TIMEOUT_MS });
    console.log(`  ✓ Iframe Power BI encontrado`);
  } catch {
    console.warn(`  ⚠ Iframe Power BI não encontrado (pode estar com outro seletor)`);
  }

  // Aguarda dados carregarem
  await page.waitForTimeout(8000);

  // Screenshot de auditoria
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${label}_${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  📸 Screenshot salvo: ${screenshotPath}`);

  return capturedData;
}

function parsePowerBIData(capturedData) {
  // Tenta extrair tabela de dados da resposta WABI
  for (const { body } of capturedData) {
    try {
      const json = JSON.parse(body);
      // Estrutura típica do Power BI: results[].result.data.dsr.DS[].PH[].DM0[].C[]
      const ds = json?.results?.[0]?.result?.data?.dsr?.DS;
      if (ds) return ds;
    } catch {
      // não é JSON válido
    }
  }
  return null;
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    console.error(
      '\n❌ Playwright não está instalado. Execute:\n   npm install playwright\n   npx playwright install chromium\n'
    );
    process.exit(1);
  }

  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);

  let frotasData = null;
  let eletropostosData = null;

  try {
    const frotasCaptured = await scrapeUrl(page, URLS.frotas, 'frotas');
    frotasData = parsePowerBIData(frotasCaptured);

    await page.goto('about:blank');
    const eletropostosCaptured = await scrapeUrl(page, URLS.eletropostos, 'eletropostos');
    eletropostosData = parsePowerBIData(eletropostosCaptured);
  } finally {
    await browser.close();
  }

  if (!frotasData || !eletropostosData) {
    console.warn(`
⚠ Extração automática não capturou dados estruturados.

Isso pode ocorrer porque:
  1. O Power BI usa autenticação ou CORS que bloqueia interceptação
  2. O layout do dashboard mudou
  3. Limite de taxa da API da Microsoft

AÇÃO MANUAL NECESSÁRIA:
  1. Acesse https://abve.org.br/abve-data/bi-frotas/
  2. No visual de tabela do Power BI, clique em "..." → "Exportar dados"
  3. Selecione formato: "Dados resumidos" → Download como CSV
  4. Salve em: apps/web/public/data/abve/frotas_ev_por_uf.csv
  5. Repita para https://abve.org.br/abve-data/bi-eletropostos/
  6. Salve em: apps/web/public/data/abve/eletropostos_por_uf.csv

Os screenshots de auditoria estão em: ${SCREENSHOTS_DIR}
    `);
    process.exit(0);
  }

  // Se dados foram capturados, gerar CSVs
  // (Implementar parsing específico do Power BI conforme estrutura real capturada)
  console.log('\n✓ Dados capturados. Estrutura raw salva para análise:');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, 'raw_frotas.json'),
    JSON.stringify(frotasData, null, 2)
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'raw_eletropostos.json'),
    JSON.stringify(eletropostosData, null, 2)
  );
  console.log(`  → ${DATA_DIR}/raw_frotas.json`);
  console.log(`  → ${DATA_DIR}/raw_eletropostos.json`);
  console.log('\nRevise os arquivos raw e atualize os CSVs manualmente conforme necessário.');
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
