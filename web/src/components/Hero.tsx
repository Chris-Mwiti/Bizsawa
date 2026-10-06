import { motion, useReducedMotion } from "motion/react";
import { ArrowDownToLine, CloudOff, Play, Smartphone, Star } from "lucide-react";
import { strings, type Lang } from "../data";
import manifest from "../download.json";
import { NumberTicker, PulsingDot, ShimmerButton, ShineBorder } from "./magic";
import type { View } from "./Nav";

function CashTile() {
  return (
    <div className="rounded-2xl bg-ink p-4 text-white shadow-clinical-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/60">
        Today's cash
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        <NumberTicker value={48250} prefix="KES " />
      </p>
      <p className="mt-1 text-xs font-medium text-emerald-300">
        +12% vs yesterday
      </p>
    </div>
  );
}

function ReceiptRows() {
  const rows = [
    ["Anita N. — 3 items", "KES 1,250", true],
    ["Otis K. — invoice #1042", "KES 4,800", false],
    ["Walk-in — 1 item", "KES 350", true],
  ] as const;
  return (
    <ul className="divide-y divide-hairline rounded-2xl border border-hairline bg-surface">
      {rows.map(([name, amount, paid]) => (
        <li key={name} className="flex items-center justify-between px-4 py-3">
          <span className="text-[13px] font-medium text-ink-strong">{name}</span>
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tabular-nums">
              {amount}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                paid ? "bg-pos-soft text-pos" : "bg-[#F7EEDC] text-warn"
              }`}
            >
              {paid ? "Paid" : "Due"}
            </span>
          </span>
        </li>
      ))}
    </ul>
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

  return (
    <section className="relative overflow-hidden pt-[92px] md:pt-[104px]">
      {/* Backdrop: Nairobi at golden hour — the city whose dukas, salons
          and pharmacies BizSawa keeps books for. Cinematic ink scrims carry
          warm-white type; faint ledger rules tie the sky to the books. */}
      <div className="absolute inset-0" aria-hidden>
        <img
          src="/skyline.jpg"
          alt=""
          className="h-full w-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/25 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink/35 to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0 31px, rgb(255 255 255 / 0.07) 31px 32px)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-ink/65 to-transparent" />
      </div>

      <div className="relative mx-auto grid max-w-[1400px] gap-10 px-4 pb-10 pt-6 md:px-8 md:pt-8 lg:grid-cols-2 lg:gap-6 lg:pb-14">
        {/* Left: editorial headline */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-start justify-center"
        >
          <h1 className="font-display text-[15vw] font-medium leading-[0.95] tracking-tight text-[#FFFDF7] drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)] sm:text-7xl lg:text-7xl xl:text-8xl">
            THE
            <br />
            PERFECT
            <br />
            LEDGER
            <span className="align-super text-[0.35em]">®</span>
          </h1>
          <p className="mt-5 text-base font-medium text-white/85 md:text-lg">
            / {t.heroSub} /
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <ShimmerButton
              onClick={() => setView("features")}
              label="Start with BizSawa"
              tone="light"
            >
              {t.start}
            </ShimmerButton>
            {manifest.apkUrl ? (
              <a
                href={manifest.apkUrl}
                download
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-8 py-4 text-sm font-semibold tracking-[0.14em] text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/20 active:translate-y-0 active:scale-[0.98]"
              >
                <ArrowDownToLine size={16} />
                DOWNLOAD APP
              </a>
            ) : (
              <a
                href="#download"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-8 py-4 text-sm font-semibold tracking-[0.14em] text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/20 active:translate-y-0 active:scale-[0.98]"
              >
                <ArrowDownToLine size={16} />
                GET THE APP
              </a>
            )}
          </div>
          <p className="mt-4 flex items-center gap-2 rounded-full border border-white/25 bg-white/10 py-2 pl-3 pr-4 text-xs font-semibold text-white/85 backdrop-blur-sm">
            <CloudOff size={14} className="text-emerald-300" />
            No signal needed — sell offline, sync later
          </p>
        </motion.div>

        {/* Right: floating ledger card */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <div
            aria-hidden
            className="animate-float absolute -top-5 right-6 z-10 hidden items-center gap-2 rounded-full border border-hairline bg-surface/90 py-2 pl-3 pr-4 text-xs font-bold text-ink shadow-clinical-sm backdrop-blur-md lg:flex"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-pos-soft text-pos">
              <Smartphone size={13} />
            </span>
            M-Pesa received · KES 4,800
          </div>
          <ShineBorder radius={32} className="shadow-clinical">
            <div className="p-5 md:p-7">
              <div className="flex flex-wrap items-center gap-2">
                {["Sales", "Stock"].map((p) => (
                  <span
                    key={p}
                    className="rounded-full border border-hairline px-4 py-1.5 text-xs font-semibold text-ink-strong"
                  >
                    {p}
                  </span>
                ))}
                <span className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white">
                  AI
                </span>
              </div>
              <p className="mt-4 text-[26px] font-semibold leading-tight text-ink md:text-3xl">
                {t.cardTitleA}
                <br />
                {t.cardTitleB}
              </p>
              <p className="mt-1 text-sm text-ink-muted">{t.cardSub}</p>

              <div className="relative mt-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <CashTile />
                  <div className="relative overflow-hidden rounded-2xl shadow-clinical-sm">
                    <img
                      src="/shop.jpg"
                      alt="Shopkeeper serving a customer at the counter"
                      className="h-full min-h-[132px] w-full object-cover"
                      loading="lazy"
                    />
                    <button
                      onClick={() => setView("features")}
                      aria-label="Meet the AI coach"
                      className="absolute inset-0 flex items-center justify-center bg-ink/25 transition-colors hover:bg-ink/15"
                    >
                      <span className="flex items-center gap-2 rounded-full bg-surface/95 py-2 pl-3 pr-4 text-xs font-bold tracking-wider text-ink shadow-clinical-sm">
                        <span className="flex size-7 items-center justify-center rounded-full bg-accent text-white">
                          <Play size={13} fill="currentColor" />
                        </span>
                        AI COACH
                      </span>
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <ReceiptRows />
                  <p className="mt-2 text-right text-[11px] text-ink-subtle">
                    Sample data for illustration
                  </p>
                </div>
                <PulsingDot className="absolute -left-1 top-6" />
                <PulsingDot className="absolute right-8 top-1/2" />
                <PulsingDot className="absolute bottom-10 right-2" />
              </div>
            </div>
          </ShineBorder>
        </motion.div>
      </div>

      {/* Bottom strip over the field */}
      <div className="relative mx-auto grid max-w-[1400px] items-end gap-5 px-4 pb-12 md:grid-cols-[1.15fr_auto_1fr] md:px-8">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-t-[28px] bg-ink/85 p-6 text-white shadow-clinical ring-1 ring-white/15 backdrop-blur-md"
        >
          <p className="text-xl font-semibold leading-snug md:text-2xl">
            {t.stripTitle}
          </p>
          <p className="mt-1 max-w-[38ch] text-sm leading-relaxed text-white/75">
            {t.stripBody}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/12 px-3 py-1.5 ring-1 ring-white/20">
              12 sales saved offline
            </span>
            <span aria-hidden className="text-white/50">
              →
            </span>
            <span className="rounded-full bg-accent px-3 py-1.5 text-white">
              Synced 09:41
            </span>
          </div>
        </motion.div>

        <div className="text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
          <span className="flex gap-0.5" aria-label="Rated 4.9 out of 5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={13} fill="currentColor" strokeWidth={0} className="text-[#c98a0b]" />
            ))}
          </span>
          <p className="mt-1 text-xs font-semibold">
            Loved from Nairobi to Arusha
          </p>
        </div>

        <p className="text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] md:text-right md:text-[28px]">
          {t.stripRight}
        </p>
      </div>
    </section>
  );
}
