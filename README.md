# Board game (working title)

Source code for a personal play-testing app for an original board game inspired
by the Royal Game of Ur. Built as a web app first, wrapped into an Android app
later.

## Run the tests

Requires Node.js 18 or later. No install step.

```
npm test
```

## Run the app locally

Serve the folder with any static file server and open `index.html`, for example:

```
python3 -m http.server 8000
```

## Simulations

`sim/` plays bot-vs-bot games through the rules engine (powers off for now).

```
node sim/run.js <scenarios.mjs> <out.json> [--games N] [--depth D]
node sim/tune.js [rounds] [seedsPerMatch]
```

A scenarios file default-exports `[{ id, label, group, config }]`, where
`config` is a settings override (see `src/rules/config.js`). Games use seeds
`1..N`, so results are reproducible.

## License

All rights reserved. No reuse, scraping, or use for AI training. See
[LICENSE](LICENSE).
