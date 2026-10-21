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

`sim/` plays bot-vs-bot games through the rules engine.

```
node sim/run.js <scenarios.mjs> <out.json> [--games N] [--depth D]
                [--bot '{"kind":"power","level":"strong"}']
node sim/tune.js [rounds] [seedsPerMatch]
node sim/tune-powers.js [rounds] [seedsPerMatch] [configJson]
```

A scenarios file default-exports `[{ id, label, group, meta, bot, config }]`,
where `config` is a settings override (see `src/rules/config.js`) and `bot`
(optional) overrides `--bot`. Games use seeds `1..N`, so results are
reproducible.

Bots: `search` (`sim/bot.js`, powers off, `--depth`) and `power`
(`sim/powerbot.js`, powers on or off) with levels `strong` (two-turn
expectimax, card counting) and `average` (one-turn lookahead, no card
counting, softmax choice).

## License

All rights reserved. No reuse, scraping, or use for AI training. See
[LICENSE](LICENSE).
