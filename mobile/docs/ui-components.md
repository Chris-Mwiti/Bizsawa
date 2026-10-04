# Mobile — UI Components & Theme

Primitives in `components/ui/`, app chrome, charts, and the token system that keeps money ink and accents rare.

## 1. Primitives (`components/ui/`)

| File | Export | Props / behavior |
|---|---|---|
| `Button.tsx` | `Button` | `{variant, size, loading, children, textClassName, …TouchableOpacityProps}`. Variants `primary\|secondary\|ghost\|destructive`; sizes `lg\|md\|sm` — **all `rounded-full` pills**. String children auto-wrapped in `Text`. `primary:bg-accent` with clinical lift |
| `Card.tsx` | `Card, BezelCard, CardHeader, CardContent, CardTitle, SectionHeader` | Soft-clinical: `bg-surface rounded-3xl`, tinted shadow `#0E1F1C @ 6%`. `SectionHeader({icon,title,subtitle,action,iconColor})` standardizes a 44px (`w-11 h-11 rounded-2xl bg-accent-soft`) icon tile + title block |
| `SoftUI.tsx` | `Pill, SearchPill, Tile, TileRow, StatCard, TxnRow, ScreenHeader, SectionTitle` | `Pill({label,active,onPress})` filter chips; `SearchPill({value,onChangeText,placeholder,onMic,RightSlot})`; `Tile({icon,label,onPress,badge})`; `StatCard({label,value,sub,icon})`; `TxnRow({avatar,title,subtitle,amount,status,statusTone:'paid'\|'unpaid'\|'muted'})`; `ScreenHeader({title,left,right})`; `SectionTitle({title,action})` |
| `Sheet.tsx` | `Sheet` | Shared bottom-sheet primitive |
| `Skeleton.tsx` | loading skeletons | List/card placeholders while queries warm |
| `Badge.tsx` / `Progress.tsx` | status + progress | Payment-status pills, upload/sync progress |
| `BrandGradient.tsx` | `BrandGradient` | `name="action"\|"fab"\|"active"` — the **single** raised action per screen (FAB/hero CTA). Everything else uses flat `bg-accent` |
| `TimeframeSelector.tsx` | day/week/month/year | Insights + analytics range picker |
| `SuccessCelebration.tsx` | post-action delight | Sale/payment success overlay |

## 2. Auth shell (`components/auth/AuthShell.tsx`)

Owns the *look* of all 7 auth screens; screens own the logic.

- `AuthShell({title, subtitle, onBack, footer, children})` — paper canvas, `rounded-4xl` white card, teal pill CTA zone.
- `BrandMark({size})`, `FieldLabel`, `AuthInput` (forwardRef TextInput), `FieldError({message})`, `PrimaryCta({label, loading, disabled, …})`, `OrDivider`, `SocialRow({onGoogle, onApple, onFacebook})`, `SwitchLink({prompt, action, onPress})`.
- Effect: login/register/verify/forgot/accept-invite share one header/back/title/subtitle/footer language; per-screen `SafeArea/KeyboardAvoiding` boilerplate is gone.

## 3. App chrome

- **`AppTabBar.tsx` — `AppTabBar(state, descriptors, navigation: BottomTabBarProps)`.** Floating white pill (`borderRadius 36`, border `#E4EBEE`), 5 slots: `Receipt` (sales) / `Package` (stock) / `Home` (index — 52dp circle, active `#006b5f`) / `BarChart3` (insights) / `User` (profile). Every press goes through `useNavigationGate().gate(href, 'navigate', …)` + `TAB_HREFS`.
- **`OfflineBanner.tsx` — `OfflineBanner()`, `OfflineCapabilitiesChip()`.** Absolute top pill overlaying every page (`NetInfo` + `useSync()` → `state, pendingCount, conflictCount, refreshCounts`). States: offline (`bg-ink`), recovery (pending/conflicts), transient `Offline mode ready` (8s). Tap expands: `Refresh → refreshFromRemote()`, `Reset → resetLocalDatabase() + syncNow()`, `Resolve → /sync-conflicts`.
- **`SyncStatusBadge`** + `useSyncStatus(table, recordId)` — per-row pending/conflict dots. **`TabWrapper`** (tab screen padding vs `TAB_BAR_SCROLL_PADDING=112` in `constants/tabBar.ts`), **`SwipeContainer`** (edge-swipe tab nav), **`RouteLoadingBar/Chip`**, **`SalesEntryModal`**, **`PaywallModal`**, **`Order{Item,Header,Footer,EmptyState}`**, **`CoachMessageMarkdown`**.
- **Charts** (`components/charts/`): `RevenueChart, ProfitChart, CategoryPieChart, AnalyticsCharts` — feed from `useAnalytics` series; money rendered in `MONEY_STYLE` (GeistMono, tabular-nums).

## 4. Theme tokens (single source of truth)

**`lib/theme/palette.js`** (CommonJS so `tailwind.config.js` can `require` it):

- `paper #F4F9F7` (canvas) · `ink {DEFAULT #0E1F1C, strong #2C403B, muted #4F625E, subtle #64746F, faint #8A9A96, inverse #FFFFFF}` · `surface {DEFAULT #FFFFFF, sunken #E1EBE8}` · `rule {hairline #DCE7E4, DEFAULT #7E918C, strong #A8BDB7}` · `accent {DEFAULT #006B5F, hover #005247, active #003B33, soft #E4F0ED, border #97C9BF, onAccent #FFFFFF}` · `status {pos #1F6F4A/posSoft #E3F0E8, neg #A32C21/negSoft #FAE9E7, warn #8A5A0B/warnSoft #F7EEDC}` · `gradients {action [#005247→#006B5F], fab [#0A7A6A→#006B5F], active [#0E1F1C→#006B5F]}` · accent ramp `50–900`.

**`tailwind.config.js`** maps those tokens (`paper/surface/sunken/hairline/border/ink*/accent*/pos/neg/warn*/primary`), fonts `sans:[Geist], mono:[GeistMono], geist-medium/semibold/bold`, sizes `xs11/sm13/base16/lg22`, radii `xl12/2xl16/3xl24/4xl28/5xl32`, shadows `soft/soft-lg/clinical/clinical-sm` tinted from the palette. Content: `app/**, components/**`. House rule enforced in review: **money is ink; accent only for UI chrome** (≤10% of pixels).

**`lib/theme/colors.ts`** — typed re-export + flat `colors{…}` for icon/inline-style props; `lib/theme/__tests__/colors.test.ts` asserts WCAG AA contrast. **`tamagui.config.ts`** — `createTamagui(@tamagui/config/v3 + fonts {heading,body:Geist, mono:GeistMono})`, face 700 → GeistBold/GeistMonoBold. **`lib/theme/fonts.ts`** — `fonts{Geist,GeistMedium,GeistSemiBold,GeistBold,GeistMono,GeistMonoBold}` from `@expo-google-fonts`, `FONT_SANS/MONO`, `MONEY_STYLE`. **`global.css`** is exactly the 3 NativeWind directives. Bilingual formatting (`KES`, `en-KE`/`sw` dates) lives in `lib/format.ts`.
