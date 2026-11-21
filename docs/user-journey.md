# User Journey — Solid Pod Authentication

## Persona
**Name**: "Dev" — a developer building a Solid app
**Goal**: Quickly authenticate with their existing Solid Pod
**Context**: Using a laptop, Chrome, dark mode preferred

## Journey Map

### 1. Discovery
- **User**: Lands on app, sees login prompt
- **System**: Renders `<seba-login>` card
- **Friction**: None — card appears instantly (shadow DOM, no network)
- **Signal**: Hexagon brand + "Sign in to your Pod" title

### 2. Provider Selection
- **User**: Sees list of providers (ordered by their usage)
- **System**: Shows 4-6 primary providers with icon, name, domain
- **Friction**: Low — familiar patterns (pill buttons, icon + name)
- **Signal**: Provider logo + domain (e.g., `solidcommunity.net`)

**Alternative**: User clicks "More options" → dialog opens
- **System**: Searchable list, scrollable, bounded height
- **Friction**: None — search filters as-you-type
- **Signal**: "More options" button with overflow icon

### 3. Direct Provider Auth
- **User**: Clicks their provider (e.g., solidcommunity.net)
- **System**: Redirects to provider's authorization endpoint
- **Friction**: None — full page redirect, provider handles auth
- **Signal**: Standard OAuth2 consent screen

### 4. Return & Session Restore
- **System**: Receives callback, processes tokens, stores in IndexedDB
- **User**: Sees signed-in state automatically
- **Friction**: None — silent, no page reload flash
- **Signal**: "Your Pod is connected" + WebID displayed

### 5. Alternative: Username + WebID
- **User**: Types username instead of clicking provider
- **System**: Prefix dropdown auto-suggests provider (if recognized)
- **Friction**: Low — autocomplete on blur, prefix selection
- **Signal**: Prefix button shows provider icon + domain

### 6. Alternative: Custom WebID
- **User**: Selects "Custom URL" in prefix dropdown
- **System**: Expects full WebID URL in input
- **Friction**: Medium — user must know their WebID
- **Signal**: Input placeholder changes to "https://your-webid"

### 7. Error State
- **User**: Enters invalid WebID or provider fails
- **System**: Shows inline error notice with `role="alert"`
- **Friction**: Low — clear error message + action
- **Signal**: Red-tinted notice, actionable copy

### 8. Session Expired
- **User**: Returns after access token expired
- **System**: Attempts silent refresh (if refresh token available)
- **Friction**: None — transparent to user
- **Signal**: Brief loading indicator (aria-busy)

### 9. Sign Out
- **User**: Clicks "Sign out"
- **System**: Clears IndexedDB, returns to signed-out state
- **Friction**: None — immediate
- **Signal**: Back to provider list

## Pain Points & Mitigations

| Pain Point | Mitigation |
|------------|------------|
| "I don't know my WebID" | Prefix dropdown with provider domains; username shorthand |
| "Which provider?" | Usage-based ordering; search; "Custom URL" fallback |
| "Too many providers" | Primary list limited; "More options" for rest |
| "Dark mode / light mode" | Auto-detect OS preference; `theme` attribute override |
| "Accessibility" | Full keyboard, focus rings, ARIA, reduced-motion |
| "Customization" | 20+ CSS parts + `--seba-*` tokens |

## Success Metrics (Future)
- **Task success rate**: % completing auth within 1 minute
- **Provider selection time**: Median time from load to provider click
- **Error rate**: % of attempts resulting in error notice
- **Return rate**: % of users who successfully auth on return visit
- **Support requests**: "How do I find my WebID?" ticket volume

## Accessibility Journey
- **Keyboard**: Tab to provider → Enter → redirected
- **Screen reader**: Announces "Pod providers" group, "Sign in with {name}" per button
- **Focus**: Visible ring on every interactive element
- **Motion**: Card fade-in disabled under `prefers-reduced-motion`

## Responsive Journey
- **Desktop**: Full width card (25rem max), generous padding
- **Mobile**: Fits 320px viewport, provider buttons stack vertically
- **Overflow**: Horizontal scroll never occurs; provider rows use flex-wrap

---
*Document version: 1.0.0 — aligned with SEBA v1.1.0*