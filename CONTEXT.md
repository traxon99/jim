# Jim

A local-first strength training log with PRP, its progression engine. This glossary fixes the words
the app, the docs and the MCP use for training concepts.

## PRP

**Miss**:
A session whose top sets fall short of the bottom of the rep range on full rest. Misses in a row
hold the weight, then deload it. A high RPE alone is not a miss.
_Avoid_: Failed session, fail

**Set to failure**:
A set the lifter could not get another rep on: marked as a failure set, or logged at RPE 10. PRP
tracks it like a working set and reads it as where the lifter's limit is; it is never a miss.
_Avoid_: Failed set, miss

## Injuries

**Injury**:
A hurt body area the user is training around, open from the day it is reported until it is marked
healed.
_Avoid_: Pain report, tweak, niggle

**Injury area**:
Where an injury is: one muscle from the controlled muscle list or one joint, with a side for paired
areas. A joint stands for the muscles around it.
_Avoid_: Body part, location, region

**Joint**:
An injury area outside the muscle list (knee, elbow, wrist, hip, ankle) that stands for a fixed set
of muscles around it.
_Avoid_: Body part

**Pain level**:
How much an injury hurts on one day, from 0 (none) to 10, logged by the user while the injury is
open. A day without a check-in has no pain level.
_Avoid_: Severity, pain score

**Pain check-in**:
The user logging today's pain level for each open injury, usually before a workout.
_Avoid_: Daily report, pain entry

**Healed**:
The state an injury enters when the user marks it so; it closes the injury. Jim may ask, but never
heals an injury on its own. A later flare-up in the same area is a new injury.
_Avoid_: Resolved, recovered, closed

**Affected exercise**:
An exercise whose primary or secondary muscles include the injury area's muscles while the injury
is open, or one the injury has an exercise rule for.
_Avoid_: Injured exercise, blocked exercise

**Exercise rule**:
How one injury treats one exercise, in place of the area-wide treatment: fine (no hint, PRP as
normal), limit (a weight cap and/or rep range), light (PRP's light day) or avoid (skip or swap),
plus an optional note. It applies while the injury is open, even to an exercise that doesn't work
the area's muscles. Set from the MCP or, with the Advanced switch on, Profile → Injuries.
_Avoid_: Injury override, exercise restriction
