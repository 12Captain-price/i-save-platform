# Homepage redesign validation

Completed 21 October 2026. Preview: http://127.0.0.1:13010 (isolated `isave-ui-review` frontend).

## Scope and preservation

The homepage now uses the requested hero wording, compact savings-category discovery, three membership stages, separate guidance and a closing application/contact section. Category, registration, login and information links use existing routes. Contacts come from the existing published public-settings API, with loading, failure and retry states.

The official logo, shared header/footer, typography and dark teal/emerald identity remain intact. Only `src/routes/index.tsx` changed among the 376 files fingerprinted at the start of this task; the other 375 match exactly. Components, scoped styles, tests and evidence were added in new files. See [preservation result](homepage-redesign/preservation-result.json).

Authentication, permissions, registration, Settings, ZiG rules, backend code, migrations and existing uncommitted work were preserved. No database records or financial rules were changed. Only the isolated UI project's frontend was rebuilt/recreated. Its backend/database were not reset. The normal application, normal database, Mailpit and separate Settings rehearsal were not changed. Nothing was pushed or merged.

## Illustration and content

The original SVG/CSS illustration reserves its dimensions and shows eight decorative bars, a subtle grid, goal marker and Education/Home/Travel icons. On visibility it runs once, with one Step 01–08 counter, then remains complete. It has no monetary figures, performance arrow or return curve. Visible captions explain that the sequence is neither a payment schedule nor a balance, and does not mean eight payments, weeks or programme completion.

Reduced motion, unsupported animation observation and server-rendered/no-JavaScript output show the completed illustration. The decorative graphics/counter do not generate repeated screen-reader announcements. Calls to action are immediately usable.

The five categories appear once, linking to their existing information pages. Interest remains explicitly separate from enrolment and unpublished plans are not presented as offers. Membership review, separate fee verification, account setup and office payment guidance remain visible.

## Validation results

| Check | Final result |
| --- | --- |
| Full frontend unit/component suite | 96 passed across 13 files |
| Homepage browser suite | 11 passed, 0 failed, 0 skipped |
| TypeScript | Passed |
| Production client/server build | Passed in isolated frontend Docker build |
| Whitespace validation | `git diff --check` passed; existing LF/CRLF notices only |
| Existing-file preservation | 375 unchanged; homepage route only changed |

Browser checks covered 360, 390, 768, 1440 and 1920px layouts; horizontal overflow, heading/link structure, hero touch targets, text contrast, keyboard skip/focus behavior, responsive navigation and representative shared shells. They verified category destinations, registration/login pages, live contact rendering and contact failure/retry. Animation visibility, one-shot behavior, reserved dimensions, reduced motion and disabled JavaScript were checked.

At 390px the final full homepage measures **4,105px**, compared with **4,120px** before. Early checks caught excess mobile spacing and a navigation-test locator that changed with its accessible name; both were corrected before the final passing run. The original browser command's exit status was preserved; final exit status was 0.

The 200% check used equivalent desktop reflow: 720 CSS pixels at device scale 2 for a 1440px display. Headless Chrome ignored its native UI zoom shortcut, so native browser-menu zoom is **not** claimed as independently verified. See [zoom method](homepage-redesign/after/zoom-method.json). Human screen-reader testing and cross-browser engine testing remain manual checks. Full backend and portal browser suites were not rerun for this homepage-only change; counts from earlier milestones are not included here.

These browser cases were read-only: no application, payment, account or settings submissions. Screenshots show the disposable environment's published synthetic contact email, not a replacement of normal approved contacts.

## Screenshots

| View | Before | After |
| --- | --- | --- |
| Mobile 390px | [Before](homepage-redesign/before/home-390.png) | [After](homepage-redesign/after/home-390.png) |
| Desktop 1440px | [Before](homepage-redesign/before/home-1440.png) | [After](homepage-redesign/after/home-1440.png) |

Additional evidence: [1920px viewport](homepage-redesign/after/home-1920-viewport.png), [200% equivalent reflow](homepage-redesign/after/zoom-200.png), [shared How It Works](homepage-redesign/after/shared-how-it-works-390.png), [shared Contact](homepage-redesign/after/shared-contact-390.png). Before images preserve the immediately preceding UI-refinement baseline.

The isolated preview remains available. The redesigned homepage has not been activated in the normal application.
