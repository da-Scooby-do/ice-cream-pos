# Report page size and where the ink is, for each printed file (PDF or XPS).
import glob, os, sys
import fitz  # pymupdf opens both PDF and XPS

for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.*"))):
    try:
        doc = fitz.open(f)
    except Exception as e:
        print(os.path.basename(f), "cannot open:", e)
        continue
    mm = lambda pt: pt / 72 * 25.4
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=100, colorspace=fitz.csGRAY)
        w, h, s = pix.width, pix.height, pix.samples
        xs, ys = [], []
        for y in range(0, h, 2):
            row = s[y * w:(y + 1) * w]
            for x in range(0, w, 2):
                if row[x] < 128:
                    xs.append(x); ys.append(y)
        ink = (f"ink {max(xs)-min(xs):.0f}x{max(ys)-min(ys):.0f}px = {(max(xs)-min(xs))/100*25.4:.0f}x{(max(ys)-min(ys))/100*25.4:.0f}mm"
               if xs else "NO INK (blank)")
        print(f"{os.path.basename(f)} page {i+1}/{len(doc)}: paper {mm(page.rect.width):.0f}x{mm(page.rect.height):.0f}mm, {ink}")
