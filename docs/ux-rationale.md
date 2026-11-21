# UX Rationale — `<seba-login>` Component

## Strategy
**Problem**: Solid-OIDC authentication is complex. Users need to enter a WebID, discover their provider, and complete an OAuth2 flow. Existing solutions are either too technical (raw WebID input) or locked to specific providers.

**Solution**: A single, self-contained Web Component that:
- Accepts username or full WebID
- Auto-discovers providers via well-known endpoints
- Remembers user's recent providers (usage-based ordering)
- Falls back to custom WebID entry
- Handles PKCE, DPoP, and session restoration transparently

**Target users**: Developers building Solid apps; end-users with Solid Pods from various providers.

## Scope
**In scope**:
- Provider discovery & presentation
- WebID/username input with prefix dropdown
- "More options" dialog for additional providers
- Custom WebID entry
- Session restoration (silent login)
- Theming (dark/light, CSS custom properties, CSS parts)

**Out of scope**:
- Backend auth logic (handled by `Seba` class)
- Provider-specific UI (e.g., branding, signup flows)
- Multi-account management

## Structure (Information Architecture)
```
seba-login (signed out)
├── Brand mark (hexagon) — identity anchor
├── Title — "Sign in to your Pod" (configurable via `label` attr)
├── Subtitle — "Choose your Pod provider to continue."
├── Primary providers (top 4-6 by usage/popularity)
│   └── Provider button: icon + name + domain
├── "More options" button → Dialog
│   ├── Search/filter
│   ├── Remaining providers
│   └── "Other provider" → custom entry
├── Divider: "or"
├── WebID form
│   ├── Label: "Continue with your WebID"
│   ├── Prefix dropdown (provider hostname or "Custom URL")
│   ├── Input: username / full WebID
│   └── Continue button (primary CTA)
├── Trust note: "Your password never leaves your provider."
├── Create link: "New to Solid? Get a Pod" → external signup URLs
```

## Skeleton (Interaction Design)
- **Default state**: Signed out, shows providers + WebID form
- **Primary provider click**: Redirects to provider's authorization endpoint
- **More options**: Opens dialog with searchable list; selecting redirects
- **WebID form submit**: Validates, builds WebID, redirects to discovered/fallback provider
- **Signed-in state**: Shows account head, WebID, sign-out button
- **Error states**: Inline notice with `role="alert"`, persists until next interaction
- **Loading state**: `aria-busy="true"`, disables interactive elements

## Surface (Visual Design)
- **Dark-first** (OS preference, manual toggle via `theme="light"`)
- **Purple accent** (`--seba-accent: #8b5cf6` / `--seba-cta: #7c3aed`)
- **Pill buttons** (9999px radius) for all actions
- **Floating hexagon** brand mark (no bounding square)
- **Hairline borders** on provider buttons
- **Consistent 8px spacing grid**
- **Typography**: System font stack, 15px base, clear hierarchy

## Theming Strategy
All colors exposed as `--seba-*` custom properties on `:host`:
- `--seba-bg`, `--seba-surface`, `--seba-btn`, `--seba-field`
- `--seba-accent`, `--seba-cta`, `--seba-cta-text`
- `--seba-text`, `--seba-text-2`, `--seba-muted`
- `--seba-border`, `--seba-border-strong`, `--seba-ring`
- `--seba-radius`, `--seba-pill`, `--seba-radius-control`
- `--seba-shadow`, `--seba-transition`, `--seba-ease`

CSS Parts (exposed via `part` attribute):
- `card`, `brand-wrap`, `brand`, `title`, `subtitle`
- `providers`, `provider`, `provider-hit`, `more`, `or`
- `label`, `combo`, `prefix`, `prefix-button`, `prefix-menu`, `input`
- `continue`, `notice`, `trust`, `create`, `signed-in`, `account-mark`, `webid`, `signout`
- `overlay`, `dialog`

## Accessibility Decisions
- **Focus**: `focus-visible` rings on all interactive elements (2px accent)
- **Keyboard**: Full tab order; Enter/Space on buttons; Escape closes dialog
- **ARIA**: `role="alert"` on error notice; `aria-label` on icon-only buttons; `aria-expanded` on dialog triggers; `role="dialog"` + `aria-modal` on overlay
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables card fade-in and hover transitions
- **Contrast**: All text/background combos ≥ 4.5:1 (AA), large text ≥ 3:1
- **Shadow DOM**: All styles encapsulated; host controls theming

## Content Design Principles (Sarah Winters / Adam Silver)
- **Labels are actions**: "Continue with your WebID" → tells user what happens
- **Errors are helpful**: "WebID not found" + "Check spelling or choose a provider"
- **No jargon**: "Pod provider" not "Identity Provider" / "OIDC issuer"
- **Trust signal**: "Your password never leaves your provider" — addresses top fear
- **Empty states**: Dialog shows "No providers found" with action to try custom URL

## Cognitive Bias Mitigation (David Dylan Thomas)
- **Default bias**: "Custom URL" shown but not pre-selected → user makes explicit choice
- **Choice overload**: Primary providers limited; "More options" hides rest
- **Anchoring**: Usage-based ordering puts user's recent provider first
- **Recognition over recall**: Prefix dropdown shows icons + domains, not raw URLs

## Systems Thinking (Julie Zhuo / Irene Au)
- **Design tokens**: All colors/spacing exported as CSS custom properties → single source of truth
- **CSS Parts**: Component structure exposed for downstream styling without breaking encapsulation
- **Token export**: JSON token file for non-CSS consumers (Figma, design systems)
- **Versioned tokens**: Tokens versioned with component; breaking changes = major version

## Rationale for Key Decisions

| Decision | Rationale |
|----------|-----------|
| Username + WebID in one field | Reduces fields; users know their username; prefix dropdown handles provider |
| Provider prefix dropdown | Mirrors phone-number UX; users recognize their provider's domain |
| "More options" dialog, not autocomplete | Keeps primary UI clean; search available when needed |
| Usage-based ordering | Reduces friction for returning users; no config needed |
| Dark-first design | Developer tools trend; reduces eye strain; light mode fully supported |
| No gradients/animations | Professional, fast, accessible; avoids AI-slop tells |
| Floating hexagon | Distinctive brand mark; works at small sizes; no bounding box |

## Open Questions / Future Work
1. **Telemetry opt-in**: Lightweight funnel metrics (provider selection rate, error rate) per Jen Romano's experimental validation?
2. **User testing**: 5 Solid users, think-aloud on "sign in" task?
3. **Token versioning**: Publish `seba-tokens.json` as separate package export?
4. **RTL support**: Verify layout flips correctly for Arabic/Hebrew.

---
*Document version: 1.0.0 — aligned with SEBA v1.1.0*