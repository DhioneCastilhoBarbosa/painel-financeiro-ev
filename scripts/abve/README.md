# Atualização mensal dos dados ABVE (Análise de Locais)

A Análise de Locais usa dois CSVs por município extraídos dos painéis Power BI da
ABVE (que são muito mais atuais que o OpenChargeMap):

| Arquivo (em `apps/web/public/data/abve/`) | Origem | Conteúdo |
|---|---|---|
| `eletropostos_por_municipio.csv` | [BI Eletropostos](https://abve.org.br/abve-data/bi-eletropostos/) | municipio, uf, ac, dc, total |
| `frota_ev_por_municipio.csv` | [BI Frotas](https://abve.org.br/abve-data/bi-frotas/) | municipio, uf, … (frota EV) |

Os painéis são Power BI "publish to web". A extração **precisa rodar dentro de um
navegador real** (a API bloqueia clientes fora do navegador). Por isso o passo de
captura é um script de console; o resto (publicar no servidor) é automático.

---

## Passo a passo (≈3 min/mês)

### 1) Capturar cada CSV
Para **cada** painel (eletropostos e frotas):

1. Abra o painel no navegador (links acima) e espere carregar.
2. `F12` → aba **Console**.
3. Cole o **script de captura** abaixo (já vem 1 versão pronta por painel) e dê Enter.
4. **Clique no visual que mostra dados por MUNICÍPIO** (mapa/tabela) ou troque um
   filtro de UF — isso dispara a query. O CSV é baixado **automaticamente** em
   poucos segundos (nome correto já definido).

> Se aparecer "tempo esgotado", interaja de novo com o visual de municípios e cole o script novamente.

### 2) Publicar no servidor
Com os CSVs na pasta **Downloads**, dê **dois cliques** em:

```
scripts\abve\subir-abve.bat
```

Ele valida os arquivos, substitui os do mês anterior em
`apps/web/public/data/abve/`, faz `git commit` + `git push`, e o Dokploy
redeploya sozinho. Funciona mesmo que você tenha baixado só um dos dois.

---

## Scripts de captura (cole no Console do painel aberto)

> Os relatórios são Power BI "publish to web". Os `resourceKey` abaixo mudam se a
> ABVE recriar o relatório — nesse caso reextraia do `iframe` da página do painel
> (`view-source`, campo `data-litespeed-src` → token base64 → campo `k`).

### ⚡ Eletropostos — abra o [BI Eletropostos](https://abve.org.br/abve-data/bi-eletropostos/)
Cole **primeiro** o bloco 🔧 (define `__abveCapture`), depois:
```js
(() => { __abveCapture('1c21f0be-a53a-4aed-8aa8-2bafd3ac52c8', 'eletropostos_por_municipio.csv'); })();
```
Depois clique no visual de municípios → o CSV baixa sozinho.

### 🚗 Frotas — abra o [BI Frotas](https://abve.org.br/abve-data/bi-frotas/)
O painel de frotas roda sobre `BaseVendas_ABVE` (vendas/emplacamentos por
município × tecnologia), então usa um script próprio (self-contained, **não**
precisa do bloco 🔧). Cole, clique no visual de municípios e o CSV
`frota_ev_por_municipio.csv` baixa sozinho (colunas: municipio, uf, bev, phev,
hev, mhev, hev_flex, **ev_plugin** = BEV+PHEV, total):
```js
(() => {
  const RKEY = '2876fadc-cffd-4d01-bf73-446d1bbbcb45';
  const SIG = {'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE','distrito federal':'DF','espirito santo':'ES','goias':'GO','maranhao':'MA','mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG','para':'PA','paraiba':'PB','parana':'PR','pernambuco':'PE','piaui':'PI','rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS','rondonia':'RO','roraima':'RR','santa catarina':'SC','sao paulo':'SP','sergipe':'SE','tocantins':'TO'};
  const norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
  if (!window.__qdF) {
    window.__qdF = [];
    const grab = (u,b) => { try { if (u && (''+u).includes('querydata') && b && (''+b).includes('BaseVendas_ABVE')) window.__qdF.push({ url:''+u, body:JSON.parse(b) }); } catch {} };
    const _o=XMLHttpRequest.prototype.open,_s=XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open=function(m,u){this.__u=u;return _o.apply(this,arguments);};
    XMLHttpRequest.prototype.send=function(b){grab(this.__u,b);return _s.apply(this,arguments);};
    const _f=window.fetch; window.fetch=function(...a){try{grab(a[0],a[1]&&a[1].body);}catch{} return _f.apply(this,a);};
  }
  const run = async () => {
    const tmpl = (window.__qdF||[])[0]; if (!tmpl) return false;
    const body = JSON.parse(JSON.stringify(tmpl.body)); body.queries = [body.queries[0]];
    const cmd = body.queries[0].Query.Commands[0].SemanticQueryDataShapeCommand;
    cmd.Query = { Version:2,
      From:[{Name:'b',Entity:'BaseVendas_ABVE',Type:0},{Name:'c',Entity:'Cadastro_Municipio',Type:0},{Name:'e',Entity:'Cadastro_Estado',Type:0}],
      Select:[
        {Column:{Expression:{SourceRef:{Source:'c'}},Property:'Município'},Name:'municipio'},
        {Column:{Expression:{SourceRef:{Source:'e'}},Property:'Estado_Nome'},Name:'estado'},
        {Column:{Expression:{SourceRef:{Source:'b'}},Property:'Tipo_Tecnologia'},Name:'tec'},
        {Measure:{Expression:{SourceRef:{Source:'b'}},Property:'Quantidade'},Name:'qtd'}],
      Where:[{Condition:{In:{Expressions:[{Column:{Expression:{SourceRef:{Source:'b'}},Property:'Tipo_Tecnologia'}}],
        Values:[["'BEV'"],["'PHEV'"],["'HEV'"],["'HEV FLEX'"],["'MHEV'"]].map(v=>[{Literal:{Value:v[0]}}])}}}] };
    cmd.Binding = { Primary:{Groupings:[{Projections:[0,1,2,3]}]}, DataReduction:{DataVolume:4,Primary:{Window:{Count:200000}}}, Version:1 };
    const j = await new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('POST',tmpl.url,true);
      x.setRequestHeader('X-PowerBI-ResourceKey',RKEY);x.setRequestHeader('Content-Type','application/json;charset=UTF-8');
      x.onload=()=>{try{res(JSON.parse(x.responseText));}catch(e){rej(e);}};x.onerror=()=>rej(new Error('XHR '+x.status));x.send(JSON.stringify(body));});
    const ds = j?.results?.[0]?.result?.data?.dsr?.DS?.[0]; if (!ds) { console.log('cru:',j); return false; }
    const dicts = ds.ValueDicts||{}; const out=[]; let cols=null, prev=null;
    for (const ph of ds.PH){ const dm=ph.DM1||ph.DM0; if(!dm)continue;
      for (const it of dm){ if(it.S){cols=it.S;prev=null;}
        const C=it.C||[],R=it.R||0,N=it['Ø']||0; const raw=[]; let ci=0;
        for(let i=0;i<cols.length;i++){ if((N>>i)&1)raw.push(null); else if((R>>i)&1)raw.push(prev?prev[i]:null); else raw.push(C[ci++]); }
        prev=raw; out.push(cols.map((c,i)=>(c.DN&&typeof raw[i]==='number'&&dicts[c.DN])?dicts[c.DN][raw[i]]:raw[i])); } }
    const m=new Map();
    for (const r of out){ const mun=r[0]; if(!mun)continue; const tec=String(r[2]||'').toUpperCase(), q=Number(r[3])||0;
      const uf=SIG[norm(r[1])]||''; const k=mun+'|'+uf;
      if(!m.has(k))m.set(k,{municipio:mun,uf,bev:0,phev:0,hev:0,mhev:0,hevflex:0}); const o=m.get(k);
      if(tec==='BEV')o.bev+=q; else if(tec==='PHEV')o.phev+=q; else if(tec==='HEV')o.hev+=q; else if(tec==='MHEV')o.mhev+=q; else if(tec==='HEV FLEX')o.hevflex+=q; }
    const cell=v=>(typeof v==='number')?String(v):`"${String(v??'').replace(/"/g,'""')}"`;
    const recs=[...m.values()];
    const csv=['municipio,uf,bev,phev,hev,mhev,hev_flex,ev_plugin,total'].concat(recs.map(o=>{const ev=o.bev+o.phev,tot=ev+o.hev+o.mhev+o.hevflex;
      return [cell(o.municipio),cell(o.uf),o.bev,o.phev,o.hev,o.mhev,o.hevflex,ev,tot].join(',');})).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='frota_ev_por_municipio.csv';a.click();
    console.log(`✅ ${recs.length} municípios → frota_ev_por_municipio.csv`); return true;
  };
  console.log('✅ Capturador de frotas instalado. Clique no visual de MUNICÍPIOS. Baixo o CSV automaticamente…');
  let n=0; const iv=setInterval(async()=>{ n++; if((await run())||n>120){ clearInterval(iv); if(n>120)console.log('⏱️ tempo esgotado — interaja com o visual de municípios e cole de novo.'); } }, 1000);
})();
```

### 🔧 Cole ESTE primeiro (define `__abveCapture`, usado só pelo ⚡ Eletropostos)
```js
window.__abveCapture = function (RKEY, OUT) {
  // padroniza nomes de colunas conhecidos; o resto vira minúsculo
  const RENAME = { NM_MUN:'municipio', SIGLA_UF:'uf', UF:'uf', AC:'ac', DC:'dc',
                   Total_Eletro_Mun:'total', Total:'total' };
  if (!window.__abveHooked) {
    window.__abveHooked = true; window.__caps = [];
    const grab = (u, b) => { try {
      if (u && (''+u).includes('querydata') && b && (''+b).includes('NM_MUN'))
        window.__caps.push({ url: ''+u, body: JSON.parse(b) });
    } catch {} };
    const _o = XMLHttpRequest.prototype.open, _s = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return _o.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) { grab(this.__u, b); return _s.apply(this, arguments); };
    const _f = window.fetch; window.fetch = function (...a) { try { grab(a[0], a[1] && a[1].body); } catch {} return _f.apply(this, a); };
  }
  const dump = async () => {
    const caps = (window.__caps || []).filter(c => JSON.stringify(c.body).includes('NM_MUN'));
    if (!caps.length) return false;
    const body = JSON.parse(JSON.stringify(caps[caps.length - 1].body));
    const url  = caps[caps.length - 1].url;
    const cmd  = body.queries[0].Query.Commands[0].SemanticQueryDataShapeCommand;
    delete cmd.Query.Where;
    cmd.Binding.DataReduction = { DataVolume: 4, Primary: { Window: { Count: 100000 } } };
    if (cmd.Binding.Primary && cmd.Binding.Primary.Top) delete cmd.Binding.Primary.Top;
    const j = await new Promise((res, rej) => {
      const x = new XMLHttpRequest(); x.open('POST', url, true);
      x.setRequestHeader('X-PowerBI-ResourceKey', RKEY);
      x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
      x.onload = () => { try { res(JSON.parse(x.responseText)); } catch (e) { rej(e); } };
      x.onerror = () => rej(new Error('XHR ' + x.status)); x.send(JSON.stringify(body));
    });
    const data = j && j.results && j.results[0] && j.results[0].result && j.results[0].result.data;
    const dsr = data && data.dsr; if (!dsr) { console.log('resposta crua:', j); return false; }
    const nameByVal = {};
    (data.descriptor && data.descriptor.Select || []).forEach(s => {
      const raw = (s.Name || s.Value).replace(/^Sum\(/, '').replace(/\)$/, '').replace(/^[^.]*\./, '');
      nameByVal[s.Value] = RENAME[raw] || raw.toLowerCase();
    });
    const ds = dsr.DS[0], dicts = ds.ValueDicts || {}; const rows = []; let cols = null, prev = null, hdr = null;
    for (const ph of ds.PH) { const dm = ph.DM1 || ph.DM0; if (!dm) continue;
      for (const it of dm) {
        if (it.S) { cols = it.S; prev = null; hdr = cols.map(c => nameByVal[c.N] || String(c.N)); }
        const C = it.C || [], R = it.R || 0, N = it['Ø'] || 0; const raw = []; let ci = 0;
        for (let i = 0; i < cols.length; i++) {
          if ((N >> i) & 1) raw.push(null);
          else if ((R >> i) & 1) raw.push(prev ? prev[i] : null);
          else raw.push(C[ci++]);
        }
        prev = raw;
        rows.push(cols.map((c, i) => (c.DN && typeof raw[i] === 'number' && dicts[c.DN]) ? dicts[c.DN][raw[i]] : raw[i]));
      }
    }
    const cell = v => (typeof v === 'number') ? String(v) : `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = [hdr.join(',')].concat(rows.map(r => r.map(cell).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = OUT; a.click();
    console.log(`✅ ${rows.length} linhas → ${OUT}. Colunas: ${hdr.join(', ')}`);
    console.log('amostra:', rows.slice(0, 5));
    return true;
  };
  console.log('✅ Capturador instalado. Clique no visual de MUNICÍPIOS / troque um filtro. Vou baixar o CSV automaticamente…');
  let n = 0; const iv = setInterval(async () => { n++; if ((await dump()) || n > 120) { clearInterval(iv); if (n > 120) console.log('⏱️ tempo esgotado — interaja com o visual de municípios e cole de novo.'); } }, 1000);
};
```

> Ordem: cole **primeiro** o bloco 🔧 (define `__abveCapture`), depois o bloco ⚡ ou 🚗.
> Os `resourceKey` mudam se a ABVE recriar o relatório — nesse caso, reextraia o
> token do `iframe` em `view-source` da página do painel (campo `data-litespeed-src`).

---

## Por que não é um .exe 100% automático?

Os painéis exigem um navegador real autenticado (o Azure/WAF bloqueia `curl`/scripts
"headless" simples — testado). Dá para automatizar de ponta a ponta com Playwright
(Chromium controlado), mas isso adiciona dependência pesada e precisa ser validado
na máquina. O fluxo acima (captura por console + `subir-abve.bat`) entrega ~90% da
automação sem essa complexidade. Se quiser o `.exe` Playwright, peça que montamos.
