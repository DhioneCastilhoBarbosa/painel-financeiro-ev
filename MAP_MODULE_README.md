# Módulo de Mapa de Instalação — Documentação

Rota: `/dashboard/map`  
Componente principal: `src/components/map/InstallationMap.tsx`

---

## Configuração rápida

### 1. Variáveis de ambiente (`.env`)

```env
# Open Charge Map — obtenha em https://openchargemap.io/site/develop
NEXT_PUBLIC_OPEN_CHARGE_MAP_KEY=sua_chave_aqui
```

Sem a chave, o mapa usa dados de demonstração com 10 carregadores fictícios.

---

## Camadas de dados

| Camada | Toggle | Fonte | Nível |
|---|---|---|---|
| Renda per capita | `income` | IBGE SIDRA API | UF |
| Frota EV | `fleet` | CSV local (ABVE) | UF |
| Carregadores instalados | `chargers` | Open Charge Map API | Ponto |
| Shoppings / Hipermercados | `poi` | Overpass API (OSM) | Ponto |
| Postos de gasolina | `fuel` | Overpass API (OSM) | Ponto |
| Rodovias principais | `traffic` | Overpass API (OSM) | Via |
| Gap ABVE (Frotas × Eletropostos) | `abveGap` | CSV local (ABVE) | UF |
| Score de Oportunidade (choropleth) | `score` | Calculado localmente | UF |
| Heatmap de Oportunidade | `heatmap` | Calculado localmente | UF |

As camadas **poi**, **fuel** e **traffic** são consultadas dinamicamente via Overpass API
conforme o bounding box visível do mapa muda (com debounce de 1,2 s).

---

## Score de Oportunidade

O score composto é calculado em `src/utils/scoring.ts`:

```
score = (w1 × renda_norm + w2 × frota_norm + w3 × poi_norm
       + w4 × (1 - dist_carregador_norm) + w5 × fluxo_norm
       + w6 × gap_abve_norm) / (w1+w2+w3+w4+w5+w6)
```

Os pesos `w1–w6` são ajustáveis via sliders no painel lateral em tempo real.

---

## Adicionando novas camadas

1. Crie `src/components/map/layers/MinhaLayer.tsx` com o componente react-leaflet
2. Adicione a chave ao tipo `LayerVisibility` em `MapSidebar.tsx`
3. Adicione o label em `LAYER_LABELS` no mesmo arquivo
4. Renderize condicionalmente em `InstallationMap.tsx`

---

## Estrutura de arquivos

```
apps/web/src/
  app/(dashboard)/dashboard/map/
    page.tsx                     ← Rota Next.js (server component + dynamic import)
  components/map/
    InstallationMap.tsx          ← Componente raiz do mapa (client)
    MapSidebar.tsx               ← Painel de controle flutuante
    layers/
      IncomeLayer.tsx            ← Choropleth renda (IBGE)
      FleetLayer.tsx             ← Choropleth frota (ABVE CSV)
      ABVEGapLayer.tsx           ← Choropleth gap ABVE
      ChargerLayer.tsx           ← Marcadores + raio de cobertura
      PoiLayer.tsx               ← Clusters POI + postos (Overpass)
      TrafficLayer.tsx           ← Rodovias principais (Overpass)
      HeatmapLayer.tsx           ← Heatmap leaflet.heat
      ScoreLayer.tsx             ← Choropleth score de oportunidade
  hooks/
    useIBGEData.ts               ← GeoJSON UFs + renda per capita
    useABVEData.ts               ← Lê CSVs de /public/data/abve/
    useOpenChargeMap.ts          ← Carregadores existentes
    useOverpassData.ts           ← POIs / rodovias via Overpass
    useOpportunityScore.ts       ← Score composto por UF
  utils/
    normalize.ts                 ← Min-max normalization
    gapAnalysis.ts               ← Gap ABVE: ratio veículos/eletroposto
    scoring.ts                   ← Score ponderado composto
  types/
    leaflet-heat.d.ts            ← Tipagem TypeScript para leaflet.heat

apps/web/public/data/abve/
  frotas_ev_por_uf.csv           ← Frota EV por UF (atualizar mensalmente)
  eletropostos_por_uf.csv        ← Eletropostos por UF (atualizar mensalmente)

scripts/
  abve-scraper.mjs               ← Extração assistida dos dashboards ABVE
```

---

## Atualização dos dados ABVE

Os dados de frotas EV e eletropostos por UF são publicados mensalmente pela
ABVE via Power BI (sem API pública disponível). Para atualizar os CSVs locais:

**Opção A — Script automatizado (recomendado):**
```bash
cd apps/web
npm run update-abve
```
1. O script abre os dashboards ABVE em Chromium headless
2. Tenta interceptar as respostas da API Microsoft Power BI
3. Salva screenshots de auditoria em `scripts/screenshots/`
4. Se a interceptação automática falhar (comum), exibe instruções manuais

> **Pré-requisito:** `npm install playwright && npx playwright install chromium`
> (instalar uma única vez, fora do `apps/web`)

**Opção B — Extração manual:**
1. Acesse https://abve.org.br/abve-data/bi-frotas/
2. No visual de tabela do Power BI, clique em **"…"** → **"Exportar dados"**
3. Selecione "Dados resumidos" e faça o download como `.csv`
4. Salve como `apps/web/public/data/abve/frotas_ev_por_uf.csv`
5. Repita para https://abve.org.br/abve-data/bi-eletropostos/
6. Salve como `apps/web/public/data/abve/eletropostos_por_uf.csv`
7. Valide com `npm run dev` e confira o choropleth no mapa

**Frequência recomendada:** mensal (dados atualizados a cada boletim ABVE)

### Estrutura esperada dos CSVs

**`frotas_ev_por_uf.csv`**
```
uf,nome_estado,total_veiculos_ev,total_hibridos,total_phev,ano_referencia
SP,São Paulo,18000,22000,5000,2024
RJ,Rio de Janeiro,5500,6500,900,2024
...
```

**`eletropostos_por_uf.csv`**
```
uf,nome_estado,total_eletropostos,pontos_ac,pontos_dc,pontos_rapido,ano_referencia
SP,São Paulo,2100,1400,500,200,2024
RJ,Rio de Janeiro,750,500,180,70,2024
...
```

---

## Classificação Gap ABVE

| Ratio veículos/eletroposto | Classificação | Cor |
|---|---|---|
| > 200 | 🔴 Crítico | `#d73027` |
| 100–200 | 🟠 Alto | `#fc8d59` |
| 50–100 | 🟡 Moderado | `#fee090` |
| < 50 | 🟢 Saturado | `#1a9850` |

---

## Exportar locais

O botão **"Exportar locais selecionados (CSV)"** no painel lateral gera um arquivo com:

```
uf, nome, lat, lng, score, renda, frota, eletropostos, gap_abve
```

O arquivo inclui todos os estados (ou apenas o filtrado por UF, se ativo).

---

## Marcar como prospecto

Ao clicar em um estado no choropleth de Score, o popup inclui botão
**"Marcar como prospecto"** que persiste a seleção em `localStorage`
com chave `prospect_<UF>`.

---

## Requisitos de navegador

- Viewport mínimo: 768px
- Chaves de API: nunca expostas em URL — apenas via variáveis `NEXT_PUBLIC_*`
- Leaflet requer ambiente browser; o mapa é importado com `ssr: false`
