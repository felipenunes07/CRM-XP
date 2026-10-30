"""Extract the supplied two-column UUF PDF to an importable CSV; fail on orphan rows."""
import csv
import re
import sys
from pathlib import Path
import pymupdf

source, destination = map(Path, sys.argv[1:3])
rows = []
with pymupdf.open(source) as document:
    for page_number, page in enumerate(document, 1):
        product = []
        for line in page.get_text().splitlines():
            line = line.strip()
            if not line or line in ("MODELOS", "PRECO") or line.startswith("preco de "):
                continue
            if re.fullmatch(r"\d+(?:[.,]\d{1,2})?", line):
                assert product, f"Price without product on page {page_number}"
                rows.append((" ".join(product), float(line.replace(",", ".")), page_number))
                product = []
            else:
                product.append(line)
        assert not product, f"Product without price on page {page_number}: {product}"
assert rows and all(price >= 0 for _, price, _ in rows)
destination.parent.mkdir(parents=True, exist_ok=True)
with destination.open("w", newline="", encoding="utf-8-sig") as output:
    writer = csv.writer(output, delimiter=";")
    writer.writerow(("Produto", "Preço", "Página da fonte"))
    writer.writerows(rows)
print(f"{len(rows)} products extracted from {source.name} to {destination}")
