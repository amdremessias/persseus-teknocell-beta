import re, json

lines = open('docs/_clientes.txt').read().splitlines()
DDD = re.compile(r'\(\d{2}\)')

def to_e164(frag):
    d = re.sub(r'\D', '', frag)
    if len(d) in (10, 11):
        return '55' + d
    if len(d) in (12, 13) and d.startswith('55'):
        return d
    return None

# agrupa em blocos: um novo bloco começa numa linha com "(DD)" na coluna de telefone
blocks, cur = [], None
for l in lines[4:]:
    phone_col = l[23:40] if len(l) > 23 else ''
    if DDD.search(phone_col):
        if cur:
            blocks.append(cur)
        cur = [l]
    elif cur is not None:
        cur.append(l)
if cur:
    blocks.append(cur)

clientes = []
for b in blocks:
    nome = ' '.join(l[0:23].strip() for l in b if l[0:23].strip())
    fone_frag = ''.join(l[23:34] for l in b)
    tel = to_e164(fone_frag)
    email = ''
    for l in b:
        m = re.search(r'[\w.\-]+@[\w.\-]+', l)
        if m: email = m.group(0)
    if nome and tel:
        clientes.append({'nome': re.sub(r'\s+', ' ', nome).strip(), 'telefone': tel, 'email': email})

print(f"blocos: {len(blocks)} | clientes com nome+telefone: {len(clientes)}")
print("=== amostra ===")
for c in clientes[:12]:
    print(f"  {c['telefone']:15} | {c['nome']}")
json.dump(clientes, open('docs/_clientes.json', 'w'), ensure_ascii=False, indent=1)
