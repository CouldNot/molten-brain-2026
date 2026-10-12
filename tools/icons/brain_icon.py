#!/usr/bin/env python
"""Generate the neurarium app icons (SVG sources + PNG exports).

Two rungs of one design, a lateral-view brain (frontal pole on the left):

* **detailed** (``docs/images/neurarium-icon.svg``): solid purple cerebrum with its
  folds carved as see-through grooves, cerebellum with folia, brainstem, glossy
  "gem" dots on the rim and one projection arrow (the app's gem markers + arrows).
  Used by the README header and the PWA PNGs.
* **small** (``public/favicon.svg``): the favicon rung. Silhouette, the Sylvian
  groove, cerebellum, brainstem and two big gems, nothing finer, so it stays a
  brain at 16 px.

Every shape is transparent-backgrounded (seams between parts are masks, never a
painted background), so the icon sits on a dark or a light page alike. The opaque
exports (maskable PWA icons, apple-touch-icon) put the detailed rung on the dark
``--page-bg`` inside the platform safe zone.

Folds are not hand-drawn: the landmark fissures are single cubic Beziers, and the
frontal / temporal folds are slices of the cerebrum outline offset inward, so they
run parallel to the silhouette. Each groove has one width, a round start and a
rounded (sqrt-profile) taper where it fades into the lobe.

Stdlib only. PNG export shells out to ``rsvg-convert`` (librsvg); without it the
SVGs are still written and the PNG step is skipped with a warning.

Usage, from the repo root::

    python tools/icons/brain_icon.py            # write SVGs + PNGs in place
    python tools/icons/brain_icon.py --svg-only

Written with the help of Claude Code.
"""
from __future__ import annotations

import argparse
import math
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Palette: the app's --accent family (see public/index.html :root).
LIGHT, ACC, DEEP, INK = "#c8a8ff", "#8a5cf0", "#5a2bbf", "#3d178a"
PAGE_BG = "#0e1116"  # --page-bg (dark), also the manifest background_color

# ---------------- anatomy (512 x 512 user space) ----------------
CEREBRUM = ("M 176 292 C 140 296 96 290 72 266 C 44 236 40 186 58 150 "
            "C 86 94 160 64 240 62 C 330 58 410 88 448 140 "
            "C 478 182 482 240 462 272 C 446 296 412 300 382 296 "
            "C 350 306 320 330 290 342 C 250 356 200 354 172 336 "
            "C 148 322 146 300 176 292 Z")
CEREBELLUM = ("M 346 318 C 368 294 428 280 462 284 C 494 298 494 352 458 374 "
              "C 422 394 366 390 344 366 C 330 350 334 330 346 318 Z")
STEM = ("M 292 326 L 352 326 C 356 372 346 398 338 420 C 332 440 332 456 332 474 "
        "Q 312 486 294 474 C 296 450 292 430 288 410 C 282 384 286 356 292 326 Z")
FOLIA = ["M 356 334 C 396 318 446 312 482 322",
         "M 352 352 C 396 340 446 336 484 344",
         "M 362 370 C 400 362 440 360 474 362"]

ARROW_PATH = "M 146 248 Q 260 206 374 202"
ARROW_HEAD = "M 414 200 L 374 224 L 372 178 Z"
RIM_GEMS = [(178, 76, 34), (462, 240, 32), (58, 168, 30)]
ARROW_GEM = (146, 248, 28)

DEFS = f"""
    <linearGradient id="bodyflat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9d72f8"/>
      <stop offset="1" stop-color="#6c3fd8"/>
    </linearGradient>
    <radialGradient id="gem" cx="0.36" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#f1e8ff"/>
      <stop offset="0.35" stop-color="{LIGHT}"/>
      <stop offset="0.75" stop-color="{ACC}"/>
      <stop offset="1" stop-color="{DEEP}"/>
    </radialGradient>"""


# ---------------- geometry helpers ----------------
def bez(p0, p1, p2, p3, n=48):
    """Sample one cubic Bezier into n+1 points."""
    pts = []
    for k in range(n + 1):
        s = k / n
        u = 1 - s
        pts.append((u**3 * p0[0] + 3 * u * u * s * p1[0] + 3 * u * s * s * p2[0] + s**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * s * p1[1] + 3 * u * s * s * p2[1] + s**3 * p3[1]))
    return pts


def path_pts(d, n=48):
    """Sample an absolute M/C/Z path into a polyline."""
    t = d.split()
    i, pts, cur = 0, [], None
    while i < len(t):
        if t[i] == "M":
            cur = (float(t[i + 1]), float(t[i + 2]))
            pts = [cur]
            i += 3
        elif t[i] == "C":
            i += 1
            while i < len(t) and t[i] not in "MCZ":
                p1, p2, p3 = [(float(t[i + 2 * k]), float(t[i + 2 * k + 1])) for k in range(3)]
                pts += bez(cur, p1, p2, p3, n)[1:]
                cur = p3
                i += 6
        else:
            i += 1
    return pts


def normals(pts):
    """Unit normals; for the clockwise-on-screen cerebrum outline they point inward."""
    out = []
    for i in range(len(pts)):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        out.append((-dy / L, dx / L))
    return out


OUTLINE = path_pts(CEREBRUM)


def offset_slice(dist, keep):
    """Cerebrum outline offset inward by `dist`, longest run of points where keep(x, y)."""
    off = [(x + nx * dist, y + ny * dist) for (x, y), (nx, ny) in zip(OUTLINE, normals(OUTLINE))]
    runs, cur = [], []
    for p in off + off:  # doubled so a run may wrap past the path start
        if keep(*p):
            cur.append(p)
        else:
            if cur:
                runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return max(runs, key=len)


def groove(pts, w, taper_len):
    """Filled groove along pts: width w, round start, sqrt-profile rounded taper at the end."""
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    L = s[-1]
    tl = min(taper_len, L * 0.6)
    half = [w / 2 * math.sqrt(min(1.0, (L - si) / tl)) for si in s]
    ns = normals(pts)
    left = [(x + nx * h, y + ny * h) for (x, y), (nx, ny), h in zip(pts, ns, half)]
    right = [(x - nx * h, y - ny * h) for (x, y), (nx, ny), h in zip(pts, ns, half)]
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in left + right[::-1]) + " Z"
    return (f'<path d="{d}" fill="#000"/>'
            f'<circle cx="{pts[0][0]:.1f}" cy="{pts[0][1]:.1f}" r="{w / 2}" fill="#000"/>')


# ---------------- shared drawing ----------------
def knock(mid, fills=(), holes="", gap=12):
    """A mask punching see-through holes: `fills` dilated by `gap`, plus raw black `holes` markup."""
    h = "".join(f'<path d="{d}" fill="#000" stroke="#000" stroke-width="{2 * gap}" '
                f'stroke-linejoin="round"/>' for d in fills)
    return (f'\n    <mask id="{mid}" maskUnits="userSpaceOnUse">'
            f'<rect width="512" height="512" fill="#fff"/>{h}{holes}</mask>')


def gem(x, y, r):
    return f'  <circle cx="{x}" cy="{y}" r="{r}" fill="url(#gem)"/>\n'


def hindbrain(folia, gap):
    """Cerebellum (+ optional folia) and brainstem, tucked under the cerebrum behind see-through seams."""
    defs = knock("m_cb", [CEREBRUM], gap=gap) + knock("m_st", [CEREBRUM, CEREBELLUM], gap=gap)
    defs += f'\n    <clipPath id="c_cb"><path d="{CEREBELLUM}"/></clipPath>'
    b = f'  <g mask="url(#m_st)"><path d="{STEM}" fill="{INK}"/></g>\n'
    b += f'  <g mask="url(#m_cb)">\n    <path d="{CEREBELLUM}" fill="#7446e0"/>\n'
    if folia:
        b += '    <g clip-path="url(#c_cb)">\n'
        b += "".join(f'      <path d="{d}" fill="none" stroke="#b48bff" stroke-width="8" '
                     f'stroke-linecap="round"/>\n' for d in FOLIA)
        b += '    </g>\n'
    b += '  </g>\n'
    return b, defs


def svg(body, defs, title, bg=None, scale=1.0):
    """Wrap a 512 x 512 drawing; optional opaque bg and centred down-scale (safe zones)."""
    if scale != 1.0:
        body = f'  <g transform="translate(256 256) scale({scale}) translate(-256 -256)">\n{body}  </g>\n'
    if bg:
        body = f'  <rect width="512" height="512" fill="{bg}"/>\n{body}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" '
            f'role="img" aria-label="{title}">\n  <title>{title}</title>\n'
            f'  <!-- Generated by tools/icons/brain_icon.py: edit that, not this file. -->\n'
            f'  <defs>{DEFS}{defs}\n  </defs>\n{body}</svg>\n')


# ---------------- the two rungs ----------------
def detailed(bg=None, scale=1.0):
    """README / PWA icon: four designed folds, folia, gems, one projection arrow."""
    syl = bez((166, 300), (228, 270), (298, 254), (362, 246))       # Sylvian fissure, opens at the notch
    cen = bez((300, 46), (292, 104), (284, 152), (262, 192))[9:]    # central sulcus, starts inside the crown
    front = offset_slice(70, lambda x, y: 104 < x < 222 and y < 200)[::-1]
    temp = offset_slice(46, lambda x, y: 222 < x < 316 and y > 280)[::-1]
    holes = groove(syl, 22, 110) + groove(cen, 20, 90) + groove(front, 20, 110) + groove(temp, 18, 80)
    hb, defs = hindbrain(folia=True, gap=12)
    defs += knock("m_groove", holes=holes)
    b = hb + f'  <g mask="url(#m_groove)"><path d="{CEREBRUM}" fill="url(#bodyflat)"/></g>\n'
    b += f'  <path d="{ARROW_PATH}" fill="none" stroke="#efe6ff" stroke-width="16" stroke-linecap="round"/>\n'
    b += f'  <path d="{ARROW_HEAD}" fill="#efe6ff" stroke="#efe6ff" stroke-width="10" stroke-linejoin="round"/>\n'
    for g in RIM_GEMS + [ARROW_GEM]:
        b += gem(*g)
    return svg(b, defs, "neurarium", bg, scale)


def small():
    """Favicon rung: silhouette + Sylvian groove + hindbrain + two gems, nothing finer."""
    hb, defs = hindbrain(folia=False, gap=20)
    hb = hb.replace(f'<path d="{STEM}"', f'<path d="{STEM}" transform="translate(-6 0)"')
    defs += knock("m_groove", holes='<path d="M 168 296 C 230 266 290 252 340 244" fill="none" '
                                    'stroke="#000" stroke-width="30" stroke-linecap="round"/>')
    b = hb + f'  <g mask="url(#m_groove)"><path d="{CEREBRUM}" fill="url(#bodyflat)"/></g>\n'
    b += gem(178, 84, 46) + gem(452, 228, 42)
    return svg(b, defs, "neurarium")


# Maskable: everything must sit inside the centred circle of radius 40% (the safe zone);
# the drawing's bbox half-diagonal is ~330 user units, so 0.62 keeps it inside 204.
MASKABLE_SCALE = 0.62
APPLE_SCALE = 0.84

SVG_OUT = {
    "docs/images/neurarium-icon.svg": lambda: detailed(),
    "public/favicon.svg": small,
}
# (png path, size, svg builder)
PNG_OUT = [
    ("public/icon-192.png", 192, lambda: detailed()),
    ("public/icon-512.png", 512, lambda: detailed()),
    ("public/icon-maskable-192.png", 192, lambda: detailed(PAGE_BG, MASKABLE_SCALE)),
    ("public/icon-maskable-512.png", 512, lambda: detailed(PAGE_BG, MASKABLE_SCALE)),
    ("public/apple-touch-icon.png", 180, lambda: detailed(PAGE_BG, APPLE_SCALE)),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--svg-only", action="store_true", help="skip the PNG exports")
    args = ap.parse_args()
    for rel, build in SVG_OUT.items():
        (ROOT / rel).write_text(build())
        print(f"wrote {rel}")
    if args.svg_only:
        return 0
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        print("warning: rsvg-convert not found (install librsvg2-bin); PNGs not exported", file=sys.stderr)
        return 0
    for rel, size, build in PNG_OUT:
        png = subprocess.run([rsvg, "-w", str(size), "-h", str(size)], input=build().encode(),
                             capture_output=True, check=True).stdout
        (ROOT / rel).write_bytes(png)
        print(f"wrote {rel} ({size}px)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
