import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CloudOff,
  MessageCircle,
  RefreshCw,
  ScanLine,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { features } from "../data";
import { BlurFade, Marquee, NumberTicker, PulsingDot, ShimmerButton } from "./magic";
import { DownloadApp } from "./DownloadApp";
import type { View } from "./Nav";

const trades = [
  "Duka",
  "Salon",
  "Pharmacy",
  "Hardware",
  "Boutique",
  "Café",
  "Agrovet",
  "Tailor",
  "Grocer",
];

function BentoCard({
  featureId,
}: {
  featureId: string;
}) {
  const f = features.find((x) => x.id === featureId)!;
  const Icon = f.icon;
  return (
    <article className="flex h-full flex-col rounded-[28px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/20 text-glow">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <h3 className="mt-4 text-lg font-bold text-white">{f.title}</h3>
      <p className="mt-1 text-sm font-semibold text-glow">{f.tagline}</p>
      <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-white/60">
        {f.description}
      </p>
      {f.visual === "receipt" && (
        <ul className="mt-4 divide-y divide-white/10 rounded-2xl bg-black/30 ring-1 ring-white/10">
          {[
            ["Today · 34 sales", "KES 21,900"],
            ["2 invoices due", "KES 6,100"],
          ].map(([a, b]) => (
            <li
              key={a}
              className="flex items-center justify-between px-4 py-2.5 text-[13px]"
            >
              <span className="font-medium text-white/75">{a}</span>
              <span className="font-bold tabular-nums text-white">{b}</span>
            </li>
          ))}
        </ul>
      )}
      {f.visual === "chat" && (
        <div className="mt-4 space-y-2 rounded-2xl bg-black/40 p-4 text-[13px] leading-relaxed ring-1 ring-white/10">
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-3 py-2 text-white/85">
            Which customers owe invoices?
          </p>
          <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-accent/80 px-3 py-2 font-medium text-white">
            3 invoices · KES 12,400. Send WhatsApp reminders?
          </p>
        </div>
      )}
      {f.visual === "sync" && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/5 p-4 text-xs font-semibold ring-1 ring-white/10">
          <CloudOff size={15} className="text-white/50" />
          <span className="text-white/80">No signal — still selling</span>
          <RefreshCw size={15} className="ml-auto text-glow" />
          <span className="text-glow">Synced</span>
        </div>
      )}
      {f.visual === "cash" && (
        <p className="mt-4 rounded-2xl bg-accent/15 p-4 text-2xl font-bold tabular-nums text-glow ring-1 ring-glow/30">
          <NumberTicker value={128400} prefix="KES " />
        </p>
      )}
      {f.visual === "stock" && (
        <div className="mt-4 space-y-2 rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
          {[
            ["Sugar 2kg", "w-3/4", "bg-glow"],
            ["Milk 500ml", "w-1/3", "bg-amber-400"],
            ["Bread", "w-1/6", "bg-red-400"],
          ].map(([label, w, c]) => (
            <div key={label} className="flex items-center gap-3 text-xs font-semibold">
              <span className="w-20 text-white/75">{label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <span className={`block h-full rounded-full ${c} ${w}`} />
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function Landing({
  setView,
}: {
  lang: unknown;
  setView: (v: View) => void;
}) {
  return (
    <main className="bg-night">
      {/* Trust strip: one marquee for the whole page */}
      <section aria-label="Trades BizSawa serves" className="border-y border-white/10 bg-white/[0.02]">
        <Marquee className="py-4">
          {[0, 1].map((half) => (
            <div key={half} className="flex items-center" aria-hidden={half === 1}>
              {trades.map((tr) => (
                <span key={`${half}-${tr}`} className="flex items-center">
                  <span className="px-6 text-sm font-bold uppercase tracking-[0.2em] text-white/45">
                    {tr}
                  </span>
                  <span className="size-1.5 rounded-full bg-glow" aria-hidden />
                </span>
              ))}
            </div>
          ))}
        </Marquee>
      </section>

      {/* Bento preview */}
      <section className="mx-auto max-w-[1400px] px-4 py-16 md:px-8 md:py-24">
        <BlurFade>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-[16ch] text-4xl font-extrabold leading-tight tracking-tight text-white md:text-5xl">
              Everything the counter needs
            </h2>
            <button
              onClick={() => {
                setView("features");
                window.scrollTo({ top: 0 });
              }}
              className="group flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-glow hover:text-glow"
            >
              Explore all features
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </BlurFade>
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <BlurFade className="lg:col-span-2">
            <BentoCard featureId="pos" />
          </BlurFade>
          <BlurFade delay={0.08}>
            <BentoCard featureId="coach" />
          </BlurFade>
          <BlurFade>
            <BentoCard featureId="mpesa" />
          </BlurFade>
          <BlurFade delay={0.08}>
            <BentoCard featureId="offline" />
          </BlurFade>
          <BlurFade delay={0.12}>
            <BentoCard featureId="analytics" />
          </BlurFade>
        </div>
      </section>

      {/* AI coach split */}
      <section className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 pb-16 md:px-8 md:pb-24 lg:grid-cols-2">
        <BlurFade>
          <div className="rounded-[28px] border border-glow/25 bg-gradient-to-br from-accent/20 via-night-soft to-night p-6 shadow-glow md:p-8">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">
              <Sparkles size={14} className="text-glow" /> AI Coach · English na Kiswahili
            </p>
            <div className="mt-5 space-y-3 text-[15px] leading-relaxed">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-4 py-3 text-white/85">
                Show my top products last week
              </p>
              <p className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-accent/80 px-4 py-3 font-medium text-white">
                Sugar 2kg leads with 41 units · KES 9,840. Milk is climbing
                again — restock before Friday.
              </p>
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-4 py-3 text-white/85">
                Remind everyone who owes me
              </p>
              <p className="flex w-fit max-w-[92%] items-center gap-2 rounded-2xl rounded-bl-md bg-paper px-4 py-3 font-semibold text-ink">
                <MessageCircle size={16} className="text-pos" />
                3 WhatsApp reminders queued
                <Check size={16} className="text-pos" />
              </p>
            </div>
          </div>
        </BlurFade>
        <BlurFade delay={0.1}>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white md:text-5xl">
            Ask about your own numbers
          </h2>
          <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-white/60">
            The coach reads your real sales, stock and invoices — then acts.
            Reminders, restock lists and plain-language explanations, answered
            from your ledger, not from the internet.
          </p>
          <ul className="mt-6 space-y-3">
            {["Works on your data, per business", "Sends WhatsApp reminders for you", "Explains every figure it shows"].map(
              (li) => (
                <li key={li} className="flex items-center gap-3 text-sm font-medium text-white/80">
                  <span className="flex size-6 items-center justify-center rounded-full bg-accent/25 text-glow">
                    <Check size={14} strokeWidth={3} />
                  </span>
                  {li}
                </li>
              ),
            )}
          </ul>
        </BlurFade>
      </section>

      {/* Offline band */}
      <section className="mx-auto max-w-[1400px] px-4 pb-16 md:px-8 md:pb-24">
        <BlurFade>
          <div className="grid items-center gap-8 rounded-[28px] border border-white/10 bg-white/[0.03] p-6 md:p-10 lg:grid-cols-2">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">
                <CloudOff size={14} className="text-glow" /> Offline-first
              </p>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-white md:text-4xl">
                No bars, no problem
              </h2>
              <p className="mt-3 max-w-[48ch] text-base leading-relaxed text-white/60">
                Your phone is the source of truth. Sell through blackouts and
                basement stockrooms; every change syncs itself when you are
                back — never double-charged.
              </p>
            </div>
            <ol className="space-y-0">
              {[
                { t: "09:12 — Sale saved on phone", d: "Works fully offline", on: false },
                { t: "09:12 — Queued for sync", d: "Automatic, in order", on: false },
                { t: "09:41 — Synced to cloud", d: "Receipts, stock, cash aligned", on: true },
              ].map((s, i) => (
                <li key={s.t} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < 2 && (
                    <span aria-hidden className="absolute left-[13px] top-7 h-full w-px bg-white/15" />
                  )}
                  <span className="relative mt-1">
                    {s.on ? <PulsingDot /> : (
                      <span className="block size-3 rounded-full border-2 border-white/25 bg-night" aria-hidden />
                    )}
                  </span>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <p className="text-sm font-bold text-white">{s.t}</p>
                    <p className="text-[13px] text-white/55">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </BlurFade>
      </section>

      <DownloadApp />

      {/* Closing CTA */}
      <section className="mx-auto max-w-[1400px] px-4 pb-20 text-center md:px-8 md:pb-28">
        <BlurFade>
          <h2 className="mx-auto max-w-[20ch] text-4xl font-extrabold leading-tight tracking-tight text-white md:text-6xl">
            Open at 7am. Trust the books at night.
          </h2>
          <div className="mt-8 flex justify-center">
            <ShimmerButton onClick={() => { setView("features"); window.scrollTo({ top: 0 }); }} label="Start with BizSawa">
              START
            </ShimmerButton>
          </div>
          <p className="mt-5 text-sm font-medium text-white/50">
            Android · iOS · M-Pesa ready · English na Kiswahili
          </p>
        </BlurFade>
      </section>
    </main>
  );
}

export function Footer({ setView }: { setView: (v: View) => void }) {
  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };
  return (
    <footer className="border-t border-white/10 bg-black/30 text-white">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div>
          <p className="flex items-center gap-2.5">
            <img
              src="/logo-mark.png"
              alt="BizSawa logo"
              className="size-8 rounded-lg object-cover"
            />
            <span className="text-sm font-bold tracking-[0.22em]">BIZSAWA</span>
          </p>
          <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-white/55">
            The operating system for small trade. Sales, stock, invoices,
            M-Pesa and an AI coach — offline-first, from Nairobi to Arusha.
          </p>
        </div>
        <nav aria-label="Product">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Product</p>
          <ul className="mt-4 space-y-2.5 text-sm font-medium">
            {[
              { l: "Features", v: "features" as View },
              { l: "AI Coach", v: "features" as View },
              { l: "Offline", v: "features" as View },
              { l: "Home", v: "landing" as View },
            ].map((x) => (
              <li key={x.l}>
                <button onClick={() => go(x.v)} className="text-white/70 transition-colors hover:text-white">
                  {x.l}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Counter</p>
          <ul className="mt-4 space-y-2.5 text-sm font-medium text-white/70">
            <li className="flex items-center gap-2"><ScanLine size={15} /> Sale in under 10 seconds</li>
            <li className="flex items-center gap-2"><Smartphone size={15} /> M-Pesa native</li>
            <li>
              <a href="#top" onClick={() => window.scrollTo({ top: 0 })} className="flex items-center gap-1 hover:text-white">
                Contact us <ArrowUpRight size={15} />
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-[1400px] px-4 py-5 text-xs text-white/40 md:px-8">
          © 2026 BizSawa · Trusted, grounded, precise
        </p>
      </div>
    </footer>
  );
}
