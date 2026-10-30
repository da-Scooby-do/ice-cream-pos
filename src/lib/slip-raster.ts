// رسم القسيمة صورةً داخل صفحة البرنامج نفسها | draw the slip as a picture in
// the app's own page, for direct ESC/POS printing.
//
// The cashier screen already shows the slip correctly, so it is drawn right
// here onto a canvas (in memory, no graphics card needed) instead of in an
// extra window — on some computers (the shop tablet) the extra windows came
// back empty. Two ways, the second one plainer:
//   "svg": the slip with its styles and fonts as an SVG picture → canvas
//   "dom": every word, line and logo painted one by one where the page put it

export const DOTS = 576; // printable width of an 80 mm printer at 203 dpi
const MIN_INK = 300;

export type SlipPicture = { png: string; ink: number; method: "svg" | "dom"; note: string };

export async function slipToPng(slip: HTMLElement): Promise<SlipPicture | null> {
  const box = slip.getBoundingClientRect();
  if (box.width < 10 || box.height < 10) return null;
  const notes: string[] = [`${Math.round(box.width)}x${Math.round(box.height)}`];
  let best: SlipPicture | null = null;
  for (const [method, draw] of [
    ["svg", drawSvg],
    ["dom", drawDom],
  ] as const) {
    try {
      const c = await draw(slip, box);
      const ink = inkOf(c);
      notes.push(`${method} ink ${ink}`);
      const pic = { png: c.toDataURL("image/png"), ink, method, note: "" };
      if (!best || ink > best.ink) best = pic;
      if (ink >= MIN_INK) break;
    } catch (e) {
      notes.push(`${method}: ${String((e as Error)?.message || e).slice(0, 60)}`);
    }
  }
  if (best) best.note = notes.join(" ");
  return best;
}

function canvasFor(box: DOMRect) {
  const scale = DOTS / box.width;
  const c = document.createElement("canvas");
  c.width = DOTS;
  c.height = Math.max(40, Math.ceil(box.height * scale));
  const g = c.getContext("2d", { willReadFrequently: true })!; // in memory, not on the graphics card
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  return { c, g, scale };
}

function inkOf(c: HTMLCanvasElement): number {
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] < 384) n++;
  return n;
}

// --- 1) صورة SVG | the slip as an SVG picture ------------------------------------

const dataCache = new Map<string, Promise<string>>();
function asData(url: string): Promise<string> {
  let p = dataCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.blob())
      .then(
        (b) =>
          new Promise<string>((ok, bad) => {
            const fr = new FileReader();
            fr.onload = () => ok(String(fr.result));
            fr.onerror = bad;
            fr.readAsDataURL(b);
          })
      );
    p.catch(() => dataCache.delete(url));
    dataCache.set(url, p);
  }
  return p;
}

let cssCache: { key: number; css: Promise<string> } | null = null;
function pageCss(): Promise<string> {
  const key = document.styleSheets.length;
  if (cssCache?.key === key) return cssCache.css;
  const css = (async () => {
    let css = "";
    for (const sh of Array.from(document.styleSheets)) {
      try {
        for (const r of Array.from(sh.cssRules)) css += r.cssText + "\n";
      } catch {
        /* another site's stylesheet */
      }
    }
    // fonts and pictures inside an SVG picture must be embedded
    const urls = new Set([...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]));
    for (const u of urls) {
      if (u.startsWith("data:")) continue;
      try {
        css = css.split(u).join(await asData(new URL(u, location.href).href));
      } catch {
        /* leave it */
      }
    }
    return css;
  })();
  cssCache = { key, css };
  return css;
}

async function drawSvg(slip: HTMLElement, box: DOMRect) {
  const w = Math.ceil(box.width);
  const h = Math.ceil(box.height);
  const clone = slip.cloneNode(true) as HTMLElement;
  for (const img of Array.from(clone.querySelectorAll("img"))) {
    try {
      img.setAttribute("src", await asData(new URL(img.getAttribute("src") || "", location.href).href));
    } catch {
      /* drawn without it */
    }
  }
  const XH = "http://www.w3.org/1999/xhtml";
  const root = document.createElementNS(XH, "div") as HTMLElement;
  root.setAttribute("dir", "rtl");
  root.setAttribute("lang", "ar");
  root.setAttribute("style", `background:#fff;width:${w}px;visibility:visible`);
  const st = document.createElementNS(XH, "style");
  st.textContent = await pageCss();
  root.append(st, clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${new XMLSerializer().serializeToString(root)}</foreignObject></svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  await new Promise((r) => setTimeout(r, 100)); // embedded fonts
  const { c, g } = canvasFor(box);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// --- 2) كلمة كلمة | word by word, where the page laid them out ----------------

async function drawDom(slip: HTMLElement, box: DOMRect) {
  const { c, g, scale } = canvasFor(box);
  g.scale(scale, scale);
  g.translate(-box.left, -box.top);

  for (const el of [slip, ...Array.from(slip.querySelectorAll<HTMLElement>("*"))]) {
    const cs = getComputedStyle(el);
    if (cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    const bg = cs.backgroundColor;
    if (el !== slip && bg && !/rgba\(.*,\s*0\)|transparent|rgb\(255,\s*255,\s*255\)/.test(bg)) {
      g.fillStyle = bg;
      g.fillRect(r.left, r.top, r.width, r.height);
    }
    const side = (wd: string, st: string, color: string, x1: number, y1: number, x2: number, y2: number) => {
      const lw = parseFloat(wd);
      if (!lw || st === "none" || st === "hidden") return;
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.setLineDash(st === "dashed" ? [3, 2] : st === "dotted" ? [1, 1.5] : []);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    };
    const t = parseFloat(cs.borderTopWidth) / 2;
    const b = parseFloat(cs.borderBottomWidth) / 2;
    const L = parseFloat(cs.borderLeftWidth) / 2;
    const R = parseFloat(cs.borderRightWidth) / 2;
    side(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor, r.left, r.top + t, r.right, r.top + t);
    side(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor, r.left, r.bottom - b, r.right, r.bottom - b);
    side(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor, r.left + L, r.top, r.left + L, r.bottom);
    side(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor, r.right - R, r.top, r.right - R, r.bottom);
    if (el instanceof HTMLImageElement && el.complete && el.naturalWidth) {
      try {
        g.drawImage(el, r.left, r.top, r.width, r.height);
      } catch {
        /* skip the picture */
      }
    }
  }

  g.setLineDash([]);
  g.textBaseline = "middle";
  g.textAlign = "center";
  const walk = document.createTreeWalker(slip, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const parent = n.parentElement;
    if (!parent || !n.data.trim()) continue;
    const cs = getComputedStyle(parent);
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.fillStyle = cs.color;
    g.direction = "rtl";
    for (const m of n.data.matchAll(/\S+/g)) {
      range.setStart(n, m.index!);
      range.setEnd(n, m.index! + m[0].length);
      const rr = range.getBoundingClientRect();
      if (!rr.width) continue;
      g.fillText(m[0], rr.left + rr.width / 2, rr.top + rr.height / 2, rr.width + 2);
    }
  }
  return c;
}
