import { useState } from "react";
import { Features } from "./components/Features";
import { Hero } from "./components/Hero";
import { Footer, Landing } from "./components/Landing";
import { Nav, type View } from "./components/Nav";
import type { Lang } from "./data";

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [lang, setLang] = useState<Lang>("en");

  return (
    <div id="top" className="min-h-[100dvh] bg-paper font-sans text-ink">
      <Nav lang={lang} setLang={setLang} setView={setView} />
      {view === "landing" ? (
        <>
          <Hero lang={lang} setView={setView} />
          <Landing lang={lang} setView={setView} />
        </>
      ) : (
        <Features />
      )}
      <Footer setView={setView} />
    </div>
  );
}
