import re, json, csv, unicodedata
from collections import defaultdict, Counter
from datetime import datetime

# ───────────────────────── 1. PARSE ─────────────────────────
lines = open('docs/_relatorio.txt').read().splitlines()
DATE_END = re.compile(r'(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})\s*$')
MONEY = re.compile(r'^\d[\d.]*,\d{1,2}$')
is_money = lambda t: bool(MONEY.match(t))
def is_imei(t):
    return len(re.sub(r'\D', '', t)) >= 5 and bool(re.match(r'^[\d/]+[X\d]?$', t))

groups, cur = [], None
for l in lines[4:]:
    if not l.strip(): continue
    if DATE_END.search(l):
        if cur: groups.append(cur)
        cur = [l]
    elif cur is not None: cur.append(l)
if cur: groups.append(cur)

recs = []
for g in groups:
    prim = g[0]; dm = DATE_END.search(prim)
    data = dm.group(1); body = prim[:dm.start()].strip()
    mcod = re.match(r'^(\d+)\s+(.*)$', body)
    if not mcod: continue
    codigo, rest = mcod.group(1), mcod.group(2)
    parts = re.split(r'\bCelular\b', rest, maxsplit=1)
    if len(parts) < 2: continue
    cliente = parts[0].strip()
    toks = parts[1].split()
    midx = [i for i, t in enumerate(toks) if is_money(t)]
    if not midx: continue
    vtotal = toks[midx[-1]]
    modelo = ' '.join(t for t in toks[:midx[0]] if not is_imei(t))
    imei = ' '.join(t for t in toks[:midx[0]] if is_imei(t))
    vend_raw = ' '.join(t for t in toks[midx[0]+1:midx[-1]] if not is_money(t))
    for c in g[1:]:
        cli, mod = c[5:23].strip(), c[30:46].strip()
        if cli: cliente += ' ' + cli
        # continuação de modelo: só tokens com letra (descarta fragmento de IMEI)
        for tk in mod.split():
            if re.search(r'[A-Za-z]', tk): modelo += ' ' + tk
            elif is_imei(tk) or tk.isdigit(): imei += ' ' + tk
    if 'Karen' in vend_raw: vend = 'Karen'
    elif 'Daniel' in vend_raw: vend = 'Daniel'
    elif 'VIT' in vend_raw: vend = 'VITÓRIA'
    elif 'Teknos' in vend_raw: vend = 'Teknos assistência'
    else: vend = vend_raw.strip()
    recs.append(dict(codigo=codigo, cliente=re.sub(r'\s+',' ',cliente).strip(),
        modelo=re.sub(r'\s+',' ',modelo).strip().upper(), imei=re.sub(r'\s+','',imei),
        vendedor=vend, valor=vtotal, valor_f=float(vtotal.replace('.','').replace(',','.')),
        data=data, data_dt=datetime.strptime(data, '%d/%m/%Y %H:%M')))

# ───────────────────────── 2. CLASSIFICAR + NORMALIZAR ─────────────────────────
def is_apple(m):
    return 'IPHONE' in m or bool(re.search(r'\bXS\b|\bXR\b', m))

def norm_iphone(m):
    u = m.upper()
    if 'XS' in u: base = 'XS'
    elif 'XR' in u: base = 'XR'
    else:
        mm = re.search(r'IPHONE\s*(\d{1,2})', u); base = mm.group(1) if mm else None
    if 'AIR' in u and base is None: return 'iPhone Air'
    if 'PLUS' in u: var = 'Plus'
    elif 'MAX' in u: var = 'Max' if base == 'XS' else 'Pro Max'
    elif re.search(r'\b(PRO|RO)\b', u): var = 'Pro'
    elif 'MINI' in u: var = 'Mini'
    else: var = ''
    if base is None: return ('iPhone ' + var).strip() or 'iPhone'
    return ('iPhone ' + base + (' ' + var if var else '')).strip()

for r in recs:
    r['apple'] = is_apple(r['modelo'])
    r['produto'] = 'iphone' if r['apple'] else ''
    r['modelo_norm'] = norm_iphone(r['modelo']) if r['apple'] else r['modelo'].title()

# ───────────────────────── 3. EXCLUSÕES ─────────────────────────
def cnorm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode()
    return re.sub(r'\s+', ' ', s.upper()).strip()

for r in recs:
    r['cliente_norm'] = cnorm(r['cliente'])
    nome = r['cliente_norm']
    r['excluido'] = None
    if 'INVICTOS' in nome:
        r['excluido'] = 'B2B (revenda)'
    elif re.match(r'^(CONSUMIDOR|CLIENTE)\b', nome) or nome in ('CONSUMIDOR PADRAO','CLIENTE PADRAO','CONSUMIDOR FINAL'):
        r['excluido'] = 'Balcão (sem cadastro)'

# duplicatas: mesmo cliente + mesmo modelo em até 3 dias → mantém o mais antigo,
# exclui o resto (pega recompra idêntica/re-lançamento, ex: RICARDO 2x no mesmo dia).
seen = defaultdict(list)
for r in sorted(recs, key=lambda x: x['data_dt']):
    if r['excluido']: continue
    seen[(r['cliente_norm'], r['modelo_norm'])].append(r)
for lst in seen.values():
    kept = lst[0]
    for dup in lst[1:]:
        if abs((dup['data_dt'] - kept['data_dt']).days) <= 3:
            dup['excluido'] = 'Duplicata'
        else:
            kept = dup  # gap grande → compra separada legítima, vira nova âncora

# ───────────────────────── 4. CRUZAR POR NOME ─────────────────────────
# fontes: leads do CRM + CSV de recibos
name_index = defaultdict(list)   # nome_norm -> [(lead_id, telefone, fonte)]
first_last = defaultdict(list)   # (primeiro, ultimo) -> [(lead_id, telefone, nome_norm)]
def add_name(nome, lead_id, tel, fonte):
    nn = cnorm(nome)
    if not nn: return
    name_index[nn].append((lead_id, tel, fonte))
    toks = nn.split()
    if len(toks) >= 2:
        first_last[(toks[0], toks[-1])].append((lead_id, tel, nn))

import difflib
all_names = []  # (nome_norm, lead_id, telefone)
def add_name(nome, lead_id, tel, fonte):
    nn = cnorm(nome)
    if not nn or re.match(r'^\d+$', nn): return
    name_index[nn].append((lead_id, tel, fonte))
    all_names.append((nn, lead_id, tel))
    toks = nn.split()
    if len(toks) >= 2:
        first_last[(toks[0], toks[-1])].append((lead_id, tel, nn))

with open('docs/_leads.csv') as f:
    for row in csv.DictReader(f):
        add_name(row['nome'], row['lead_id'], row['telefone'], 'crm')
with open('docs/vendas-retroativas-etapa1.csv') as f:
    for row in csv.DictReader(f):
        add_name(row['nome'], row['lead_id'], row['telefone'], 'recibo')

def match(nome_norm):
    # 1) exato único
    ex = name_index.get(nome_norm, [])
    uids = {(l, t) for l, t, _ in ex}
    if len(uids) == 1:
        l, t, fo = ex[0]; return l, t, 'exato'
    if len(uids) > 1:
        return None, None, 'ambiguo_exato'
    # 2) primeiro+último nome, único
    toks = nome_norm.split()
    if len(toks) >= 2:
        cand = first_last.get((toks[0], toks[-1]), [])
        uids = {(l, t) for l, t, _ in cand}
        if len(uids) == 1:
            l, t, _ = cand[0]; return l, t, 'primeiro_ultimo'
        if len(uids) > 1:
            return None, None, 'ambiguo_fuzzy'
    # 3) similaridade alta e não-ambígua (>=0.90 e claramente melhor que o 2º)
    scored = sorted(((difflib.SequenceMatcher(None, nome_norm, nn).ratio(), l, t, nn)
                     for nn, l, t in all_names), key=lambda x: -x[0])
    if scored and scored[0][0] >= 0.90 and (len(scored) < 2 or scored[0][0] - scored[1][0] >= 0.06):
        return scored[0][1], scored[0][2], f'fuzzy_{scored[0][0]:.2f}'
    return None, None, 'sem_match'

for r in recs:
    if r['excluido'] or not r['apple']:
        r['lead_id'] = r['telefone'] = r['match_tipo'] = ''
        continue
    l, t, tp = match(r['cliente_norm'])
    r['lead_id'] = l or ''; r['telefone'] = t or ''; r['match_tipo'] = tp

# ───────────────────────── 5. SAÍDA ─────────────────────────
def fmt(r): return dict(
    secao='', nome=r['cliente'], telefone=r['telefone'], lead_id=r['lead_id'],
    produto=r['produto'], modelo=r['modelo_norm'], valor=f"{r['valor_f']:.2f}",
    data_venda=r['data_dt'].strftime('%Y-%m-%d'), vendedor=r['vendedor'],
    armazenamento='', seminovo='', match=r.get('match_tipo',''), motivo_exclusao=r['excluido'] or '')

rows = []
for r in recs:
    d = fmt(r)
    if r['excluido']: d['secao'] = '3-EXCLUIDO'
    elif not r['apple']: d['secao'] = '4-NAO-APPLE'
    elif r['lead_id']: d['secao'] = '1-MATCH'
    else: d['secao'] = '2-SEM-MATCH'
    rows.append(d)

order = {'1-MATCH':0,'2-SEM-MATCH':1,'3-EXCLUIDO':2,'4-NAO-APPLE':3}
rows.sort(key=lambda d: (order[d['secao']], d['data_venda']), reverse=False)
rows.sort(key=lambda d: (order[d['secao']], ), )
# dentro de cada seção, data desc
rows.sort(key=lambda d: (order[d['secao']], ), )
rows = sorted(rows, key=lambda d: (order[d['secao']], d['data_venda']), reverse=False)

cols = ['secao','nome','telefone','lead_id','produto','modelo','valor','data_venda','vendedor','armazenamento','seminovo','match','motivo_exclusao']
with open('docs/vendas-retroativas-v2.csv','w',newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
    for d in rows: w.writerow(d)

# ───────────────────────── RESUMO ─────────────────────────
tot = len(recs)
apple = [r for r in recs if r['apple']]
excl = [r for r in recs if r['excluido']]
apple_ok = [r for r in apple if not r['excluido']]
match_ok = [r for r in apple_ok if r['lead_id']]
sem = [r for r in apple_ok if not r['lead_id']]
print(f"TOTAL vendas no PDF: {tot} | R$ {sum(r['valor_f'] for r in recs):,.2f}")
print(f"Apple (iphone): {len(apple)} | não-Apple: {tot-len(apple)}")
print(f"Excluídos: {len(excl)} -> {dict(Counter(r['excluido'] for r in excl))}")
print(f"Apple elegíveis (não-excluídos): {len(apple_ok)}")
print(f"  MATCH com lead: {len(match_ok)} -> {dict(Counter(r['match_tipo'] for r in match_ok))}")
print(f"  SEM MATCH: {len(sem)} -> {dict(Counter(r['match_tipo'] for r in sem))}")
per = sorted(r['data_dt'] for r in recs)
print(f"Período: {per[0].date()} → {per[-1].date()}")
print(f"\nArquivo: docs/vendas-retroativas-v2.csv ({len(rows)} linhas)")
