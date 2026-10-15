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
