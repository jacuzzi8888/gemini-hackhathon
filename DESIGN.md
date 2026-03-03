# Design System: Aura Sight Minimalist UI
**Project ID:** 10313688053597014248

## 1. Visual Theme & Atmosphere
The interface embodies an "Ultra-Minimalist Utility" atmosphere. It is profoundly quiet, stripped of all decorative textures, heavy glows, and unnecessary borders. The aesthetic relies entirely on extreme high contrast, generous negative space, and absolute clarity. It feels less like a traditional app and more like a precision sensory tool inspired by Braun and modern Apple accessibility features.

## 2. Color Palette & Roles
* **Pitch Black Canvas** (`#0A0A0A`): The fundamental background color. It creates an infinite, distraction-free environment that recedes completely.
* **Pure High-Contrast White** (`#FFFFFF` / `slate-100`): Used for primary text, core iconography, and structural lines. Ensures maximum legibility for low-vision users.
* **Electric Cyan Primary** (`#137FEC`): The sole vibrant color in the default state, used strictly to indicate active scanning, focus, or "Safe" states.
* **Safety Orange** (`#FF4D00`): (Inferred from prompt) Reserved exclusively for critical warnings and Guardian alerts. Never used for decoration.
* **Muted Slate** (`#64748B` / `text-slate-500`): Used sparingly for secondary metadata to establish clear visual hierarchy without clutter.

## 3. Typography Rules
The entire system utilizes a single typeface: **Inter** (sans-serif). 
* It relies on weight (fonts ranging from 300 to 700) and generous letter spacing (`tracking-widest` or `tracking-[0.2em]`) to create hierarchy rather than different fonts.
* **Headlines/Nav**: Typically small, uppercase, bold, and widely tracked (e.g., `text-[10px] font-bold uppercase tracking-widest`).
* **Body/Instructional**: Clean, medium-to-large sizing with tight tracking for swift readability (`text-lg font-medium tracking-tight`).

## 4. Component Stylings
* **The Nexus Interface (Core interaction):** A completely flat, hollow ring created with thin translucent strokes (`border: 1px solid rgba(255, 255, 255, 0.4)`). It uses raw CSS geometry (50% border radius) and simple pulse animations rather than complex imagery.
* **Navigation & Actions:** Icon-heavy using simple `Material Symbols Outlined`. Actions are completely flat. State changes (like hover/active) are communicated through opacity shifts (e.g., changing from `text-slate-100/40` to `text-primary`) rather than boxed buttons.
* **Shadows & Depth:** Shadows are intentionally omitted. The design relies on flat z-indexes. When depth is absolutely required, it uses large scale, subtle color gradients (e.g., `bg-gradient-to-b from-transparent to-background-dark/40`) to create a soft vignette effect rather than sharp drop shadows.

## 5. Layout Principles
* **Absolute Centering:** The core function block is perfectly centered in the viewport, surrounded by massive negative space to prevent accidental touches.
* **Anchored Peripheries:** Secondary actions (Settings menu, tab bar) are solidly anchored to the extreme top and bottom of the screen (`px-10 pb-10 pt-4`).
* **Tap Target Sizing:** Interactive areas rely on the padding of the layout, ensuring that the touch region is massive, even if the visual icon is standard size.
