# Smooth motion: everything that moves in place at 15 pictures a second

Date: 2026-10-31. Branch `smooth-motion` (from main after #6).

## The problem

The user: "The animation is not smooth enough, is looks like frames".

What moves across the room is placed at the pixel every frame (30 a
second by default), so it glides. What moves in place is a loop of kept
pictures, and those loops are drawn at 3 to 8 pictures a second:

| what | pictures a second |
| --- | --- |
| locals' own loops | 3 to 8 (median 5) |
| locals' shared acts | 5 to 7.5 |
| animated props, steam, embers, the room's overlay | 6 (`AMBIENT_FPS`) |
| desk loops | 3 to 8 |
| an agent idling, reading, thinking, sitting, asleep | 2.5 to 4 |
| an agent walking, writing, running | 11 to 16 |

Most of those rates also do not divide 30, so their pictures are held
for uneven runs of frames (3.75 a second: 8 frames each, but 6.7: 4 and 5
in turn), which reads as a stutter.

## The decision

The user chose 15 a second for everything that moves in place (over 15
for characters only, and over 30, which measured at five times the bytes
with the sprite cache thrashing). 15 divides 30 and 60, so at the default
30 fps each picture shows for exactly two frames.

## The design

- **One rate.** `src/art/motion.ts`: `ANIM_FPS = 15` and
  `framesFor(secs)`, the pictures a loop of `secs` seconds is drawn in.
- **Agents.** `LOOP` keeps each pose's length; its frame count comes
  from `framesFor`. What a pose did by frame number (the mouth's flaps,
  hands taking turns typing, a shake) goes by time instead, at the rate
  it had, so it reads the same.
- **Locals.** A loop names only its length (`NpcLoop` loses `frames`);
  its pictures come from `framesFor`. Shared acts the same.
- **Props and the room.** `AMBIENT_FPS` is `ANIM_FPS`; a worked station's
  2 s loop is 30 pictures (`CYCLE`).
- **Desk loops.** A desk loop names its length (`secs`) and draws at `u`,
  0 to 1 round the loop (u = 0 is the still picture while the screen is
  off), not frame `i` of a table: each world's loops are redrawn as
  smooth curves through what their tables held.
- **Critter and emotes.** Their loops at 15 a second; the critter's
  blink keeps its moment in the loop.
- **Art passes, a world at a time.** Motion that steps on purpose
  (`Math.floor(t * k)`, a table indexed by frame) is made smooth where it
  is movement (a lever, a bob, a swing, a flame's sway); flicker and
  blinking lights stay stepped.
- **The sprite cache** holds about three times as many pictures (3000,
  128 MiB): at 15 a second twenty busy agents need about 5000 in two
  minutes, and at 1000 they were drawn again and again.

## Cost

Measured in a stress room (twenty agents, the locals, 150 x 46 at the
user's 19 x 42 cell, 30 fps): about twice the bytes a step of today
(the cafe 17.5 to about 41 KiB, hell 30.5 to about 57), the slowest step
under 20 ms. Checked in a real Ghostty before it ships.

## Tests

- The locals' contract: loops by length, not frame counts; worked
  station loops repeat within 2 s (30 pictures).
- Desk loops' contract: drawn at u, still at 0, every u paints.
- A rate test: every loop (poses, acts, locals, desk loops, critter,
  props) is drawn at 15 a second, within rounding.
- The 4 KiB a step budgets re-measured; any raised says why.

## Not in this project

Easing of walking, pop-ins and effects (project C); tweening between
kept pictures (a terminal places pictures, it cannot blend them).
