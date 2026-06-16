# HahaSNS client: React 18 + HeroUI v2 + Tailwind 3 → React 19 + HeroUI v3 + Tailwind 4

`npm run build` **passes**; the dev server boots and the app renders with no fatal
console errors. This note records what changed and the deliberate trade-offs.

## Dependency bumps (`client/package.json`)

| Package | Before | After |
| --- | --- | --- |
| `react` / `react-dom` | `^18.3.1` | `^19.2.0` |
| `@heroui/react` | `^2.8.10` | `^3.2.0` |
| `@heroui/styles` | — (new in v3) | `^3.2.0` |
| `tailwindcss` | `^3.4.17` | `^4.3.1` |
| `@tailwindcss/vite` + `@tailwindcss/postcss` | — | `^4.3.1` |
| `@vitejs/plugin-react` | `^4.3.1` | `^4.7.0` (latest 4.x; supports React 19 + Vite 5) |
| `autoprefixer`, `postcss` | present | removed (TW4 handles both) |
| `vite` | `^5.4.8` | unchanged (kept on 5 for the existing dev-proxy setup) |

> `@vitejs/plugin-react@6` and `vite@8` were intentionally NOT adopted: plugin-react 6
> requires `vite@^8`, a far larger jump that risked the dev-server `/api` + `/uploads`
> proxy config. plugin-react 4.7 already supports React 19, so Vite 5 was retained.

## Tailwind 4 migration (CSS-first)

- Deleted `tailwind.config.cjs` and `postcss.config.cjs`.
- `vite.config.js` now uses the first-party `@tailwindcss/vite` plugin.
- `src/styles/tailwind.css` switched from `@tailwind base/components/utilities` +
  the `heroui()` plugin to:
  ```css
  @import "tailwindcss";
  @import "@heroui/styles";
  @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
  @theme { /* token aliases → app CSS variables */ }
  ```

### Preserving the 6 skins × light/dark

The 6 color skins and light/dark mode were **never** driven by HeroUI's theme engine —
they live in `src/styles/tokens.css` (CSS custom properties switched per
`[data-skin]` / `[data-theme]`) and `src/context/ThemeContext.jsx`. That system is
untouched and keeps working. HeroUI v2's `heroui({ themes })` plugin (which generated
`<skin>` / `<skin>-dark` Tailwind themes) is **gone in v3** and was removed. To keep the
handful of HeroUI utility classes the app still references (`text-default-500`,
`bg-primary-50`, `rounded-medium`, `text-small`, …), those token names are re-declared in
the `@theme {}` block and mapped onto the app's own CSS variables — so every such utility
now follows the active skin + mode automatically.

## HeroUI v2 → v3 API migration

HeroUI v3 is a **ground-up rewrite** (react-aria-components based, compound
dot-notation API, no `HeroUIProvider`, no `color` prop on Button, RAC value
semantics). Almost every v2 name/prop changed:

- `CardBody`→`Card.Content`, `CardHeader`→`Card.Header`
- `Tabs`/`Tab` → `Tabs` + `Tabs.List`/`Tabs.Tab`/`Tabs.Panel` (RAC, `id` not `key`)
- `Textarea`→`TextArea`; `Input`/`Select` are now bare RAC primitives (no built-in
  label / startContent / `onValueChange`)
- `Select`/`SelectItem` → compound `Select.Trigger`/`Select.Value`/`Select.Popover` + `ListBox`/`ListBox.Item`
- `Modal`/`ModalContent`/… → `Modal.Backdrop`/`Modal.Container`/`Modal.Dialog`/…; `useDisclosure`→`useOverlayState`
- `Progress`→`ProgressBar` (compound `.Track`/`.Fill`)
- `Button`: no `color`/`isLoading`/`startContent` — folded into a single `variant` enum

### Approach: a thin compatibility layer

Rather than rewrite the new compound JSX across 11 page files (high risk of subtle
breakage, and the app's visuals come from its own CSS, not HeroUI internals), the v2
surface the app uses is adapted in **one** place: `src/components/heroui.jsx`. It imports
the real v3 primitives and re-exports them under the familiar v2 names/props
(Card/CardBody/CardHeader, Tabs/Tab, Button, Input, Textarea, Select/SelectItem,
Modal/…/useDisclosure, Chip, Spinner, Progress). The 11 pages just changed their import
source from `@heroui/react` to `../components/heroui`; their JSX is otherwise unchanged.
`HeroUIProvider` was removed from `main.jsx` (v3 needs no provider).

Supporting styles for the shimmed primitives live in `src/styles/components.css`
(`.haha-*` classes, all keyed off the design-system CSS variables, so they stay skin-/dark-aware).

### Known cosmetic trade-offs (not blockers)

- **Button variants are approximate.** v3 collapses v2's `color`+`variant` into one
  `variant` enum (`primary|secondary|tertiary|outline|ghost|danger|danger-soft`). The
  shim maps the common cases; non-`danger` status-colored buttons fall back to
  `secondary`/`outline` rather than a bespoke hue.
- **Chip `color="primary" variant="flat"`** has no native v3 equivalent (v3 chip `color`
  only covers default/success/warning/danger; brand lives on `variant`). The shim renders
  the neutral soft chip and recolors it to the active skin via `.haha-chip-brand`.
- **Dev-only warning** `A PressResponder was rendered without a pressable child` appears in
  the dev console (emitted by react-aria internals around the controlled Modal). It is
  suppressed in production builds and has no runtime effect.
- **CSS minify warnings** `Unexpected ")"` during `vite build` come from empty `:is()` /
  `:not(:is())` selectors inside `@heroui/styles`; warnings only, output CSS is correct.

## Verified

- `npm run build` passes (2219 modules, fresh `dist/`).
- Headless render check: AuthLanding (Tabs/Input/Button), Changelog-style paneled Tabs,
  Select open + selection, Modal open via `useDisclosure` render-prop, Progress, Chip — all
  render and interact correctly with no fatal errors. Tab/Select selection values are clean
  (React's `.$` key escaping is reversed in the shim before handing ids to react-aria).
