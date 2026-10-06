import { motion, useReducedMotion } from "motion/react";
import {
  ArrowDownToLine,
  ArrowRight,
  CloudOff,
  Play,
  ScanLine,
} from "lucide-react";
import { strings, type Lang } from "../data";
import manifest from "../download.json";
import { NumberTicker, PulsingDot, ShimmerButton } from "./magic";
import type { View } from "./Nav";

/* A mini working preview of the app's ledger — the product under the
   spotlight, ringed in the brand's teal glow. */
function LedgerPhone() {
  return (
    <div className="relative w-60 rounded-[2rem] border border-hairline bg-surface p-4 shadow-clinical sm:w-64">
      <div className="mx-auto h-1.5 w-16 rounded-full bg-ink/10" aria-hidden />
      <div className="mt-4 rounded-2xl bg-ink p-3.5 text-white shadow-clinical-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
          Today's cash
        </p>
        <p className="mt-0.5 text-xl font-bold tabular-nums">
          <NumberTicker value={48250} prefix="KES " />
        </p>
        <p className="mt-0.5 text-[11px] font-semibold text-emerald-300">
          +12% vs yesterday
        </p>
      </div>
      <ul className="mt-2.5 divide-y divide-hairline rounded-2xl border border-hairline bg-paper">
        {(
          [
            ["Anita N. — 3 items", "1,250", true],
            ["Otis K. — inv #1042", "4,800", false],
            ["M-Pesa in — Till", "4,800", true],
          ] as [string, string, boolean][]
        ).map(([name, amount, paid]) => (
          <li key={name} className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] font-medium text-ink-strong">{name}</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold tabular-nums text-ink">
                {amount}
              </span>
              <span
                className={`size-1.5 rounded-full ${paid ? "bg-pos" : "bg-warn"}`}
                aria-hidden
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-center text-[10px] text-ink-subtle">
        Sample data for illustration
      </p>
    </div>
  );
}

export function Hero({
  lang,
  setView,
}: {
  lang: Lang;
  setView: (v: View) => void;
}) {
  const t = strings[lang];
  const reduce = useReducedMotion();
  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 32 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section className="relative overflow-hidden bg-paper pt-[92px] md:pt-[104px]">
      {/* Backdrop: golden-hour city softened with paper scrims so ink type
          stays contrast-safe; faint ledger rules tie the scene to the books. */}
      <div className="absolute inset-0" aria-hidden>
        <img
          src="/skyline.jpg"
          alt=""
          className="h-full w-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/60 to-paper/25" />
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0 31px, rgb(14 31 28 / 0.05) 31px 32px)",
          }}
        />
        <div className="absolute left-1/2 top-1/3 size-[560px] -translate-x-1/4 rounded-full bg-accent/15 blur-[140px]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-paper via-paper/60 to-transparent" />
      </div>

      <div className="relative mx-auto grid max-w-[1400px] items-center gap-12 px-4 pb-10 pt-6 md:px-8 md:pt-10 lg:grid-cols-[1fr_auto_0.9fr] lg:gap-8">
        {/* Left: headline + CTAs */}
        <motion.div {...enter(0)} className="flex flex-col items-start">
          <p className="flex items-center gap-2 rounded-full border border-hairline bg-surface/70 px-4 py-2 text-xs font-semibold text-ink-strong backdrop-blur-sm">
            <ScanLine size={14} className="text-accent" />
            {t.heroEyebrow}
          </p>
          <h1 className="mt-5 text-6xl font-extrabold leading-[0.95] tracking-tight text-ink sm:text-7xl xl:text-8xl">
            {t.heroTitleA}
            <br />
            {t.heroTitleB}
          </h1>
          <p className="mt-5 text-base font-medium text-ink-strong md:text-lg">
            / {t.heroSub} /
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <ShimmerButton onClick={() => setView("features")} label="Explore features">
              <span className="flex items-center gap-2">
                {t.explore}
                <ArrowRight size={15} />
              </span>
            </ShimmerButton>
            {manifest.apkUrl ? (
              <a
                href={manifest.apkUrl}
                download
                className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-surface/70 px-8 py-4 text-sm font-semibold tracking-[0.14em] text-ink backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-accent hover:text-accent active:translate-y-0 active:scale-[0.98]"
              >
                <ArrowDownToLine size={16} />
                DOWNLOAD APP
              </a>
            ) : (
              <a
                href="#download"
                className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-surface/70 px-8 py-4 text-sm font-semibold tracking-[0.14em] text-ink backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-accent hover:text-accent active:translate-y-0 active:scale-[0.98]"
              >
                <ArrowDownToLine size={16} />
                GET THE APP
              </a>
            )}
          </div>
        </motion.div>

        {/* Center: product spotlight */}
        <motion.div {...enter(0.15)} className="relative mx-auto">
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 size-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/40 shadow-glow"
          />
          <div
            aria-hidden
            className="animate-orbit absolute left-1/2 top-1/2 size-[440px] -translate-x-1/2 -translate-y-1/2"
          >
            <span className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 rounded-full bg-accent shadow-glow-sm" />
          </div>
          <div className="relative">
            <LedgerPhone />
            <PulsingDot className="absolute -right-3 top-16" />
            <PulsingDot className="absolute -left-4 bottom-24" />
          </div>
          <div
            aria-hidden
            className="animate-float absolute -right-40 top-10 hidden items-center gap-2 rounded-full border border-hairline bg-surface/90 px-4 py-2 text-xs font-bold text-ink shadow-clinical-sm backdrop-blur-md xl:flex"
          >
            <span className="size-2 rounded-full bg-pos" />
            Stock synced
          </div>
          <div
            aria-hidden
            className="animate-float absolute -left-44 bottom-16 hidden items-center gap-2 rounded-full border border-hairline bg-surface/90 px-4 py-2 text-xs font-bold text-ink shadow-clinical-sm backdrop-blur-md [animation-delay:2s] xl:flex"
          >
            <span className="size-2 rounded-full bg-accent" />
            M-Pesa in · 4,800
          </div>
        </motion.div>

        {/* Right: glass coach card */}
        <motion.div {...enter(0.25)}>
          <div className="rounded-2xl border border-hairline bg-surface/85 p-5 shadow-clinical backdrop-blur-md">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView("features")}
                aria-label="Meet the AI coach"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-glow-sm transition-transform hover:scale-105 active:scale-95"
              >
                <Play size={16} fill="currentColor" />
              </button>
              <p className="text-base font-bold text-ink">AI Coach inside</p>
            </div>
            <div className="mt-4 space-y-2 text-[13px] leading-relaxed">
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-sunken px-3 py-2 text-ink-strong">
                Which customers owe invoices?
              </p>
              <p className="w-fit max-w-[95%] rounded-2xl rounded-bl-md bg-accent px-3 py-2 font-medium text-white">
                3 invoices · KES 12,400. Send WhatsApp reminders?
              </p>
            </div>
            <div className="mt-4 border-t border-hairline pt-3">
              <p className="text-sm font-bold text-ink">Reinforced records</p>
              <p className="text-xs text-ink-muted">Every figure explained.</p>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-white">
                en + sw
              </span>
              <span className="rounded-full border border-ink/15 px-3 py-1 text-[11px] font-bold text-ink-muted">
                offline-first
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom strip */}
      <div className="relative border-t border-ink/10">
        <div className="mx-auto grid max-w-[1400px] items-center gap-6 px-4 py-6 md:grid-cols-3 md:px-8">
          <div className="rounded-xl border border-accent-border bg-accent-soft p-4">
            <div className="flex items-end gap-1" aria-hidden>
              {[40, 65, 50, 85, 70, 100].map((h, i) => (
                <span
                  key={i}
                  style={{ height: `${h * 0.4}px` }}
                  className={`w-5 rounded-t ${i === 5 ? "bg-accent shadow-glow-sm" : "bg-accent/35"}`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs font-bold text-ink">
              Sugar 2kg · restocked Friday
            </p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-ink md:text-2xl">
              Explore Rapid Restocking
            </p>
            <button
              onClick={() => {
                setView("features");
                window.scrollTo({ top: 0 });
              }}
              className="mt-1 text-xs font-bold tracking-[0.2em] text-accent underline underline-offset-4 hover:text-ink"
            >
              DISCOVER NOW
            </button>
          </div>
          <div className="flex items-center justify-start gap-2.5 md:justify-end">
            <span className="flex size-9 items-center justify-center rounded-full border border-hairline bg-surface text-accent">
              <CloudOff size={16} />
            </span>
            <p className="max-w-[26ch] text-xs font-semibold leading-relaxed text-ink-muted">
              Works without signal across the region.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
