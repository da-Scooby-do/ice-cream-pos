# Report page size and where the ink is, for each printed XPS file.
import re, sys, zipfile, glob, os
for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.xps"))):
    z = zipfile.ZipFile(f)
    pages = [n for n in z.namelist() if n.lower().endswith(".fpage")]
    out = []
    for p in pages:
        x = z.read(p).decode("utf-8", "ignore")
        m = re.search(r'<FixedPage[^>]*Width="([\d.]+)"[^>]*Height="([\d.]+)"', x)
        w, h = (float(m.group(1)), float(m.group(2))) if m else (0, 0)
        # every drawn element's RenderTransform / origin gives a rough ink extent
        ys = [float(v) for v in re.findall(r'OriginY="([\d.]+)"', x)]
        scales = re.findall(r'RenderTransform="([\d.,\- ]+)"', x)[:3]
        mm = lambda v: v / 96 * 25.4
        out.append(f"page {mm(w):.0f}x{mm(h):.0f}mm glyph-rows y {mm(min(ys)) if ys else 0:.0f}-{mm(max(ys)) if ys else 0:.0f}mm transforms {scales}")
    print(os.path.basename(f), f"{len(pages)} page(s)", "; ".join(out))
