/**
 * The moving parts of the organisers landing page: the phone that buys tickets while the example dashboard
 * updates, the ticket that is resold, scanned and torn as the page scrolls, the feature picker and the field of
 * squares behind the last call to action. Everything is display only and runs on example figures.
 *
 * `mountOrganizersLanding` starts it all inside `root` and returns the function that stops it (timers, observers,
 * listeners and the animation frame), so leaving the page leaves nothing running.
 */

const EXAMPLE_PRICE = 25;

export function mountOrganizersLanding(root: HTMLElement, opts: { feeEuros: number }): () => void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const $ = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ol="${name}"]`)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string, r: ParentNode = root) => [...r.querySelectorAll<T>(sel)];
  const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const eur = (v: number) => "€" + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // The site header is fixed above the page: 64px, 80px from the `md` breakpoint (HeaderNight).
  const hdrH = () => (innerWidth >= 768 ? 80 : 64);
  const rng = (seed: number) => {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  let alive = true;
  const ac = new AbortController();
  const on = { signal: ac.signal, passive: true } as const;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const wait = (ms: number) => new Promise<void>((resolve) => later(resolve, ms));
  const observers: IntersectionObserver[] = [];

  /* how far a pinned chapter has been scrolled through, 0 to 1 */
  const prog = (sec: HTMLElement) => {
    const r = sec.getBoundingClientRect();
    const h = hdrH();
    const total = r.height - (innerHeight - h);
    return total > 0 ? clamp((h - r.top) / total) : 0;
  };

  /* ───────── hero: a guest buys on the phone, the dashboard updates ───────── */
  const heroSec = $("hero");
  const hCopy = $("hCopy");
  const phoneWrap = $("phoneWrap");
  const hero = () => {
    const r = heroSec.getBoundingClientRect();
    const s = reduce ? 0 : clamp((hdrH() - r.top) / (r.height * 0.9));
    hCopy.style.transform = `translateY(${(-s * 40).toFixed(1)}px)`;
    phoneWrap.style.transform = `translateY(${(-s * 140).toFixed(1)}px)`;
  };
  const phone = $("phone");
  const qN = $("qN");
  const qTot = $("qTot");
  const tap = $("tap");
  const qPlus = $("qPlus");
  const qPay = $("qPay");
  const qPayL = $("qPayL");
  const dN = $("dN");
  const phQr = $<HTMLCanvasElement>("phQr");
  const phScreen = $("phScreen");
  const unit = EXAMPLE_PRICE + opts.feeEuros;
  const buyers: [string, number][] = [["Camille R.", 2], ["Hugo M.", 1], ["Inès B.", 3], ["Lucas D.", 2], ["Sarah K.", 1], ["Nathan P.", 4]];
  let bi = 0;
  const tapAt = (el: HTMLElement) => {
    const sr = phScreen.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const k = sr.width / 280 || 1;
    tap.style.left = (r.left + r.width / 2 - sr.left) / k + "px";
    tap.style.top = (r.top + r.height / 2 - sr.top) / k + "px";
    tap.classList.remove("on");
    void tap.offsetWidth;
    tap.classList.add("on");
    el.classList.add("hit");
    later(() => el.classList.remove("hit"), 160);
  };
  const setQty = (n: number) => {
    qN.textContent = String(n);
    qTot.textContent = eur(n * unit);
    qPay.classList.toggle("ready", n > 0);
    qPayL.textContent = n > 0 ? "Pay " + eur(n * unit) : "Choose tickets";
  };

  /* a QR-looking pattern (not a real code): random modules with the three finder squares */
  const Q = 25;
  const bits = (seed: number) => {
    const R = rng(seed);
    const b = new Uint8Array(Q * Q);
    for (let i = 0; i < Q * Q; i++) b[i] = R() > 0.52 ? 1 : 0;
    const finder = (a: number, c: number) => {
      for (let y = -1; y < 8; y++)
        for (let x = -1; x < 8; x++) {
          const X = a + x;
          const Y = c + y;
          if (X < 0 || Y < 0 || X >= Q || Y >= Q) continue;
          const inside = x >= 0 && y >= 0 && x < 7 && y < 7;
          b[Y * Q + X] = inside && (x === 0 || y === 0 || x === 6 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5)) ? 1 : 0;
        }
    };
    finder(0, 0);
    finder(Q - 7, 0);
    finder(0, Q - 7);
    return b;
  };
  const paintPhQr = (seed: number) => {
    const g = phQr.getContext("2d");
    if (!g) return;
    const b = bits(seed);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, Q, Q);
    g.fillStyle = "#0b1024";
    for (let i = 0; i < Q * Q; i++) if (b[i]) g.fillRect(i % Q, (i / Q) | 0, 1, 1);
  };

  const vis = new Map<Element, boolean>();
  async function buyLoop() {
    while (alive) {
      while (alive && (document.hidden || vis.get(heroSec) === false)) await wait(400);
      if (!alive) return;
      const [name, q] = buyers[bi++ % buyers.length];
      phone.classList.remove("paid", "paying");
      setQty(0);
      await wait(1100);
      for (let n = 1; n <= q; n++) {
        tapAt(qPlus);
        await wait(170);
        setQty(n);
        await wait(480);
      }
      await wait(350);
      tapAt(qPay);
      await wait(180);
      phone.classList.add("paying");
      await wait(1000);
      paintPhQr(40 + bi);
      dN.textContent = q + (q > 1 ? " tickets" : " ticket");
      phone.classList.remove("paying");
      phone.classList.add("paid");
      await wait(450);
      addSale(name, q);
      await wait(2700);
    }
  }

  /* ───────── the ticket: bought, resold, scanned, used ───────── */
  const tPin = $("ticketPin");
  const tk = $("tk");
  const toast = $("toast");
  const fake = $("fake");
  const sts = $$(".st");
  const bars = $$('[data-ol="prog"] i');
  const state = $("tkState");
  const code = $("tkCode");
  const qx = $<HTMLCanvasElement>("tkQr").getContext("2d");
  const qA = bits(11);
  const qB = bits(29);
  const qRand = rng(5);
  const qT = Float32Array.from({ length: Q * Q }, () => qRand());
  const paintQr = (k: number) => {
    if (!qx) return;
    qx.fillStyle = "#fff";
    qx.fillRect(0, 0, Q, Q);
    qx.fillStyle = "#0b1024";
    for (let i = 0; i < Q * Q; i++) if ((qT[i] < k ? qB : qA)[i]) qx.fillRect(i % Q, (i / Q) | 0, 1, 1);
  };
  let qrK = 0;
  let qrTarget = 0;
  let step = -1;
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  paintQr(0);
  const ticket = (p: number) => {
    const s = Math.min(3, Math.floor(p * 4));
    const local = clamp(p * 4 - s);
    bars.forEach((b, i) => b.style.setProperty("--f", i < s ? "1" : i === s ? local.toFixed(3) : "0"));
    if (s !== step) {
      const prev = step;
      step = s;
      sts.forEach((el, i) => el.classList.toggle("on", i === s));
      tk.classList.toggle("resold", s >= 1);
      qrTarget = s >= 1 ? 1 : 0;
      code.textContent = s >= 1 ? "TS-Q82M-4LWE" : "TS-7F3K-29QD";
      toast.classList.toggle("on", s === 1);
      if (scanTimer) clearTimeout(scanTimer);
      if (s === 2 && prev < 2 && !reduce) {
        tk.classList.remove("admitted");
        tk.classList.add("scanning");
        scanTimer = later(() => {
          tk.classList.remove("scanning");
          if (step >= 2) tk.classList.add("admitted");
        }, 950);
      } else {
        tk.classList.remove("scanning");
        tk.classList.toggle("admitted", s >= 2);
      }
      state.className = "state" + ["", " re", " ok", " used"][s];
      state.textContent = ["Valid · scans once", "Re-issued to Sarah K.", "Admitted · 23:12", "Used · 23:12"][s];
      fake.classList.toggle("on", s === 3);
    }
    tk.style.setProperty("--tear", s === 3 ? ease(clamp(local * 1.6)).toFixed(3) : "0");
  };
  if (fine && !reduce) {
    const stg = root.querySelector<HTMLElement>(".tk-stage")!;
    stg.addEventListener(
      "pointermove",
      (e) => {
        const r = stg.getBoundingClientRect();
        tk.style.transform = `rotateY(${((e.clientX - r.left) / r.width - 0.5) * 12}deg) rotateX(${-((e.clientY - r.top) / r.height - 0.5) * 8}deg)`;
      },
      on,
    );
    stg.addEventListener("pointerleave", () => (tk.style.transform = ""), on);
  }

  /* ───────── the example dashboard: tilts flat as it arrives, then counts up ───────── */
  const boxes = $$(".scale-box");
  const fit = () =>
    boxes.forEach((b) => {
      const s = b.clientWidth / Number(b.dataset.w);
      (b.firstElementChild as HTMLElement).style.transform = `scale(${s})`;
      b.style.height = Number(b.dataset.h) * s + "px";
    });
  const tilt = $("tilt");
  const tiltDash = () => {
    if (reduce) return;
    const r = tilt.getBoundingClientRect();
    const t = ease(clamp(1 - (r.top - hdrH() - 40) / (innerHeight * 0.75)));
    tilt.style.transform = `perspective(1800px) rotateX(${((1 - t) * 26).toFixed(2)}deg) scale(${(0.9 + 0.1 * t).toFixed(4)})`;
    tilt.style.opacity = (0.35 + 0.65 * t).toFixed(3);
  };
  const countUp = (el: HTMLElement, to: () => number, ms = 1600) => {
    if (reduce) {
      el.textContent = to().toLocaleString("en-GB");
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      if (!alive) return;
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(to() * (1 - Math.pow(1 - p, 3))).toLocaleString("en-GB");
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const stageEl = $("stage");
  const revEl = $("rev");
  const soldEl = $("sold");
  let rev = 16100;
  let soldN = 642;
  let live = false;
  const people: [string, string, number][] = [["Emma S.", "2 × Regular", 50], ["Hugo M.", "1 × Last release", 30], ["Inès B.", "1 × Regular", 25], ["Lucas D.", "3 × Regular", 75]];
  const ago = ["now", "1 min ago", "3 min ago", "6 min ago"];
  const feed = $("feed");
  const row = (p: [string, string, number], fresh: boolean) => {
    const d = document.createElement("div");
    d.className = "sale" + (fresh ? " fresh" : "");
    const av = document.createElement("span");
    av.className = "av";
    av.textContent = p[0][0];
    const who = document.createElement("div");
    const b = document.createElement("b");
    b.textContent = p[0];
    const sm = document.createElement("small");
    sm.textContent = p[1];
    who.append(b, sm);
    const amt = document.createElement("span");
    amt.className = "amt";
    amt.append(`+€${p[2]}`, document.createElement("small"));
    d.append(av, who, amt);
    return d;
  };
  const stampFeed = () => $$(".sale", feed).forEach((r, i) => (r.querySelector(".amt small")!.textContent = ago[i] || ""));
  function addSale(name: string, q: number) {
    $$(".sale.fresh", feed).forEach((r) => r.classList.remove("fresh"));
    feed.prepend(row([name, q + " × Regular", q * EXAMPLE_PRICE], true));
    while (feed.children.length > 4) feed.lastElementChild!.remove();
    stampFeed();
    rev += q * EXAMPLE_PRICE;
    soldN += q;
    revEl.textContent = rev.toLocaleString("en-GB");
    soldEl.textContent = soldN.toLocaleString("en-GB");
    [$("revK"), $("soldK")].forEach((el) => {
      el.classList.add("bump");
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("bump")));
    });
  }
  feed.replaceChildren(...people.map((p) => row(p, false)));
  stampFeed();
  revEl.textContent = rev.toLocaleString("en-GB");
  soldEl.textContent = String(soldN);
  const stageIo = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting || live) return;
        live = true;
        stageIo.disconnect();
        stageEl.classList.add("drawn");
        $$(".bar i", stageEl).forEach((i) => (i.style.width = i.dataset.w ?? ""));
        countUp(revEl, () => rev);
        countUp(soldEl, () => soldN);
      }),
    { threshold: 0.25 },
  );
  stageIo.observe(stageEl);
  observers.push(stageIo);

  /* ───────── reveals and the feature picker ───────── */
  const rvs = $$(".rv");
  if (!reduce) {
    rvs.forEach((el) => {
      if (el.getBoundingClientRect().top > innerHeight) el.classList.add("pre");
    });
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.remove("pre");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    rvs.forEach((el) => io.observe(el));
    observers.push(io);
  }
  const fis = $$(".fi");
  const fvs = $$(".feat-stage .fv");
  let featOn = 0;
  const pickFeature = () => {
    const mid = innerHeight * 0.5;
    let best = 0;
    let bd = Infinity;
    fis.forEach((fi, i) => {
      const r = fi.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best === featOn) return;
    featOn = best;
    fis.forEach((fi, i) => fi.classList.toggle("on", i === best));
    fvs.forEach((fv, i) => fv.classList.toggle("on", i === best));
  };

  /* ───────── last call to action: a field of squares that answers the pointer ───────── */
  const fc = $<HTMLCanvasElement>("finCv");
  const fx = fc.getContext("2d");
  const band = $("band");
  let FW = 0;
  let FH = 0;
  let fmx = -999;
  let fmy = -999;
  const fitFin = () => {
    const r = band.getBoundingClientRect();
    const d = Math.min(2, devicePixelRatio || 1);
    FW = r.width;
    FH = r.height;
    fc.width = Math.max(1, FW * d);
    fc.height = Math.max(1, FH * d);
    fx?.setTransform(d, 0, 0, d, 0, 0);
  };
  band.addEventListener(
    "pointermove",
    (e) => {
      const r = band.getBoundingClientRect();
      fmx = e.clientX - r.left;
      fmy = e.clientY - r.top;
    },
    on,
  );
  band.addEventListener("pointerleave", () => (fmx = fmy = -999), on);
  const drawFin = (t: number) => {
    if (!fx) return;
    fx.clearRect(0, 0, FW, FH);
    const g = 28;
    for (let y = g / 2; y < FH; y += g)
      for (let x = g / 2; x < FW; x += g) {
        const d = Math.hypot(x - fmx, y - fmy);
        const wave = 0.5 + 0.5 * Math.sin(x * 0.012 + y * 0.018 - t * 0.0011);
        const near = clamp(1 - d / 170);
        const s = 2 + wave * 2.5 + near * 10;
        fx.fillStyle = `rgba(255,255,255,${(0.05 + wave * 0.07 + near * 0.4).toFixed(3)})`;
        fx.fillRect(x - s / 2, y - s / 2, s, s);
      }
  };

  /* ───────── links to a section of the page scroll there, below the site header ───────── */
  root.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const el = document.getElementById(a.getAttribute("href")!.slice(1));
      if (!el) return;
      e.preventDefault();
      const top = el.getBoundingClientRect().top + scrollY - hdrH();
      scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    },
    { signal: ac.signal },
  );

  /* ───────── one loop for everything ───────── */
  const vio = new IntersectionObserver((entries) => entries.forEach((e) => vis.set(e.target, e.isIntersecting)), { rootMargin: "120px" });
  [heroSec, tPin, band].forEach((el) => vio.observe(el));
  observers.push(vio);
  const resize = () => {
    fit();
    fitFin();
  };
  resize();
  addEventListener("resize", resize, on);
  if (reduce) drawFin(0);
  ticket(prog(tPin));
  hero();
  if (reduce) setQty(2);
  else {
    setQty(0);
    later(() => void buyLoop(), 1400);
  }
  let raf = requestAnimationFrame(function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    if (vis.get(heroSec) !== false) hero();
    if (vis.get(tPin)) ticket(prog(tPin));
    if (qrK !== qrTarget) {
      qrK = reduce ? qrTarget : clamp(qrK + (qrTarget > qrK ? 0.06 : -0.06));
      paintQr(qrK);
    }
    if (vis.get(band) && !reduce) drawFin(now);
    pickFeature();
    tiltDash();
  });

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ac.abort();
    timers.forEach(clearTimeout);
    timers.clear();
    observers.forEach((o) => o.disconnect());
  };
}
