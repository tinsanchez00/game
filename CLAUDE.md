# Working agreement

This file tells any Claude session working on this repo how we collaborate.
Read it before doing anything else.

## The project

A personal Android board game app for play-testing an original board game
inspired by the **Royal Game of Ur**. The owner is designing their own variant.

## This repo is public: code only

- The **rulebook and design decision log are private**. They live in the
  owner's Claude Project ("Mobile Board Game App", docs `claude/rules.md` and
  `claude/decisions.md`). Read them there; that copy is the source of truth.
- **Never commit** the rulebook, the decision log, design notes or rule
  explanations to this repo — not as files, comments, commit messages, issues
  or PR descriptions. Keep code comments technical.
- **Exception (owner decision #164, 2026-10-24):** the short one-line power
  summaries shown on screen (`src/ui/labels.en.js`, `src/ui/labels.es.js`) may
  live in the repo, in both languages. Nothing longer than that: the full
  rulebook and design notes stay private.

## The one rule: the owner makes every design decision

The owner wants full control over design. That means:

- **Never decide a rule, visual, layout, interaction, sound, wording or feature
  on your own** — not even "small" ones like a color, a font or a button label.
- For each such choice, present **2–3 concrete options** and let the owner pick.
  For anything visual, show the options as mockups they can look at, not just
  descriptions. Briefly note the trade-off of each option.
- If something isn't specified yet, ask; don't fill the gap with a default.
  Placeholders while building are fine, but label them clearly as placeholders.
- Log every choice the owner makes in the private decision log (date, question,
  options shown, what they chose, why if they said).
- Technical internals that don't change what the player sees or how the game
  plays (file layout, function names, tests) are yours to handle — but mention
  anything notable in one line.

## Rules come first

- The private rulebook is the single source of truth for how the game plays.
- We write each rule together **before** coding it. Code follows the rulebook,
  never the other way round.
- If coding reveals a gap or contradiction in the rules, stop and ask — don't
  resolve it in code.

## Tech setup (changeable — the owner can revisit any of it)

- **Web app first**: plain HTML, CSS and JavaScript (ES modules), no build step.
  Later it gets wrapped into an Android app; how is an open decision.
- **Hosting**: GitHub Pages, served from the `main` branch root. Every push to
  `main` updates the play-test build.
- **Online play**: the second player connects through Firebase.
- **Target device**: Android phones. Orientation, layout and look are open
  decisions.

## Code layout

```
src/rules/     game logic only: no DOM, no visuals, fully testable
src/ui/        everything the player sees and touches
src/main.js    wires rules and UI together
index.html     app entry point
tests/         tests for src/rules (run with `npm test`, uses node --test)
```

Keep game logic in `src/rules/` pure (no DOM access) so it can be tested and so
the visuals can change freely without touching the rules.

## Workflow per feature

1. Agree the rule wording in the private rulebook.
2. Write tests for it in `tests/`.
3. Implement in `src/rules/`.
4. For any UI, show options → owner picks → build it.
5. Run `npm run stamp` (content hashes in index.html, so phones load the new
   files at once; `npm test` fails when it's stale), then commit with a clear,
   technical message and push to `main`.
