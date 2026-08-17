<!DOCTYPE html>

<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>BizSawa Splash Screen</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            "colors": {
                    "secondary": "#006b5f",
                    "on-tertiary-fixed": "#191c1e",
                    "surface-container-highest": "#dae2fd",
                    "surface-variant": "#dae2fd",
                    "surface-bright": "#faf8ff",
                    "on-background": "#131b2e",
                    "primary-fixed": "#d3e5f1",
                    "tertiary": "#5c5f61",
                    "surface-container-low": "#f2f3ff",
                    "outline-variant": "#c3c7cb",
                    "surface-dim": "#d2d9f4",
                    "on-surface-variant": "#43474b",
                    "on-primary-container": "#5e6f79",
                    "background": "#faf8ff",
                    "secondary-fixed": "#71f8e4",
                    "surface-container-lowest": "#ffffff",
                    "on-secondary-fixed": "#00201c",
                    "on-secondary": "#ffffff",
                    "inverse-surface": "#283044",
                    "on-tertiary-container": "#6a6d6f",
                    "on-primary-fixed": "#0c1e26",
                    "on-tertiary": "#ffffff",
                    "secondary-container": "#6df5e1",
                    "outline": "#73787b",
                    "error-container": "#ffdad6",
                    "on-primary-fixed-variant": "#384953",
                    "on-tertiary-fixed-variant": "#444749",
                    "on-error-container": "#93000a",
                    "tertiary-fixed": "#e0e3e5",
                    "tertiary-fixed-dim": "#c4c7c9",
                    "on-primary": "#ffffff",
                    "surface-container": "#eaedff",
                    "secondary-fixed-dim": "#4fdbc8",
                    "on-error": "#ffffff",
                    "inverse-primary": "#b7c9d5",
                    "surface-tint": "#50616b",
                    "on-secondary-fixed-variant": "#005048",
                    "tertiary-container": "#eef0f2",
                    "primary-container": "#e0f2fe",
                    "surface-container-high": "#e2e7ff",
                    "surface": "#faf8ff",
                    "primary": "#50616b",
                    "primary-fixed-dim": "#b7c9d5",
                    "error": "#ba1a1a",
                    "on-secondary-container": "#006f64",
                    "on-surface": "#131b2e",
                    "inverse-on-surface": "#eef0ff"
            },
            "borderRadius": {
                    "DEFAULT": "0.125rem",
                    "lg": "0.25rem",
                    "xl": "0.5rem",
                    "full": "0.75rem"
            },
            "spacing": {
                    "base": "4px",
                    "margin-mobile": "20px",
                    "xl": "48px",
                    "xs": "8px",
                    "lg": "32px",
                    "gutter": "16px",
                    "sm": "16px",
                    "md": "24px"
            },
            "fontFamily": {
                    "display": ["Hanken Grotesk"],
                    "body-lg": ["Hanken Grotesk"],
                    "label-md": ["Hanken Grotesk"],
                    "label-sm": ["Hanken Grotesk"],
                    "headline-lg-mobile": ["Hanken Grotesk"],
                    "headline-md": ["Hanken Grotesk"],
                    "headline-lg": ["Hanken Grotesk"],
                    "body-md": ["Hanken Grotesk"]
            },
            "fontSize": {
                    "display": ["40px", {"lineHeight": "48px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
                    "body-lg": ["18px", {"lineHeight": "28px", "fontWeight": "400"}],
                    "label-md": ["14px", {"lineHeight": "20px", "letterSpacing": "0.02em", "fontWeight": "600"}],
                    "label-sm": ["12px", {"lineHeight": "16px", "letterSpacing": "0.04em", "fontWeight": "500"}],
                    "headline-lg-mobile": ["28px", {"lineHeight": "36px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
                    "headline-md": ["24px", {"lineHeight": "32px", "fontWeight": "600"}],
                    "headline-lg": ["32px", {"lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
                    "body-md": ["16px", {"lineHeight": "24px", "fontWeight": "400"}]
            }
          },
        },
      }
    </script>
<style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .neo-brutalist-shadow {
            box-shadow: 6px 6px 0px 0px rgba(0, 107, 95, 0.15);
        }
        .architectural-grid {
            background-size: 40px 40px;
            background-image: radial-gradient(circle, #c3c7cb 1px, transparent 1px);
        }
    </style>
<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
  </head>
<body class="bg-background text-on-background font-body-md selection:bg-secondary-container">
<main class="relative min-h-screen flex items-center justify-center architectural-grid p-margin-mobile overflow-hidden">
<!-- Background Elements for Neo-Brutalist Feel -->
<div class="absolute top-[10%] left-[5%] w-64 h-64 border border-outline/10 pointer-events-none rotate-12"></div>
<div class="absolute bottom-[10%] right-[5%] w-48 h-48 border border-secondary/10 pointer-events-none -rotate-6"></div>
<!-- Central Branding Container -->
<section class="relative z-10 flex flex-col items-center text-center max-w-xl">
<!-- Logo Icon Representation -->
<div class="mb-lg w-24 h-24 bg-surface-container-lowest border-1.5 border-secondary/20 flex items-center justify-center rounded-xl neo-brutalist-shadow transform hover:scale-105 transition-transform duration-300">
<span class="material-symbols-outlined text-secondary text-[48px]" data-icon="hub">hub</span>
</div>
<!-- Brand Headline -->
<h1 class="font-display text-display md:text-display text-on-background mb-xs tracking-tighter">
                BizSawa
            </h1>
<!-- Tagline -->
<p class="font-body-lg text-body-lg text-on-surface-variant max-w-sm mb-xl leading-relaxed">
                Your AI Powered Business Companion
            </p>
<!-- Decorative Component: Abstract Illustration -->
<div class="relative w-full max-w-[320px] aspect-square mb-xl bg-white border border-outline-variant/20 rounded-xl overflow-hidden neo-brutalist-shadow">
<img alt="Minimalist AI Business Abstract" class="w-full h-full object-cover grayscale opacity-80" data-alt="A sophisticated minimalist digital illustration depicting interconnected nodes and abstract geometric patterns in a serene pastel blue and teal green palette. The composition is structured within a clean, grid-based layout that evokes a sense of architectural stability and modern business technology. Soft, low-blur shadows provide a subtle sense of depth against a pristine white background. The overall mood is professional, tranquil, and technologically advanced." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBiTMOyHKqUHlfIElKWV9DYMJ0qbTVUcErjbYeCOaO2HBJUA0vt-d9qyo_BiZ2hqAKYubNLdkwYlOT70Eh3cU8myGT5vhdN0cUzg0CJs42VCsQE0Id13h7JIin01NPcibvb5AEF8N7zYRA4ctM0gSfWC016sQag-KfpGDm4AInZM5g9IVHLno5wAaCcCOQOeoHOU9z4juwuPsMuuU9_IdRXA481kyI-p-URUiLir-qVPG866S6Jc6kpI2uBv5bBrTm_gcq_q-2ucpW"/>
<div class="absolute inset-0 bg-secondary/5 mix-blend-multiply"></div>
<!-- Overlay Chip -->
<div class="absolute bottom-md left-md">
<span class="bg-secondary text-on-secondary px-sm py-xs font-label-sm text-label-sm rounded shadow-sm border border-secondary">
                        ESTABLISHED 2024
                    </span>
</div>
</div>
<!-- Progress/Loading State (Subtle) -->
<div class="w-48 h-1 bg-primary-container mb-md relative overflow-hidden">
<div class="absolute inset-y-0 left-0 bg-secondary w-1/3"></div>
</div>
<p class="font-label-md text-label-md text-on-surface-variant/60 animate-pulse">
                Initializing Intelligence...
            </p>
</section>
<!-- Footer Accents -->
<footer class="absolute bottom-xl w-full flex justify-center px-margin-mobile">
<div class="flex items-center gap-xl opacity-40 grayscale">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Reliability</span>
<div class="w-1.5 h-1.5 bg-outline rounded-full"></div>
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Insight</span>
<div class="w-1.5 h-1.5 bg-outline rounded-full"></div>
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Growth</span>
</div>
</footer>
</main>
</body></html>

<!DOCTYPE html>

<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>BizSawa Splash Screen</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            "colors": {
                    "secondary": "#006b5f",
                    "on-tertiary-fixed": "#191c1e",
                    "surface-container-highest": "#dae2fd",
                    "surface-variant": "#dae2fd",
                    "surface-bright": "#faf8ff",
                    "on-background": "#131b2e",
                    "primary-fixed": "#d3e5f1",
                    "tertiary": "#5c5f61",
                    "surface-container-low": "#f2f3ff",
                    "outline-variant": "#c3c7cb",
                    "surface-dim": "#d2d9f4",
                    "on-surface-variant": "#43474b",
                    "on-primary-container": "#5e6f79",
                    "background": "#faf8ff",
                    "secondary-fixed": "#71f8e4",
                    "surface-container-lowest": "#ffffff",
                    "on-secondary-fixed": "#00201c",
                    "on-secondary": "#ffffff",
                    "inverse-surface": "#283044",
                    "on-tertiary-container": "#6a6d6f",
                    "on-primary-fixed": "#0c1e26",
                    "on-tertiary": "#ffffff",
                    "secondary-container": "#6df5e1",
                    "outline": "#73787b",
                    "error-container": "#ffdad6",
                    "on-primary-fixed-variant": "#384953",
                    "on-tertiary-fixed-variant": "#444749",
                    "on-error-container": "#93000a",
                    "tertiary-fixed": "#e0e3e5",
                    "tertiary-fixed-dim": "#c4c7c9",
                    "on-primary": "#ffffff",
                    "surface-container": "#eaedff",
                    "secondary-fixed-dim": "#4fdbc8",
                    "on-error": "#ffffff",
                    "inverse-primary": "#b7c9d5",
                    "surface-tint": "#50616b",
                    "on-secondary-fixed-variant": "#005048",
                    "tertiary-container": "#eef0f2",
                    "primary-container": "#e0f2fe",
                    "surface-container-high": "#e2e7ff",
                    "surface": "#faf8ff",
                    "primary": "#50616b",
                    "primary-fixed-dim": "#b7c9d5",
                    "error": "#ba1a1a",
                    "on-secondary-container": "#006f64",
                    "on-surface": "#131b2e",
                    "inverse-on-surface": "#eef0ff"
            },
            "borderRadius": {
                    "DEFAULT": "0.125rem",
                    "lg": "0.25rem",
                    "xl": "0.5rem",
                    "full": "0.75rem"
            },
            "spacing": {
                    "base": "4px",
                    "margin-mobile": "20px",
                    "xl": "48px",
                    "xs": "8px",
                    "lg": "32px",
                    "gutter": "16px",
                    "sm": "16px",
                    "md": "24px"
            },
            "fontFamily": {
                    "display": ["Hanken Grotesk"],
                    "body-lg": ["Hanken Grotesk"],
                    "label-md": ["Hanken Grotesk"],
                    "label-sm": ["Hanken Grotesk"],
                    "headline-lg-mobile": ["Hanken Grotesk"],
                    "headline-md": ["Hanken Grotesk"],
                    "headline-lg": ["Hanken Grotesk"],
                    "body-md": ["Hanken Grotesk"]
            },
            "fontSize": {
                    "display": ["40px", {"lineHeight": "48px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
                    "body-lg": ["18px", {"lineHeight": "28px", "fontWeight": "400"}],
                    "label-md": ["14px", {"lineHeight": "20px", "letterSpacing": "0.02em", "fontWeight": "600"}],
                    "label-sm": ["12px", {"lineHeight": "16px", "letterSpacing": "0.04em", "fontWeight": "500"}],
                    "headline-lg-mobile": ["28px", {"lineHeight": "36px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
                    "headline-md": ["24px", {"lineHeight": "32px", "fontWeight": "600"}],
                    "headline-lg": ["32px", {"lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
                    "body-md": ["16px", {"lineHeight": "24px", "fontWeight": "400"}]
            }
          },
        },
      }
    </script>
<style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .neo-brutalist-shadow {
            box-shadow: 6px 6px 0px 0px rgba(0, 107, 95, 0.15);
        }
        .architectural-grid {
            background-size: 40px 40px;
            background-image: radial-gradient(circle, #c3c7cb 1px, transparent 1px);
        }
    </style>
<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
  </head>
<body class="bg-background text-on-background font-body-md selection:bg-secondary-container">
<main class="relative min-h-screen flex items-center justify-center architectural-grid p-margin-mobile overflow-hidden">
<!-- Background Elements for Neo-Brutalist Feel -->
<div class="absolute top-[10%] left-[5%] w-64 h-64 border border-outline/10 pointer-events-none rotate-12"></div>
<div class="absolute bottom-[10%] right-[5%] w-48 h-48 border border-secondary/10 pointer-events-none -rotate-6"></div>
<!-- Central Branding Container -->
<section class="relative z-10 flex flex-col items-center text-center max-w-xl">
<!-- Logo Icon Representation -->
<div class="mb-lg w-24 h-24 bg-surface-container-lowest border-1.5 border-secondary/20 flex items-center justify-center rounded-xl neo-brutalist-shadow transform hover:scale-105 transition-transform duration-300">
<span class="material-symbols-outlined text-secondary text-[48px]" data-icon="hub">hub</span>
</div>
<!-- Brand Headline -->
<h1 class="font-display text-display md:text-display text-on-background mb-xs tracking-tighter">
                BizSawa
            </h1>
<!-- Tagline -->
<p class="font-body-lg text-body-lg text-on-surface-variant max-w-sm mb-xl leading-relaxed">
                Your AI Powered Business Companion
            </p>
<!-- Decorative Component: Abstract Illustration -->
<div class="relative w-full max-w-[320px] aspect-square mb-xl bg-white border border-outline-variant/20 rounded-xl overflow-hidden neo-brutalist-shadow">
<img alt="Minimalist AI Business Abstract" class="w-full h-full object-cover grayscale opacity-80" data-alt="A sophisticated minimalist digital illustration depicting interconnected nodes and abstract geometric patterns in a serene pastel blue and teal green palette. The composition is structured within a clean, grid-based layout that evokes a sense of architectural stability and modern business technology. Soft, low-blur shadows provide a subtle sense of depth against a pristine white background. The overall mood is professional, tranquil, and technologically advanced." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBiTMOyHKqUHlfIElKWV9DYMJ0qbTVUcErjbYeCOaO2HBJUA0vt-d9qyo_BiZ2hqAKYubNLdkwYlOT70Eh3cU8myGT5vhdN0cUzg0CJs42VCsQE0Id13h7JIin01NPcibvb5AEF8N7zYRA4ctM0gSfWC016sQag-KfpGDm4AInZM5g9IVHLno5wAaCcCOQOeoHOU9z4juwuPsMuuU9_IdRXA481kyI-p-URUiLir-qVPG866S6Jc6kpI2uBv5bBrTm_gcq_q-2ucpW"/>
<div class="absolute inset-0 bg-secondary/5 mix-blend-multiply"></div>
<!-- Overlay Chip -->
<div class="absolute bottom-md left-md">
<span class="bg-secondary text-on-secondary px-sm py-xs font-label-sm text-label-sm rounded shadow-sm border border-secondary">
                        ESTABLISHED 2024
                    </span>
</div>
</div>
<!-- Progress/Loading State (Subtle) -->
<div class="w-48 h-1 bg-primary-container mb-md relative overflow-hidden">
<div class="absolute inset-y-0 left-0 bg-secondary w-1/3"></div>
</div>
<p class="font-label-md text-label-md text-on-surface-variant/60 animate-pulse">
                Initializing Intelligence...
            </p>
</section>
<!-- Footer Accents -->
<footer class="absolute bottom-xl w-full flex justify-center px-margin-mobile">
<div class="flex items-center gap-xl opacity-40 grayscale">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Reliability</span>
<div class="w-1.5 h-1.5 bg-outline rounded-full"></div>
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Insight</span>
<div class="w-1.5 h-1.5 bg-outline rounded-full"></div>
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Growth</span>
</div>
</footer>
</main>
</body></html>

<!DOCTYPE html>

<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>BizSawa Splash Screen</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            "colors": {
                    "secondary": "#006b5f",
                    "on-tertiary-fixed": "#191c1e",
                    "surface-container-highest": "#dae2fd",
                    "surface-variant": "#dae2fd",
                    "surface-bright": "#faf8ff",
                    "on-background": "#131b2e",
                    "primary-fixed": "#d3e5f1",
                    "tertiary": "#5c5f61",
                    "surface-container-low": "#f2f3ff",
                    "outline-variant": "#c3c7cb",
                    "surface-dim": "#d2d9f4",
                    "on-surface-variant": "#43474b",
                    "on-primary-container": "#5e6f79",
                    "background": "#faf8ff",
                    "secondary-fixed": "#71f8e4",
                    "surface-container-lowest": "#ffffff",
                    "on-secondary-fixed": "#00201c",
                    "on-secondary": "#ffffff",
                    "inverse-surface": "#283044",
                    "on-tertiary-container": "#6a6d6f",
                    "on-primary-fixed": "#0c1e26",
                    "on-tertiary": "#ffffff",
                    "secondary-container": "#6df5e1",
                    "outline": "#73787b",
                    "error-container": "#ffdad6",
                    "on-primary-fixed-variant": "#384953",
                    "on-tertiary-fixed-variant": "#444749",
                    "on-error-container": "#93000a",
                    "tertiary-fixed": "#e0e3e5",
                    "tertiary-fixed-dim": "#c4c7c9",
                    "on-primary": "#ffffff",
                    "surface-container": "#eaedff",
                    "secondary-fixed-dim": "#4fdbc8",
                    "on-error": "#ffffff",
                    "inverse-primary": "#b7c9d5",
                    "surface-tint": "#50616b",
                    "on-secondary-fixed-variant": "#005048",
                    "tertiary-container": "#eef0f2",
                    "primary-container": "#e0f2fe",
                    "surface-container-high": "#e2e7ff",
                    "surface": "#faf8ff",
                    "primary": "#50616b",
                    "primary-fixed-dim": "#b7c9d5",
                    "error": "#ba1a1a",
                    "on-secondary-container": "#006f64",
                    "on-surface": "#131b2e",
                    "inverse-on-surface": "#eef0ff"
            },
            "borderRadius": {
                    "DEFAULT": "0.125rem",
                    "lg": "0.25rem",
                    "xl": "0.5rem",
                    "full": "0.75rem"
            },
            "spacing": {
                    "base": "4px",
                    "margin-mobile": "20px",
                    "xl": "48px",
                    "xs": "8px",
                    "lg": "32px",
                    "gutter": "16px",
                    "sm": "16px",
                    "md": "24px"
            },
            "fontFamily": {
                    "display": ["Hanken Grotesk"],
                    "body-lg": ["Hanken Grotesk"],
                    "label-md": ["Hanken Grotesk"],
                    "label-sm": ["Hanken Grotesk"],
                    "headline-lg-mobile": ["Hanken Grotesk"],
                    "headline-md": ["Hanken Grotesk"],
                    "headline-lg": ["Hanken Grotesk"],
                    "body-md": ["Hanken Grotesk"]
            },
            "fontSize": {
                    "display": ["40px", {"lineHeight": "48px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
                    "body-lg": ["18px", {"lineHeight": "28px", "fontWeight": "400"}],
                    "label-md": ["14px", {"lineHeight": "20px", "letterSpacing": "0.02em", "fontWeight": "600"}],
                    "label-sm": ["12px", {"lineHeight": "16px", "letterSpacing": "0.04em", "fontWeight": "500"}],
                    "headline-lg-mobile": ["28px", {"lineHeight": "36px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
                    "headline-md": ["24px", {"lineHeight": "32px", "fontWeight": "600"}],
                    "headline-lg": ["32px", {"lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
                    "body-md": ["16px", {"lineHeight": "24px", "fontWeight": "400"}]
            }
          },
        },
      }
    </script>
<style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .neo-brutalist-shadow {
            box-shadow: 6px 6px 0px 0px rgba(0, 107, 95, 0.15);
        }
        .architectural-grid {
            background-size: 40px 40px;
            background-image: radial-gradient(circle, #c3c7cb 1px, transparent 1px);
        }
    </style>
<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
  </head>
<body class="bg-background text-on-background font-body-md selection:bg-secondary-container">
<main class="relative min-h-screen flex items-center justify-center architectural-grid p-margin-mobile overflow-hidden">
<!-- Background Elements for Neo-Brutalist Feel -->
<div class="absolute top-[10%] left-[5%] w-64 h-64 border border-outline/10 pointer-events-none rotate-12"></div>
<div class="absolute bottom-[10%] right-[5%] w-48 h-48 border border-secondary/10 pointer-events-none -rotate-6"></div>
<!-- Central Branding Container -->
<section class="relative z-10 flex flex-col items-center text-center max-w-xl">
<!-- Logo Icon Representation -->
<div class="mb-lg w-24 h-24 bg-surface-container-lowest border-1.5 border-secondary/20 flex items-center justify-center rounded-xl neo-brutalist-shadow transform hover:scale-105 transition-transform duration-300">
<span class="material-symbols-outlined text-secondary text-[48px]" data-icon="hub">hub</span>
</div>
<!-- Brand Headline -->
<h1 class="font-display text-display md:text-display text-on-background mb-xs tracking-tighter">
                BizSawa
            </h1>
<!-- Tagline -->
<p class="font-body-lg text-body-lg text-on-surface-variant max-w-sm mb-xl leading-relaxed">
                Your AI Powered Business Companion
            </p>
<!-- Decorative Component: Abstract Illustration -->
<div class="relative w-full max-w-[320px] aspect-square mb-xl bg-white border border-outline-variant/20 rounded-xl overflow-hidden neo-brutalist-shadow">
<img alt="Minimalist AI Business Abstract" class="w-full h-full object-cover grayscale opacity-80" data-alt="A sophisticated minimalist digital illustration depicting interconnected nodes and abstract geometric patterns in a serene pastel blue and teal green palette. The composition is structured within a clean, grid-based layout that evokes a sense of architectural stability and modern business technology. Soft, low-blur shadows provide a subtle sense of depth against a pristine white background. The overall mood is professional, tranquil, and technologically advanced." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBiTMOyHKqUHlfIElKWV9DYMJ0qbTVUcErjbYeCOaO2HBJUA0vt-d9qyo_BiZ2hqAKYubNLdkwYlOT70Eh3cU8myGT5vhdN0cUzg0CJs42VCsQE0Id13h7JIin01NPcibvb5AEF8N7zYRA4ctM0gSfWC016sQag-KfpGDm4AInZM5g9IVHLno5wAaCcCOQOeoHOU9z4juwuPsMuuU9_IdRXA481kyI-p-URUiLir-qVPG866S6Jc6kpI2uBv5bBrTm_gcq_q-2ucpW"/>
<div class="absolute inset-0 bg-secondary/5 mix-blend-multiply"></div>
<!-- Overlay Chip -->
<div class="absolute bottom-md left-md">
<span class="bg-secondary text-on-secondary px-sm py-xs font-label-sm text-label-sm rounded shadow-sm border border-secondary">
                        ESTABLISHED 2024
                    </span>
</div>
</div>
<!-- Progress/Loading State (Subtle) -->
<div class="w-48 h-1 bg-primary-container mb-md relative overflow-hidden">
<div class="absolute inset-y-0 left-0 bg-secondary w-1/3"></div>
</div>
<p class="font-label-md text-label-md text-on-surface-variant/60 animate-pulse">
                Initializing Intelligence...
            </p>
</section>
<!-- Footer Accents -->
<footer class="absolute bottom-xl w-full flex justify-center px-margin-mobile">
<div class="flex items-center gap-xl opacity-40 grayscale">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Reliability</span>
<div class="w-1.5 h-1.5 bg-outline rounded-full"></div>
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Insight</span>
<div class="w-1.5 h-1.5 bg-outline rounded-full"></div>
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Growth</span>
</div>
</footer>
</main>
</body></html>

<!DOCTYPE html>

<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>BizSawa Splash Screen</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            "colors": {
                    "secondary": "#006b5f",
                    "on-tertiary-fixed": "#191c1e",
                    "surface-container-highest": "#dae2fd",
                    "surface-variant": "#dae2fd",
                    "surface-bright": "#faf8ff",
                    "on-background": "#131b2e",
                    "primary-fixed": "#d3e5f1",
                    "tertiary": "#5c5f61",
                    "surface-container-low": "#f2f3ff",
                    "outline-variant": "#c3c7cb",
                    "surface-dim": "#d2d9f4",
                    "on-surface-variant": "#43474b",
                    "on-primary-container": "#5e6f79",
                    "background": "#faf8ff",
                    "secondary-fixed": "#71f8e4",
                    "surface-container-lowest": "#ffffff",
                    "on-secondary-fixed": "#00201c",
                    "on-secondary": "#ffffff",
                    "inverse-surface": "#283044",
                    "on-tertiary-container": "#6a6d6f",
                    "on-primary-fixed": "#0c1e26",
                    "on-tertiary": "#ffffff",
                    "secondary-container": "#6df5e1",
                    "outline": "#73787b",
                    "error-container": "#ffdad6",
                    "on-primary-fixed-variant": "#384953",
                    "on-tertiary-fixed-variant": "#444749",
                    "on-error-container": "#93000a",
                    "tertiary-fixed": "#e0e3e5",
                    "tertiary-fixed-dim": "#c4c7c9",
                    "on-primary": "#ffffff",
                    "surface-container": "#eaedff",
                    "secondary-fixed-dim": "#4fdbc8",
                    "on-error": "#ffffff",
                    "inverse-primary": "#b7c9d5",
                    "surface-tint": "#50616b",
                    "on-secondary-fixed-variant": "#005048",
                    "tertiary-container": "#eef0f2",
                    "primary-container": "#e0f2fe",
                    "surface-container-high": "#e2e7ff",
                    "surface": "#faf8ff",
                    "primary": "#50616b",
                    "primary-fixed-dim": "#b7c9d5",
                    "error": "#ba1a1a",
                    "on-secondary-container": "#006f64",
                    "on-surface": "#131b2e",
                    "inverse-on-surface": "#eef0ff"
            },
            "borderRadius": {
                    "DEFAULT": "0.125rem",
                    "lg": "0.25rem",
                    "xl": "0.5rem",
                    "full": "0.75rem"
            },
            "spacing": {
                    "base": "4px",
                    "margin-mobile": "20px",
                    "xl": "48px",
                    "xs": "8px",
                    "lg": "32px",
                    "gutter": "16px",
                    "sm": "16px",
                    "md": "24px"
            },
            "fontFamily": {
                    "display": ["Hanken Grotesk"],
                    "body-lg": ["Hanken Grotesk"],
                    "label-md": ["Hanken Grotesk"],
                    "label-sm": ["Hanken Grotesk"],
                    "headline-lg-mobile": ["Hanken Grotesk"],
                    "headline-md": ["Hanken Grotesk"],
                    "headline-lg": ["Hanken Grotesk"],
                    "body-md": ["Hanken Grotesk"]
            },
            "fontSize": {
                    "display": ["40px", {"lineHeight": "48px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
                    "body-lg": ["18px", {"lineHeight": "28px", "fontWeight": "400"}],
                    "label-md": ["14px", {"lineHeight": "20px", "letterSpacing": "0.02em", "fontWeight": "600"}],
                    "label-sm": ["12px", {"lineHeight": "16px", "letterSpacing": "0.04em", "fontWeight": "500"}],
                    "headline-lg-mobile": ["28px", {"lineHeight": "36px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
                    "headline-md": ["24px", {"lineHeight": "32px", "fontWeight": "600"}],
                    "headline-lg": ["32px", {"lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
                    "body-md": ["16px", {"lineHeight": "24px", "fontWeight": "400"}]
            }
          },
        },
      }
    </script>
<style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .neo-brutalist-shadow {
            box-shadow: 6px 6px 0px 0px rgba(0, 107, 95, 0.15);
        }
        .architectural-grid {
            background-size: 40px 40px;
            background-image: radial-gradient(circle, #c3c7cb 1px, transparent 1px);
        }
    </style>
<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
  </head>
<body class="bg-background text-on-background font-body-md selection:bg-secondary-container">
<main class="relative min-h-screen flex items-center justify-center architectural-grid p-margin-mobile overflow-hidden">
<!-- Background Elements for Neo-Brutalist Feel -->
<div class="absolute top-[10%] left-[5%] w-64 h-64 border border-outline/10 pointer-events-none rotate-12"></div>
<div class="absolute bottom-[10%] right-[5%] w-48 h-48 border border-secondary/10 pointer-events-none -rotate-6"></div>
<!-- Central Branding Container -->
<section class="relative z-10 flex flex-col items-center text-center max-w-xl">
<!-- Logo Icon Representation -->
<div class="mb-lg w-24 h-24 bg-surface-container-lowest border-1.5 border-secondary/20 flex items-center justify-center rounded-xl neo-brutalist-shadow transform hover:scale-105 transition-transform duration-300">
<span class="material-symbols-outlined text-secondary text-[48px]" data-icon="hub">hub</span>
</div>
<!-- Brand Headline -->
<h1 class="font-display text-display md:text-display text-on-background mb-xs tracking-tighter">
                BizSawa
            </h1>
<!-- Tagline -->
<p class="font-body-lg text-body-lg text-on-surface-variant max-w-sm mb-xl leading-relaxed">
                Your AI Powered Business Companion
            </p>
<!-- Decorative Component: Abstract Illustration -->
<div class="relative w-full max-w-[320px] aspect-square mb-xl bg-white border border-outline-variant/20 rounded-xl overflow-hidden neo-brutalist-shadow">
<img alt="Minimalist AI Business Abstract" class="w-full h-full object-cover grayscale opacity-80" data-alt="A sophisticated minimalist digital illustration depicting interconnected nodes and abstract geometric patterns in a serene pastel blue and teal green palette. The composition is structured within a clean, grid-based layout that evokes a sense of architectural stability and modern business technology. Soft, low-blur shadows provide a subtle sense of depth against a pristine white background. The overall mood is professional, tranquil, and technologically advanced." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBiTMOyHKqUHlfIElKWV9DYMJ0qbTVUcErjbYeCOaO2HBJUA0vt-d9qyo_BiZ2hqAKYubNLdkwYlOT70Eh3cU8myGT5vhdN0cUzg0CJs42VCsQE0Id13h7JIin01NPcibvb5AEF8N7zYRA4ctM0gSfWC016sQag-KfpGDm4AInZM5g9IVHLno5wAaCcCOQOeoHOU9z4juwuPsMuuU9_IdRXA481kyI-p-URUiLir-qVPG866S6Jc6kpI2uBv5bBrTm_gcq_q-2ucpW"/>
<div class="absolute inset-0 bg-secondary/5 mix-blend-multiply"></div>
<!-- Overlay Chip -->
<div class="absolute bottom-md left-md">
<span class="bg-secondary text-on-secondary px-sm py-xs font-label-sm text-label-sm rounded shadow-sm border border-secondary">
                        ESTABLISHED 2024
                    </span>
</div>
</div>
<!-- Progress/Loading State (Subtle) -->
<div class="w-48 h-1 bg-primary-container mb-md relative overflow-hidden">
<div class="absolute inset-y-0 left-0 bg-secondary w-1/3"></div>
</div>
<p class="font-label-md text-label-md text-on-surface-variant/60 animate-pulse">
                Initializing Intelligence...
            </p>
</section>
<!-- Footer Accents -->
<footer class="absolute bottom-xl w-full flex justify-center px-margin-mobile">
<div class="flex items-center gap-xl opacity-40 grayscale">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Reliability</span>
<div class="w-1.5 h-1.5 bg-outline rounded-full"></div>
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Insight</span>
<div class="w-1.5 h-1.5 bg-outline rounded-full"></div>
<span class="font-label-sm text-label-sm uppercase tracking-widest text-primary">Growth</span>
</div>
</footer>
</main>
</body></html>