# Accessibility (Phase 7)

Target: WCAG 2.1 AA. **No screen-reader or manual keyboard audit was performed** — the items below are what is implemented and what is machine-verified.

## Verified by tests
* **Colour contrast** (`web/tests/contrast.test.ts`, 26 assertions): body/secondary text, links, buttons, status badges, notices, form errors, text on navy at the opacities used, focus ring ≥ 3:1. The audit **failed four pairs from the original palette** and they were fixed: `muted` darkened (#667085 → #5F6A7D), and AA-safe *text* variants added (`emerald.text #127560`, `warn.text #8A5A12`, `danger.text #B3303E`); brand colours remain for fills/borders. Mobile uses the same text variants (`mobile/lib/core/theme.dart`).
* Modal: `role=dialog`, labelled, Esc closes, focus trapped/restored; DataTable error/empty states; Pagination labels; login field `aria-invalid` (`web/tests/ui.test.tsx`). Charts expose a text table alternative.

## Implemented (by inspection)
Skip link, landmarks (`header/nav/main/footer`), semantic headings, every input labelled (visible label or `aria-label`), error text linked with `aria-describedby` + `role=alert`, toast region `aria-live=polite`, visible `:focus-visible` rings, `prefers-reduced-motion` honoured, icon-only buttons have `aria-label`/tooltip, status never conveyed by colour alone (text labels), responsive layout without horizontal page overflow (tables scroll inside their container), 48 px minimum touch targets on mobile, text scaling respected on mobile (no fixed text heights), `Semantics` labels on cards/status/gallery on mobile.

## Not done / to test manually
VoiceOver/TalkBack/NVDA passes · keyboard-only run through every flow (date inputs, modals, tabs) · zoom to 200 %/400 % reflow · automated axe/Lighthouse runs (add `@axe-core/playwright` to the future E2E suite) · RTL and Somali/Arabic localisation · captions/alt text for user-uploaded listing images beyond the title-derived alt · the OpenStreetMap iframe's internal accessibility is not under our control.
