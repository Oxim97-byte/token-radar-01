# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Oxim97-byte/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Oxim97-byte/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: every rankable pre-token protocol in the sealed DefiLlama snapshot, priced off the market — each category's live-token market-cap-to-TVL multiple, shrunk toward the global multiple and capped at 3x — then adjusted for growth, age and chain breadth, with a seven-step farm plan per protocol.

What makes this radar auditable: every row names the five live-token peers that price it, shows its valuation as a dollar waterfall (TVL → base → growth → maturity → chain → implied), and carries a 0–100 confidence score from comp depth, multiple agreement and data completeness. The dashboard plots the whole board as an interactive log-log radar screen, with a live model sandbox beside the method section.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kit/input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json`, the dashboard's `data.js`, copies `dashboard/` and `screenshots/`, and writes `dossier.json` with the vendored make.fun library. Open `out/dashboard/index.html` in a browser; it renders with no network.

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
