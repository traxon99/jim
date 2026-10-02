# Weekly set targets per muscle

History → Volume by muscle checks each muscle's weekly **working sets** against a target range for
the goal picked on that screen (issue #395). The numbers live in
`packages/core/src/history/volume-targets.ts` (`WEEKLY_SET_TARGETS`); the MCP `volume_report` tool
reports the same check when grouped by muscle.

| Goal | Weekly sets per muscle |
|---|---|
| Strength | 5–10 |
| Hypertrophy | 10–20 |

## How sets are counted

- Only working sets count. Warm-up sets and warm-up exercises are left out.
- A set counts once for each primary muscle and half for each secondary muscle. This is the
  "fractional" method, which Pelland et al. found predicted outcomes best of the methods they
  compared.
- One range applies to every muscle. The research doesn't support separate numbers per muscle.

## Why these ranges

**Hypertrophy: 10–20.**
- Schoenfeld, Ogborn & Krieger (2017) found a dose-response relationship, with the most growth in
  the 10+ weekly sets group.
- Baz-Valle et al. (2022), looking at trained lifters, recommend 12–20 weekly sets per muscle.
  More than 20 helped only the triceps.
- Pelland et al. (2026), a meta-regression of 67 studies, found growth keeps rising with volume
  but with diminishing returns.

10 sets is the floor where the meta-analyses agree growth is near its best. 20 is where extra sets
stop adding much and recovery cost climbs. Going over the range isn't wrong, but it's past the
point of good returns for most people.

**Strength: 5–10.**
- Ralston et al. (2017) found 5–9 weekly sets gave clearly more strength than fewer than 5. Going
  to 10+ added only a small further edge.
- Pelland et al. (2026) found strength's returns diminish much sooner than hypertrophy's, and
  that strength responds to training more often in a way size doesn't.

So past about 10 sets, heavier practice and frequency matter more for strength than more sets do.

## Sources

- Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance
  training volume and increases in muscle mass: a systematic review and meta-analysis. *J Sports
  Sci.* 2017;35(11):1073–1082.
- Baz-Valle E, Balsalobre-Fernández C, Alix-Fages C, Santos-Concejero J. A systematic review of
  the effects of different resistance training volumes on muscle hypertrophy. *J Hum Kinet.*
  2022;81:199–210. https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877/
- Ralston GW, Kilgore L, Wyatt FB, Baker JS. The effect of weekly set volume on strength gain: a
  meta-analysis. *Sports Med.* 2017;47(12):2585–2601. https://pubmed.ncbi.nlm.nih.gov/28755103/
- Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC. The resistance training dose
  response: meta-regressions exploring the effects of weekly volume and frequency on muscle
  hypertrophy and strength gains. *Sports Med.* 2026;56(2):481–505.
  doi:10.1007/s40279-025-02344-w. Preprint: https://sportrxiv.org/index.php/server/preprint/view/460
