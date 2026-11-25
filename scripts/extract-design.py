#!/usr/bin/env python3
"""
Tasarım HTML'ini (iç içe gömülü paket) ekran başına okunabilir şablonlara çıkarır.

Kullanım:  python3 -I scripts/extract-design.py
Çıktı:     design-extracted/NN-<ekran adı>.html  (git'e girmez)

Her dosyada: ekranın HTML/inline-style şablonu ({{t.xxx}} = tema token'ı) ve
altında örnek veriyi/etkileşimi üreten `class Component` mantığı bulunur.
Fontlar, React çalışma zamanı ve alt menü (<NAV/>) ayıklanır.
"""
import base64, gzip, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'Kişisel Takip Uygulaması — Mobil Tasarım.html')
OUT = os.path.join(ROOT, 'design-extracted')


def block(html, kind):
    m = re.search(r'<script type="__bundler/%s">(.*?)</script>' % kind, html, re.S)
    return m.group(1) if m else None


def decode(entry):
    data = base64.b64decode(entry['data'])
    return gzip.decompress(data) if entry.get('compressed') else data


def main():
    outer = open(SRC, encoding='utf-8').read()
    manifest = json.loads(block(outer, 'manifest'))
    order = json.loads(block(outer, 'page_order'))
    os.makedirs(OUT, exist_ok=True)
    for i, key in enumerate(order):
        page = decode(manifest[key]).decode('utf-8')
        tpl = json.loads(block(page, 'template'))
        title = re.search(r'<title>(.*?)</title>', tpl)
        name = title.group(1) if title else key
        tpl = re.sub(r'<script src=[^>]*></script>', '', tpl)
        tpl = re.sub(r'<helmet>.*?</helmet>', '', tpl, flags=re.S)
        tpl = re.sub(r'<nav .*?</nav>', '<NAV/>', tpl, flags=re.S)
        tpl = re.sub(r'tk\(\) \{.*?\n  \}\n', 'tk(){ /* tema token tablosu: src/theme/tokens.ts */ }\n', tpl, flags=re.S)
        body = tpl[tpl.find('<x-dc>'):] if '<x-dc>' in tpl else tpl
        body = '\n'.join(l for l in body.splitlines() if l.strip())
        safe = re.sub(r'[^\w\-]+', '-', name, flags=re.U).strip('-')
        path = os.path.join(OUT, f'{i:02d}-{safe}.html')
        open(path, 'w', encoding='utf-8').write(body)
        print(f'{i:02d}  {name}  ->  {os.path.relpath(path, ROOT)}')


if __name__ == '__main__':
    sys.exit(main())
