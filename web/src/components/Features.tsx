import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { features, type FeatureVisual } from "../data";
import { BlurFade, NumberTicker } from "./magic";

function Visual({ kind }: { kind: FeatureVisual }) {
  if (kind === "chat") {
    return (
      <div className="space-y-2 rounded-2xl bg-black/40 p-5 text-sm leading-relaxed ring-1 ring-white/10">
        <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-3 py-2 text-white/85">
          What should I restock?
        </p>
        <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-accent/80 px-3 py-2 font-medium text-white">
          Milk and bread run out by Friday at this pace.
        </p>
        <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-3 py-2 text-white/85">
          Na Kiswahili?
        </p>
        <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-accent/80 px-3 py-2 font-medium text-white">
          Ndiyo — naelewa Kiswahili pia.
        </p>
      </div>
    );
  }
  if (kind === "stock") {
    return (
      <div className="space-y-3 rounded-2xl bg-black/30 p-5 ring-1 ring-white/10">
        {[
          ["Sugar 2kg", "w-3/4", "bg-glow", "41 left"],
          ["Milk 500ml", "w-1/3", "bg-amber-400", "9 left"],
          ["Bread", "w-1/6", "bg-red-400", "3 left — restock"],
        ].map(([label, w, c, note]) => (
          <div key={label}>
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-white/80">{label}</span>
              <span className="text-white/45">{note}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full ${c} ${w}`} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "sync") {
    return (
      <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
        {["Sale saved on phone", "Queued for sync", "Synced to cloud"].map((s, i) => (
          <div key={s} className="flex items-center gap-3 py-2 text-sm font-semibold">
            <span
              className={`flex size-6 items-center justify-center rounded-full ${
                i === 2 ? "bg-accent text-white shadow-glow-sm" : "bg-white/10 text-white/50"
              }`}
            >
              <Check size={13} strokeWidth={3} />
            </span>
            <span className={i === 2 ? "text-white" : "text-white/50"}>{s}</span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "cash") {
    return (
      <div className="rounded-2xl bg-accent/15 p-5 ring-1 ring-glow/30">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-glow/70">
          Sample week
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-glow">
          <NumberTicker value={128400} prefix="KES " />
        </p>
        <div className="mt-3 flex h-16 items-end gap-1.5" aria-hidden>
          {[35, 55, 42, 70, 58, 88, 100].map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%` }}
              className={`flex-1 rounded-t-md ${i === 6 ? "bg-glow" : "bg-glow/30"}`}
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/30">
      {[
        ["Anita N. — 3 items", "KES 1,250", "Paid"],
        ["Otis K. — invoice #1042", "KES 4,800", "Due"],
        ["Walk-in — 2 items", "KES 640", "Paid"],
        ["Salon Z. — invoice #1043", "KES 2,200", "Paid"],
      ].map(([a, b, s]) => (
        <li key={a} className="flex items-center justify-between px-4 py-3 text-[13px]">
          <span className="font-medium text-white/75">{a}</span>
          <span className="flex items-center gap-2">
            <span className="font-bold tabular-nums text-white">{b}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                s === "Paid" ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"
              }`}
            >
              {s}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Features() {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();
  const f = features[index];
  const Icon = f.icon;

  const step = (dir: 1 | -1) =>
    setIndex((i) => (i + dir + features.length) % features.length);

  return (
    <main className="bg-night mx-auto max-w-[1400px] px-4 pb-20 pt-28 md:px-8 md:pt-32">
      <BlurFade>
        <h1 className="max-w-[14ch] text-4xl font-extrabold leading-tight tracking-tight text-white md:text-6xl">
          What BizSawa does
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-white/60">
          Eight tools, one ledger. Pick any counter job on the left and see
          exactly how the app handles it — step by step.
        </p>
      </BlurFade>

      <div className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
        <BlurFade delay={0.05}>
          <div
            role="tablist"
            aria-label="Features"
            className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {features.map((item, i) => {
              const ItemIcon = item.icon;
              const active = i === index;
              return (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setIndex(i)}
                  className={`flex min-w-[220px] items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-300 lg:min-w-0 ${
                    active
                      ? "border-transparent bg-paper text-ink shadow-glow"
                      : "border-white/10 bg-white/[0.04] text-white hover:border-glow/50"
                  }`}
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                      active ? "bg-accent/15 text-accent" : "bg-accent/20 text-glow"
                    }`}
                  >
                    <ItemIcon size={19} strokeWidth={1.9} />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{item.title}</span>
                    <span
                      className={`block text-xs ${active ? "text-ink/60" : "text-white/45"}`}
                    >
                      {item.tagline}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </BlurFade>

        <BlurFade delay={0.1}>
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm md:p-9">
            <AnimatePresence mode="wait">
              <motion.div
                key={f.id}
                role="tabpanel"
                initial={reduce ? false : { opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? undefined : { opacity: 0, x: -20 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="grid gap-7 md:grid-cols-2">
                  <div>
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-glow">
                      <Icon size={14} /> {f.tagline}
                    </p>
                    <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
                      {f.title}
                    </h2>
                    <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                      {f.description}
                    </p>
                    <ol className="mt-5 space-y-3">
                      {f.steps.map((s, i) => (
                        <li key={s} className="flex items-start gap-3 text-sm font-medium text-white/80">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow-glow-sm">
                            {i + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-6">
                      <span className="text-5xl font-extrabold tracking-tight text-white">
                        {f.metric}
                      </span>{" "}
                      <span className="text-sm font-semibold text-white/50">
                        {f.metricLabel}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col justify-center">
                    <Visual kind={f.visual} />
                    <p className="mt-2 text-right text-[11px] text-white/35">
                      Sample data for illustration
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-5">
              <div className="flex gap-1.5" aria-hidden>
                {features.map((item, i) => (
                  <span
                    key={item.id}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === index ? "w-6 bg-glow" : "w-1.5 bg-white/15"
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => step(-1)}
                  aria-label="Previous feature"
                  className="flex size-11 items-center justify-center rounded-full border border-white/15 text-white transition-all hover:border-glow hover:text-glow active:scale-95"
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  onClick={() => step(1)}
                  aria-label="Next feature"
                  className="flex size-11 items-center justify-center rounded-full bg-accent text-white shadow-glow-sm transition-all hover:bg-accent-hover active:scale-95"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </main>
  );
}
