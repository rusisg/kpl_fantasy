# KPL Fantasy — Frontend Design System & Guidelines

## 1. Typography & Hierarchy
* **Primary Font:** Inter or Manrope (sans-serif) for all data tables, numbers, and UI elements.
* **Display Font:** Clash Display or a condensed heavy sans-serif for team names, headers, and marketing copy.
* **Rule:** Never use default browser fonts. Numbers (prices, points, budgets) must use `tabular-nums` for vertical alignment.

## 2. Color Palette (Strict No-Default-Tailwind Rule)
Do not use raw `bg-slate-900` or `text-emerald-500` without purpose. We use a custom semantic theme mapped in `app/globals.css`:
* **Backgrounds:** Deep navy/ink (e.g., `#0A0E17`) instead of generic black. Surface cards should be slightly elevated (`#111827`) with subtle 1px inner borders (`border-white/5`).
* **Accents:** Official KPL brand colors. Primary: Cyan/Teal (e.g., `#00E5FF`). Secondary: Gold/Yellow (e.g., `#FFC107`).
* **Status:** Red for injuries/suspensions (`#FF453A`), Green for form/clean sheets (`#32D74B`).

## 3. Component Architecture (Shadcn UI + Radix)
* Do not build complex interactive components (Select, Dialog, Tabs) from scratch.
* Install and customize **Shadcn UI** for base primitives. 
* All buttons must have explicit `hover`, `active`, and `disabled` states with transition times of `150ms`.

## 4. Layout & Spacing
* **Grid:** Use a strict 12-column grid for dashboard layouts.
* **Density:** Sports apps require high data density. Reduce padding in player tables (use `py-2` instead of `py-4`) to show more rows above the fold.
* **Cards:** Remove heavy box-shadows in dark mode. Use subtle drop-shadows combined with micro-borders.

## 5. The "Anti-Slop" Mandate
* No excessive rounded corners (`rounded-3xl` is usually too much; stick to `rounded-lg` or `rounded-xl`).
* No glowing neon gradients unless specifically for a premium/captaincy badge.
* Data must dictate the design. The player's name, price, and next fixture are the most important elements on the screen.