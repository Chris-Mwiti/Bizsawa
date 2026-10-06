import { Menu, X } from "lucide-react";
import { useState } from "react";
import { strings, type Lang } from "../data";

export type View = "landing" | "features";

export function Nav({
  lang,
  setLang,
  setView,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  setView: (v: View) => void;
}) {
  const t = strings[lang];
  const [open, setOpen] = useState(false);

  const go = (v: View) => {
    setView(v);
    setOpen(false);
    window.scrollTo({ top: 0 });
  };

  const links = [
    { label: t.features, action: () => go("features") },
    { label: t.coach, action: () => go("features") },
    { label: t.offline, action: () => go("features") },
    { label: t.stories, action: () => go("landing") },
  ];

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-4 md:top-4">
      <nav
        aria-label="Primary"
        className={`glass-nav mx-auto max-w-[1200px] border border-white/10 bg-night/60 shadow-clinical backdrop-blur-xl transition-[border-radius] duration-300 ${
          open ? "rounded-[28px]" : "rounded-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between gap-4 px-4 md:h-[68px] md:px-6">
          <button
            onClick={() => go("landing")}
            className="flex items-center gap-2.5"
            aria-label="BizSawa home"
          >
            <img
              src="/logo-mark.png"
              alt="BizSawa logo"
              className="size-8 rounded-lg object-cover"
            />
            <span className="text-sm font-bold tracking-[0.22em] text-white">BIZSAWA</span>
          </button>

          <ul className="hidden items-center gap-8 lg:flex">
            {links.map((l) => (
              <li key={l.label}>
                <button
                  onClick={l.action}
                  className="text-sm font-medium text-white/70 transition-colors hover:text-white"
                >
                  {l.label}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 md:gap-3">
            <div
              className="flex items-center rounded-full border border-white/10 bg-white/5 p-1 text-xs font-semibold"
              role="group"
              aria-label="Language"
            >
              {(["en", "sw"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`rounded-full px-3 py-1.5 uppercase tracking-wider transition-colors ${
                    lang === l ? "bg-paper text-ink" : "text-white/60"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={() => go("features")}
              className="hidden rounded-full bg-accent px-6 py-2.5 text-xs font-semibold tracking-[0.18em] text-white shadow-glow-sm transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] sm:block"
            >
              {t.start}
            </button>
            <button
              className="rounded-full p-2 text-white lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {open && (
          <ul className="border-t border-white/10 px-3 pb-3 pt-1 lg:hidden">
            {links.map((l) => (
              <li key={l.label}>
                <button
                  onClick={l.action}
                  className="block w-full rounded-xl px-3 py-3 text-left text-sm font-medium text-white/80 hover:bg-white/5"
                >
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </header>
  );
}
