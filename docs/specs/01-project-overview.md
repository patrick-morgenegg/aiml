# 01 – Project overview

| | |
|---|---|
| Module | KETE, Prof. Dr. U. Michelucci |
| Authors | Patrick Morgenegg, Niklas Grün |
| Data | OpenPowerlifting (Public Domain) |
| Problem type | Binary classification |
| Positive class | `dl3_failed = 1` – the 3rd deadlift attempt fails («Versuch scheitert») |

## Decision supported (report 2.1)

In a powerlifting meet each lifter has three deadlift attempts. After the 2nd attempt the coach must
declare the weight of the 3rd. Too heavy → a failed lift costs total and placing; too light → potential is
left on the platform. Today this choice relies on experience and rules of thumb.

The system estimates **the probability that the 3rd attempt fails for a planned weight**. The coach can
compare several candidate weights. The coach stays responsible for the decision.

## Why classification, not regression (report 2.2)

The maximum liftable weight is never observed – the data holds only the attempted weight and whether it
was good. Classifying "fails / succeeds" for a *given* weight is observable, and scanning candidate weights
recovers the comparison a regression would have given.

## Label (report 2.3)

OpenPowerlifting stores failed attempts as negative weights (−230 = failed with 230 kg).
`dl3_failed = 1` if `Deadlift3Kg < 0`, else `0`; the attempted weight is `|Deadlift3Kg|`.
Rows without a recorded 3rd attempt (passed, not reported) are excluded.

## Decision point (report 2.4)

```
squat 1-2-3 → bench 1-2-3 → deadlift 1 → deadlift 2 → ▶ PREDICT ◀ → deadlift 3 → total, place, points
                                                           known ◀───┘└───▶ unknown
```

| Known at the decision point (may be a feature) | Unknown (must never be a feature) |
|---|---|
| Squat and bench results of the same meet | Result of the 3rd deadlift |
| Weight and result of deadlift 1 and 2 | Best deadlift (`Best3DeadliftKg`), `TotalKg` |
| Bodyweight, age class, equipment, federation, date | `Place`, Dots, Wilks, Glossbrenner, Goodlift |
| The athlete's results in **earlier** meets | Anything from later meets |

## Stakeholders

Coaches (decide), athletes (affected), the project team (builds and monitors). See spec 07 for fairness and
spec 08 for human-in-the-loop requirements.

## Out of scope

Training load, warm-up, bar speed, weight cutting and day form are not in the data. The model is a
decision aid, never an autopilot.
