# Restaurant site rules

- Work in the existing checkout; no extra worktree is needed.
- Keep Contacts / How to find us (`#location`) as the last content section on the homepage, immediately before the footer. Add all future content sections above it. Do not make this section a fixed overlay.
- Navigation labels must match their destinations: Gallery → `#gallery`, Contacts → `#location`, Banquets → `#banquets`. From other pages, use `index.html#…`. Keep mobile, desktop and footer links consistent.
- Restaurant map links must use the exact Yandex organization identity `146001632122`, not a generic text search or the map viewport center. Address: Самара, улица Лейтенанта Шмидта, 1В. Do not infer restaurant coordinates from screenshots of nearby addresses.
- Keep local asset directories intact (`assets/`, `assets/fonts/`, `assets/vendor/`).
- Verify layout and navigation on narrow mobile screens and desktop before publishing.

## Approved headlight animation

- The user selected the restored headlight animation (mechanics from commit `8681494`, restored by `c81970d`) as the preferred version. Preserve the geometry, equal lens sizes, section sequence and scroll direction behavior in `assets/headlight-scroll.js` unless explicitly asked to change them. Do not reintroduce the rejected narrow spotlight treatment from `c50637d`.
- Latest approved appearance: restore the original cooler cream-white headlight/beam colors, keep the broad cones shown in the user screenshot, and keep soft visible flicker enabled both at rest and during scroll projection. Do not narrow the beams. Respect prefers-reduced-motion.

- Preserve the original automobile silhouette and all header/logo dimensions. `assets/logo-car-compatible.png` is the transparent 2172×724 export of the approved artwork, with cleanup baked in for Safari compatibility. Use this PNG in the header, with no runtime image filters. Keep `logo-car-clean.svg` and the original `logo-car-hd.png` as sources; do not replace the silhouette.

- Keep catalogue data preloaded and its deferred script independent of GSAP loading. The catalogue must stay usable even if the animation library is delayed. Prefer optimized WebP assets for decorative images.
- Dish photo placeholders are local individual dish illustrations, explicitly labelled temporary. Every dish must have a distinct matching photo; never reuse one category photo across its dishes. Keep individual `item.image` empty until real dish photos are supplied; a real image takes precedence automatically. Keep JSON preload and fetch version URLs identical.

- The interactive catalogue appears on both `index.html` (also `/Rest/`) and `menu.html`. Keep its category navigation and dish details consistent on both entry points using the shared `.catalog-editorial` component styles.

- Default catalogue selection on both entry points is `grill` (10 dishes). There is no all-dishes mode or category button; legacy `?category=all` links fall back to grill. Search, reset and hero panels must keep a single real category selected. Preserve all 48 dishes across the 10 categories.
- Category navigation wraps into compact rows on desktop and mobile, with no horizontal scrolling, scrollbar or swipe hint.
- Latest user override: show the literal `+7 (892) 000-00=00` at the right of the homepage header, aligned in the booking button row on desktop and kept in the top-right corner on mobile, linked to `tel:+78920000000`. Keep other booking/contact numbers unchanged. Promotions belongs at the right of the gastronomic map heading, not in the header; its filled brass button and header booking buttons keep black text on hover, focus and press.
- Do not show filler text about missing recipes, source data, uncertain dish names or unavailable descriptions. Leave editorial fields empty and hide their blocks when meaningful copy is unavailable.
- Gallery links should align the carousel photograph below the sticky header using a single offset, including after catalogue data changes page height.
- Keep mobile layout overrides in `assets/mobile.css`: up to 920px the chooser is a compact 2×2 grid and the benefits strip stays in normal document flow. At phone widths use matching readable cards on both pages (one column below 360px, two above), 16px search controls and touch targets of at least 44px. Preserve the desktop layout.
