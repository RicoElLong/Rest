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
- Latest user override: show the literal `+7 (892) 000-00-00` at the right of the homepage header, aligned in the booking button row on desktop and grouped beside the compact logo in one mobile header row, with the address «Самара, ул. Лейтенанта Шмидта, 1В» below the phone, linked to `tel:+78920000000`. Use bold white sans-serif numerals matching the user reference. Use this number consistently for bookings, contacts, footer and all telephone links on both pages. Latest 2026-10-22 owner override: show «Акции» immediately after «Банкеты» in desktop/mobile headers, opening the restaurant Telegram bot. Keep it absent from footers and gastronomic map headings. Keep the gallery section and footer gallery link; header booking buttons keep black text on hover, focus and press.
- Do not show filler text about missing recipes, source data, uncertain dish names or unavailable descriptions. Leave editorial fields empty and hide their blocks when meaningful copy is unavailable.
- Gallery links should align the carousel photograph below the sticky header using a single offset, including after catalogue data changes page height.
- Keep mobile layout overrides in `assets/mobile.css`: up to 920px the chooser is one vertical column in this order: kitchen, grill, bar, booking and the benefits strip stays in normal document flow. At phone widths use matching readable cards on both pages (one column below 360px, two above), 16px search controls and touch targets of at least 44px. Preserve the desktop layout.

- The shared palette in `assets/black-green.css` uses the masthead near-black green `#080f0b` for section backgrounds and `#0b1710` for raised surfaces. Preserve brass accents, white phone numerals and natural photo colors.

- The catalogue search field has been removed on both pages at the user’s request. Preserve category selection, sorting and dish dialogs; ignore and clear legacy `q` URL parameters.

- Mobile headlight stability override: at widths up to 920px keep beam origins, angles, length and height fixed relative to the automobile. Preserve opacity flicker, but never aim at dropdown navigation or restart geometry on viewport-height-only resize. Keep desktop section projection unchanged.

- Promotions removal approved on 2026-10-22: the `news.html` section and its dedicated assets are removed. A subsequent owner request restores only header «Акции» links immediately after «Банкеты», using `https://t.me/RESTSCHMIDTBOT?start=src_header_home` / `src_header_menu` as native HTTPS anchors in a new tab. Do not restore the removed page, cards or dialogs without a new request. Keep the separate floating Telegram widget above Delivery on both remaining pages, using the owner-provided `https://t.me/RESTSCHMIDTBOT` and a source tag per page. Visiting the bot is not marketing consent. Do not introduce MAX or bot tokens into public files. Keep releases scoped to the latest owner request.

- Kitchen PDF override (2026-10-21): the first «Меню кухни» panel on both entry points is a native link to `assets/menus/kitchen-menu.pdf`, opening a new tab. Do not intercept it with catalogue selection or preload the 10 MB PDF. Preserve grill/bar/category/booking behavior and keep menu JSON preload/fetch cache versions identical. Replace this PDF only with an owner-provided file.
