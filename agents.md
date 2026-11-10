# Dendrite Garden: the guide for agents

How a script or an agent builds a garden, runs it, changes it while it runs and reads it, through the page's API, `window.garden`, on the page https://gsnautilus.github.io/dendrite-garden/cortex.html. The page's own interface makes its changes and reads through the same calls. The page's manual, for people using it by hand: https://gsnautilus.github.io/dendrite-garden/manual.html.

`window.garden` is on the page always.

## 1. Running the page
Open the page in a browser with WebGPU (the site's front page says what a browser needs). A script or an agent drives it by evaluating expressions in the page: by hand in the browser's developer console, or from a program through the browser's DevTools protocol (`Runtime.evaluate` with `awaitPromise`), a headless browser among them; headless Microsoft Edge started with `--enable-unsafe-webgpu` runs it on a machine with a graphics card. Return JSON-safe values (the examples in §6 return `JSON.stringify(…)`). GPU errors show in the page's `#err` element: read `document.getElementById('err').textContent`.

## 2. A garden

### 2.1 Its settings

What `garden.build` takes and `garden.settings()` gives:

```js
{
  groups: [{
    key: 'A', morphology: 'spiny L5', transmitter: 'glu',   // glu, gabaA or gabaB
    cells: 6,
    dials: { size: { centre: 1, spread: 0.1 }, nmda: { centre: 0.5, spread: 0.05 } },
    background: { fE: { centre: 0.5, spread: 0.05 }, fI: { centre: 1, spread: 0.1 }, mE: { centre: 3, spread: 0, reason: 'one volley size' } },
    leak: { soma: { g: { centre: 0.05, spread: 0.005 }, E: { centre: -70, spread: 0, reason: '…' } }, … },   // optional: the starting set's
    channels: { na: { soma: { amount: { centre: 80, spread: 8 }, factor: { … } }, … } },                    // optional
    gates: { 'na.m': { shift: { … }, speed: { … } }, … },                                                    // optional
    own: { 2: { 'k.soma.amount': 70, size: 1.2 } },   // a neuron's own values (garden.setNeuron writes them); bgG: its kept background size
  }],
  regions: [{        // every group sits in one; µm and degrees
    key: 'A', shape: 'column',          // ball, shells, slab, column, band, cord, ring
    name: 'Cortex',                     // shown where the region is named (renameRegion; unsaid, "Region" and its key)
    at: [x, y, z], tilt: 0, heading: 0, // its place (a slab's, column's, cord's first face; a band's outer face at its middle; a ball's,
                                        // shells' or ring's centre); its turn: its axis (+y) leaned toward +x by tilt, then about +y by heading
    size: 300,                          // across: a slab's or a band's side, a column's or a cord's diameter, a ring's outer diameter
    bend: 660,                          // a band's: the radius of its outer face (unsaid: twice its side)
    thickness: 82.5,                    // a ring's, along its axis (unsaid: 82.5)
    seed: 123,                          // its layout's own (unsaid: from the build's seed and its key)
    inside: true,                       // its dendrites kept inside its first and last faces along its axis (unsaid: false)
    layers: [{ name: 'L1', thickness: 100 }, { name: 'L2/3', thickness: 250 }, …],   // along its axis from its first face; their sum its depth
    groups: [{ key: 'L23', layer: 'L2/3' },                                         // fills that layer
             { key: 'PV', from: { layer: 'L2/3', at: 0 }, to: { layer: 'L6', at: 1 },  // a range: each end a layer and a place in it (0 to 1)
               trunks: { rule: 'shape', lean: 10 } },                               // 'shape' (unsaid), 'fixed' with tilt and heading, or 'any'
             { key: 'L5', layer: 'L5', trunks: { rule: 'shape', lean: 10, tuft: 'L1' } }],   // the layer its tufts reach (shape only)
  }],
  connections: [{ from: 'A', to: 'B', key: 'A>B', lands: 'dendrites', count: { centre: 8, spread: 2 }, store: 1.5, class: 'eeDep', nmda: 0.5, speed: 0.3, dynamics: { U: { centre: 0.3, spread: 0.05 } } }],
  library: { … },     // the channel library (garden.library()); unsaid, the default (the three first types and the HVA, two types, and SK, placed in no group)
  background: 0.25,   // the Background setting the build starts at (0 to 1)
  seed: 11,           // the build's seed: a build from the same settings, seed included, makes the same garden
}
```

- Every dial is a centre and a spread; a spread of zero needs its `reason`. Each neuron draws its own value of each, seeded per neuron and build.
- `morphology`: one of the 20 (`garden.morphologies()`).
- `lands`: `'body'`, `'dendrites'`, `'tuft'`, `{ band: [lo, hi] }` (µm of path from the soma), or `{ compartment: i }` (a group of one). `store`: a fraction of the receiving group's passive conductance. `class`: one of the sourced classes (`garden.classes()`).
- `lacking`: what a receiving neuron whose tree lacks the zone (no tuft, or no compartment in the band) takes: `'none'` (unsaid), none of the connection's synapses; or `'nearest'`, its count on the part of its tree nearest the zone: for a tuft, the far end of its apical dendrite (the trunk's compartment farthest from the soma); for a band, the band moved along the path distance just far enough to reach the tree's nearest compartment, its width kept. Taken on any landing; it matters for a tuft or a band. `garden.settings()` carries it where it is `'nearest'`. `garden.connection(key).lacking` names the neurons that lack the zone.
- `count`: each receiving neuron that takes the connection gets its count, however few neurons the sending group has: its senders give their class's contacts in turn, and where they run out before the count is met they go round again, each pair giving more.
- `route` and `share`: how a connection's axons run between two groups. `'direct'` (unsaid): each axon straight on its own from its soma to where its branches begin, its delay that path's. `'tract'`: the connection's axons gathered into one bundle around the middle of their way, each delay following its path through it. `'drawn'` (Tract, drawn only): the bundle drawn as Tract would grow it, every delay each axon's own straight path's. `share`, 0 to 1, stated with a tract route: the share of each axon's way, measured along the straight way it would take on its own, that it spends in the tract (it keeps to that way for the first and last (1 − share)/2 of it, and curves into the bundle and out of it); at 0 the axons run as Direct's, at 1 each goes from its soma straight into the bundle and from the bundle's end straight to its branches. The bundle runs in the gap between the two groups (from the sending group's front-most soma to the rear-most place its axons begin branching, along the line between their centres), grown along an arc lifted a fifth of the gap at its middle, with two gentle bends, from the build's seed and the connection's key, its axons twisting round one another within max(20, 2.5 √senders) µm of its path and gathering close at its ends; its delays follow that path; where the gap is under 25 µm (the groups mixed, or the arbors beginning among the senders) there is no bundle and the axons run on their own, the route kept. A group's own connection has none. `garden.settings()` carries `route` and `share` where they are said, so a build from them makes the same garden; a build is not refused for a tract route with no gap (the bundle follows the gap: below).
- A build is refused, with the reason, where a group's or connection's settings are; where no receiving neuron can take a connection (no tree has its zone, or, taking the nearest part, none has one: an aspiny tree has no apical dendrite to hold a tuft's), naming it; or where a neuron has no senders to meet its count (a group of one's own connection).
- **Regions** (§3.7). A group in no region gets a ball of its own, named by its key, where the fields before regions put it: a group's `at` (units of 25 µm), the ring the garden's groups stand on, or `row: { gap }` (the balls along x, their trees `gap` units apart); the groups naming one `volume` one ball, mixed. A group's `trunks` go to its region's entry for it; its `align` becomes its trunks fixed that way. A region's sizes left unsaid are those the older layout gave its neurons at 82.5 µm between somata (`spacing`, a shorthand, not carried, sizes them at another); a region with no neurons keeps such sizes as working sizes, not carried, and is sized when it first gets some. The older form is still taken: `spacing`, `align` and `layers` as lists of group keys (each layer named by its word and number, each group filling its layer; a ring's `size` its first circle's diameter, as the older form had it). `garden.settings()` gives every region with its place, sizes, seed, layers and its groups' ranges and trunks stated, so a build from them makes the same garden; a group in a region gives none of `at`, `align`, `spacing`, `volume`. A build is refused where two regions would pass through each other, naming both.

### 2.2 Building, by settings or by name

| call | what | returns |
|---|---|---|
| `await garden.build(settings)` | a garden from its settings; `groups: []` an empty garden, its groups added with `addGroup` | `{ neurons, synapses, seed }`, or `{ refused }` |
| `garden.template(morphology, transmitter, o)` | a new group's settings, for `addGroup`: the starting garden's group of the same transmitter (GABA-B: its GABA-A group's), its neurons, tree size, NMDA share and background, with the starting set's leak and channels (a new group starts with channel amounts that fire); its key the first free of A–Z, A1, …; `o`: `{ key, cells }` | a group's settings, or `{ refused }` |
| `await garden.open(name)` | `'starting'` (the page's own), `'channels'` (its three groups, unwired), `'garden10k'` (10,000 neurons; its size is the address's `&cells=`), `'cortex'` (the cortex patch, built through `garden.build` from its settings; §6, "a layered tissue") | as `build`: `{ refused }` where refused |
| `garden.settings()` | the garden's settings as they now stand, every change carried | settings |
| `await garden.regrow()` | the garden again from its settings at a new seed: new trees and wiring, each connection at its fraction as it now stands, each background sized on its new tree | as `build`: `{ refused }` where refused |

A build refused, by `build`, `open`, `regrow`, `load` or the garden menu, leaves the running garden as it was: its settings, its seed, its library, its view and every GPU buffer, running on as before; the status line names the reason. A build asked while another is building is refused. Out of GPU memory as a new garden's buffers are made is not a refusal: the page then holds no garden and says so.

### 2.3 The clock

| call | what |
|---|---|
| `garden.pause(on = true)`, `garden.paused` | pause or play |
| `await garden.run(steps)` | while paused: that many steps (0.5 ms each); `{ ms, step }`. A change of the second or third kind ready while paused has already landed, with no step, or lands before the first of them |
| `garden.speed(v)` | the speed, 0 to 1 (`stepsPerFrame = 0.05 × 480^v`, steps each sixtieth of a second of real time, whatever the display: the garden runs 30 × stepsPerFrame ms a second, 1.5 to 720). The run strip's slider has 17 stops in those words: 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500, 720 ms a second, each `v = ln(ms ÷ 1.5) ÷ ln 480` |
| `garden.clock()` | `{ ms, step, dt }` |
| `garden.timing(o = {})` | the speed as it runs (the readout as numbers, shown in the Stats window now, the run strip's before), over a window of drawn frames: `o.window` s asked (0.5 to 20), or unsaid the readout's own, at least 2 s and 30 frames, up to 20 s, started again by a pause, a Speed change, a change of the view or the Background setting, a change landing or a new garden (`window`, `frames`; `settled` once it is full, Stats' Garden time marked ≈ until then): `runs`, the garden time run each second of real time (ms a second, from the steps actually run, a step begun in slices counted in eighths, fitted by least squares to the garden's progress at each frame that advanced it), against `asked`, what Speed asks (30 × stepsPerFrame; 0 paused), and `behind` (true where `runs` is below 0.97 of `asked` with at least 1 s counted since a pause, a Speed change or a new garden); `stepsPerSecond`, `stepsPerFrame`; `framesPerSecond` and `frameMs`, fitted to the frames the page drew (never from the GPU's reports of work done, which Firefox gives about 100 ms late); `scriptMs`, the frame's own script; `from`, `to`, the window's first and last frames (`performance.now()`'s clock); `garden: { neurons, synapses, canvas }`. `gpu`: where the device gives its timers (`timestamp-query`), `{ given: true, resolutionMs, frames, splitFrames, stepMs, synapsesMs, neuronsMs, steps, synapses, neurons, drawing, total, span, between, parts, ownSpeed, belowResolution }`: the GPU's ms a step, and its ms a frame for the steps, the drawing, each part (`parts`, in the frame's order: lists, axon lists (the axons' lists sorted by their pieces, a compute pass each frame the axons are drawn), dendrites, synapse sprites, bodies, tracts, axon trees, axon runs, axon twigs, spikes, trails, glow down, glow up, composite, raster; `null` where not drawn), from its first pass's start to its last's end (`span`) and between its passes (`between`); `ownSpeed`, the garden ms a second at the GPU's time a step; `beyondMs`, the frame's time not on the GPU. The parts are from one timed frame in 100 ms or so, split into a pass a part; the totals (`steps`, `drawing`, `span`, `between`, which add up on the same frames) from every timed frame. Elsewhere `{ given: false, why }` |
| `await garden.stepsAlone(o = {})` | the steps alone: the garden paused and its drawing off, its steps run in batches of 32 as fast as the page can give them to the GPU, `o.warm` s (2 unsaid, 0 to 120) then `o.seconds` s read (5 unsaid, up to 120), timed by the wall clock between the batches the GPU reported done; `{ stepsPerSecond, runs, wallMsPerStep, steps, batches, inFlight, gpu: { stepMs, synapsesMs, neuronsMs, ownSpeed, beyondMsPerStep } }`. The garden is left paused or running as it was, its drawing on, every step it ran kept |
| `garden.background(v)` | the Background setting, 0 to 1 (a change of the first kind); no argument: its value. At a setting s each neuron's volleys are s times their size at 1, in whole contacts (the nearest, at least one), excitatory and inhibitory alike, and each contact's rate s times its own: its average drive s times its drive at 1, its volleys as often as at 1 until a volley is one contact, less often below. At 0 none; at 1 its group's rates and volley |

A script that measures pauses the garden and runs it with `garden.run`; a running page steps with its frames.

### 2.4 A garden's file: saved and loaded

The garden menu's Save to a file… and Load from a file… do the same as these calls (the first gives the file to the browser as a download: a page opened from `file://` cannot choose the folder; the second reads a file the user picks).

| call | what | returns |
|---|---|---|
| `await garden.save()` | the garden's file, once every change pending has landed or been refused (a paused garden lands its changes only as `garden.run` steps it) | its text, or `{ refused }` where there is no garden |
| `await garden.load(text)` | a garden's file (its text, or the object it parses to) read and checked whole; every change pending landed first; its garden built from its settings as `garden.build` builds it, starting at rest; then its view, camera, speed, acts, windows, brush and the interface's layout set | as `build`, with `ignored` (the names the page passed over) and `defaults` (the parts the file lacks, set at the page's defaults) where there are any; or `{ refused }` naming what is wrong, nothing of the file applied |

The file is JSON, its parts named:

```js
{
  "form": "Dendrite Garden", "number": 1,          // its form and the form's number
  "saved": "2026-11-09T21:14:03.120Z",             // when (not read back)
  "name": "Starting garden",                       // shown on the garden menu's button
  "garden": { … },                                 // garden.settings() as it stood (2.1)
  "view": { "colour": { "soma": "garden", "den": "voltage", … }, "ions": "nak", "channel": "na", "vis": { "bloom": 0.7, "palette": "Reef", "hide": { "ax": true }, … },
            "hidden": ["PV"] },                    // garden.view()'s colours, the Ions colour's option, Channels type, every drawing number, the groups not drawn
  "camera": { "yaw": 1.1, "pitch": 0.2, "dist": 333, "target": [10, 20, 30] },   // garden.frame's
  "speed": 0.6,                                    // garden.speed's
  "acts": { "muted": ["PV"], "lesioned": [["L5", 1]], "currents": [{ "neuron": ["L5", 0], "pA": 250 }] },
  "windows": { "raster": true, "groups": true, "legend": true, "stats": true, "probe": true, "rasterBy": "auto", "rasterRows": 256, "rasterSpan": 2,
               "rasterHide": { "type": [], "group": [] }, "rasterSize": null },   // the information windows (the Windows drawer, the raster's size)
  "brush": { "paints": "excite", "size": 5, "strength": 7, "depth": 0 },          // the brush's drawer
  "graph": { "places": { "L5": [123, 456], … }, "capsules": { "L23>L5": [x, y], … }, "view": { "x": 12, "y": -34, "z": 0.7 },
             "open": ["L23>L5"], "tabs": { "L23": "settings" }, "probes": { "L5": 3 },
             "plots": { "PV": false }, "plotsAll": true },   // the circuit graph: each node by its group's key; its raster and trace switched off, and the graph's switch for all
  "panel": { "shown": true, "tab": "library", "width": 720, "full": false, "allHidden": false,
             "library": { "filter": "", "sections": {}, "ions": {}, "type": "na" }, "view": { "sections": {} }, "space": { "region": null, "dim": true } },
  "probe": ["L23", 2]                              // the Probe window's neuron, or null
}
```

- **A loaded garden** is what `garden.build` of its settings makes, the seed carried: the same neurons, trees, places, synapses and strengths, starting at rest, its clock at 0, running. The axons of every connection made or changed while the saved garden ran are grown again from each tree's own seed, as a build grows them, so their paths differ and some of their delays move: measured on gardens of six to nine neurons a group (161 to 286 synapses), 0 to 5.4 % of a garden's synapses, each by one step of 0.5 ms, at most two; within a connection changed, up to 16 %.
- **Not saved:** the running state (each compartment's voltage, calcium, gates and receptors, each synapse's state, spikes in flight, the clock); the pause; a group touched, the brush's stroke; the selection; the tool in hand; a menu or drawer open; the traced neurons and the spike recorder; the page's address options.
- **Older and newer files.** A file saved by an earlier page may have no Ions option and no plots switches: it loads with every node's raster and trace on and the Ions colour's option the page's, its Calcium colour, where it has one, read as the Ions colour's calcium (as `garden.view` reads it). A part a file lacks, and a name a part lacks, take the page's defaults (as the page opens); a name the page does not know is passed over and named in `ignored`. So an item a later page adds to a part needs no new number. The number changes only when a name a file holds changes its meaning, so that an older page would read it wrong; a file of a number above the page's own is refused.
- **Refused** (each naming what is wrong, nothing applied): text that is not whole JSON (cut short or damaged); not of the form `"Dendrite Garden"`; a form number above the page's own; no `garden` part, or one that is not settings; a part or name of the wrong kind (a colour, palette or tab the page does not have, a camera that is not numbers, a speed outside 0 to 1); a group, neuron or channel type the file names that its garden lacks; the garden's settings refused by `garden.build` (a morphology the page lacks, a channel type a group places that its library lacks, a class, a connection no receiving neuron can take, …), with build's reason, the running garden left as it was (2.2).

## 3. Changes

Every change returns its view: `{ id, kind, of, change, state, refused, ms, step: { call, land }, wrote }`.
- `kind`: 1 within a frame (on the GPU at the next step), 2 the neuron recomputed, 3 structural.
- `state`: `'landed'`; or, for kinds 2 and 3, `'pending'`, `'computing'`, `'ready'` then `'landed'`; or `'refused'` with `refused` naming why. A refused change changes nothing.
- `await garden.wait(id)`: resolves once it has landed or been refused. `garden.pending()`: the changes not yet landed; `garden.log()`: every change made.
- A change of the second or third kind is computed while the garden runs and lands at the start of a frame, between two steps (or between two of `garden.run`'s steps), on the settings as they then stand. Changes land one at a time, in the order called.
- While the garden is paused, such a change lands as soon as it is ready, with no step taken.

### 3.1 A group: `garden.setGroup(key, path, o)`

| path | o | kind |
|---|---|---|
| a channel number: `'na.soma.amount'`, `'k.basal.factor'` (a type's amount or profile in a zone), `'na.m.shift'`, `'m.m.speed'` (a gate's) | `{ centre?, spread?, reason? }` | 1; an amount that places a type the garden holds none of, or takes away its last placement, 3 (the GPU carries and computes only the types placed, `garden.placed()`; the change and the GPU's new layout land together) |
| `'nmda'`; the background's `'fE'`, `'fI'`, `'mE'` | `{ centre?, spread?, reason? }` | 1 |
| the calcium (where the library holds a calcium type or a gate reading calcium): `'calcium.tuft.buffer'` (the fast buffers' capacity κ, bound per free), `'calcium.soma.pump'` (the membrane pumps' rate, µm/ms), `'calcium.apical.store'` (the stores' uptake rate, /ms), any zone; a calcium type's amount, `'hva.tuft.amount'`, is a permeability (µm/s); a calcium gate's `'sk.c.shift'` is a factor on the calcium it reads (2 halves its sensitivity) | `{ centre?, spread?, reason? }` | 1: each neuron keeping its place in the spread and its calcium |
| the leak: `'leak.soma.g'`, `'leak.tuft.E'`, … (zones soma, ais, basal, apical, tuft) | `{ centre?, spread?, reason? }` | 2: the reduction rescaled for it, each neuron's state kept |
| `'size'` (tree size: every length scaled, thickness and branching kept), `'thickness'` (branch thickness: every dendritic diameter scaled, the apical trunk included, lengths and branching kept), `'complexity'` (branch complexity: how often branches fork, × the morphology's) | `{ centre?, spread?, reason? }` | 2: each tree grown again, its synapses placed again, its axon grown again, from rest |
| `'morphology'` | its name | 2, as size |
| `'transmitter'` | `'glu'`, `'gabaA'`, `'gabaB'` | 3 |
| `'cells'` | a whole number | 3 (as `groupSize`) |

The tree's dials. A group's settings may leave `thickness` and `complexity` out: each is then 1 with no spread (`{ centre: 1, spread: 0, reason: 'unsaid: …' }`), every tree as its reconstruction is; `garden.settings()` carries them stated. Thickness takes any value above 0 (the Settings slider: 0.25 to 4). Complexity takes 0 to 1.6 (`KT_CX_MAX`, the most at which every tree fits its drawing): below 1 the tree's forks are pruned (each kept or dropped by its own seeded number, a dropped fork losing one daughter's branches), above 1 side branches are added; the stems at the soma and at the tuft are kept, so no zone empties. Turning complexity up only adds branches to the same tree, and turning it down only removes them. A tree that a change leaves without a connection's band takes none of it, or the nearest part (the connection's `lacking`); a change that would leave no receiving neuron able to take a connection is refused, naming it. Each also by `setNeuron`. An example is in §6.

Each neuron keeps its place in the spread. A group's change of a number drops that number from its neurons' own values. Refusals: no such group or number; a value where it has no meaning; a spread of zero without its reason; a morphology on which no receiving neuron could take a connection onto the group (naming the connection); the same morphology or transmitter again.

### 3.2 One neuron: `garden.setNeuron(who, path, value)`

`who`: `[group key, i]` or the neuron's index. `path`: any number of 3.1's but morphology, transmitter and cells (a group's); `value` a number, or `null` for its draw again. The kind is the path's, as in 3.1 (an amount that places a type in the garden for the first time, or takes away its last placement, 3). Its value goes into its group's `own[i]`.

### 3.3 A connection: `garden.setConnection(key, o)`

| o | kind |
|---|---|
| `{ store }` (a fraction of the receiving group's passive conductance), `{ class }`, `{ U, D, F }` (each `{ centre, spread }`), `{ nmda }` (`null`: the receiving neuron's) | 1 |
| `{ lands }` (its synapses placed again, fresh), `{ lacking }` (`'none'` or `'nearest'`: the neurons lacking the zone given none, or their count on the nearest part; the others' synapses kept), `{ count: { centre, spread } }`, `{ speed }` (m/s; every delay again) | 3 |
| `{ route, share }` (either or both): each sender's way from its soma to where its branches begin grown again as the route says (its branches, its synapses' places, conductances and state kept), its delays following; Direct ↔ drawn only changes no delay, only the drawing | 3 |

One call gives either first-kind or structural settings, not both; `route` and `share` are one call, `lands`, `lacking`, `count` and `speed` another. A tract route set (by `setConnection` or `connect`) where the connection's axons have no gap between the groups (under 25 µm) is refused, naming the gap; a later change that takes the gap away (a region moved, a layer resized, a count, a morphology) is not: the connection keeps its route, its bundle follows the gap (none under 25 µm: its axons run on their own, the card saying so) and grows back where the gap does. Refusals: an NMDA share on GABA; a connection no receiving neuron can take (naming it); a neuron with no senders to meet its count (a group of one's own connection); a `lacking` other than `'none'` or `'nearest'`; a store ≤ 0.

### 3.4 Groups, neurons and connections added and removed (kind 3)

| call | what |
|---|---|
| `garden.addGroup(g)` | a group as 2.1 gives one: in a ball of its own beside the garden, clear of the others (or at its `at`, units); with `region` and `layer` (mixed into that layer) or `newLayer` (a layer of its own at that place in the region's list), in that region: the region laid out for it first, a change of its own in the log, then the group added at its sites; a group placing a channel type the garden holds none of: the GPU laid out for its types first, a change of its own before it |
| `garden.removeGroup(key)` | the group and every connection to it and from it; its layer goes when left empty, and its region; else the region is laid out again, a change of its own after it; where it held a type's last placements, the GPU laid out without that type, a change of its own after (so too `groupSize` where the neurons taken away held them by their own values) |
| `garden.groupSize(key, cells)` | neurons added after its last (each its own draw) or taken from its end; its region laid out for the new count, a change of its own before the neurons are added or after they are taken away (every neuron of the region at its site for that count, its axons regrown); a growth refused lays the region out again for the count that stands |
| `garden.connect(c)` | a connection as 2.1 gives one |
| `garden.disconnect(key)` | the connection |

### 3.5 The library

| call | what | kind |
|---|---|---|
| `garden.library()` | the library as it stands | — |
| `garden.setLibrary(lib)` | its numbers edited (the same types and gates) | 1 |
| `garden.libraryChange(o)` | `{ add: type }`, `{ remove: key }`, `{ addGate: key }`, `{ removeGate: [key, gate] }`, `{ set: [key, gate, gate settings] }` (a gate's form) | 3 |

### 3.6 What a change keeps

- A synapse keeps its conductance (nS) whatever changes in the neuron it lands on; its connection then shows its fraction as it now stands (`garden.connection(key).fraction`), which the settings carry.
- A background event keeps its size: each neuron's kept size is its `own[i].bgG` in the settings.
- A recomputed neuron (the leak) keeps its state; a regrown one (size, morphology, its tuft layer, or its tree changed by a placement change) starts from rest, its synapses keeping theirs; a new gate starts at its steady state.

### 3.7 Regions

Every group sits in a region (2.1). Each change here is structural (kind 3), computed while the garden runs and landing between two steps. Its neurons move with their regions: each tree goes where its soma goes (moved, not rebuilt, unless its tuft layer or its region's faces change it: below), so each neuron keeps its state and its synapses theirs; every axon tree from or to a neuron that moves is grown again whole from its own seed, and every delay that follows from a path changes with it (each its path at the fibre speed plus 1 ms). A spike already in flight on a changed axon is read at its new delay from the moment of landing, so it can arrive twice or not at all, as with a fibre speed's change. A move or turn alone moves each soma by exactly its region's translation and turn (a group's fixed trunks keep their direction in the garden); any other change lays the region out again from its settings, and only the neurons whose place or turn comes out different move.

| call | what |
|---|---|
| `garden.setRegion(key, o)` | any of `shape`, `at`, `tilt`, `heading`, `size`, `depth` (its layers in proportion), `bend`, `thickness` (a ring's), `seed`, `inside` (`true` keeps its dendrites inside its first and last faces, below); `spacing` (a shorthand: its sizes and layers as the older layout gave its neurons at that spacing); a new shape keeps its depth and layers, and its size across where both shapes have one (but into or out of a ring), else is sized for its neurons |
| `garden.setLayers(key, list)` | its layers, as many as it has, in order, each `{ name?, thickness? }`: renamed and resized together (the line between two layers moved is one such call, its depth kept); the ranges' ends follow their layers |
| `garden.addLayer(key, o)` | `{ name?, thickness?, index? }` (unsaid: its word and a number; the others' mean thickness; at the far end); the region grows by it |
| `garden.removeLayer(key, layer)` | a layer (by name or index) in which no group's range ends; the ranges passing through it shorten with it |
| `garden.splitLayer(key, layer, o)` | `{ at?, names? }` (unsaid: its middle; its name with a and b); each end in it to the part holding its depth |
| `garden.mergeLayers(key, layer, o)` | the layer with the one after it (the last with the one before), named as the first unless `o.name`; each end in either at the same depth |
| `garden.placeGroup(key, o)` | `{ region, layer }` (fills that layer), `{ region, newLayer }` (a layer of its own at that place in the region's list, as thick as its neurons need at 82.5 µm across the region), `{ region, from, to }` (a range), `{ region }` (the whole region), or `{ own: true, at? }` (a ball of its own, beside the garden unless `at`, µm); its trunks go with it; the layer and region it leaves stay |
| `garden.setRange(key, o)` | a group's range in its region: `{ from, to }`, each `{ layer, at }` or µm along the axis (pinned to the layer holding it: a top end on a boundary to the layer below, a bottom end to the layer above), or `{ layer }` |
| `garden.setTrunks(key, o)` | `{ rule: 'shape' }` along its region's shape (outward from a ball's or shells' centre and a cord's axis; along a slab's, column's or ring's axis; along a band's local normal; turning with the region), `{ rule: 'fixed', tilt, heading }` one direction in the garden's frame, `{ rule: 'any' }`; `lean` (degrees, 0 to 90, unsaid 10) but for any: each trunk drawn uniformly over the cap of that half angle. A rule given anew starts from that rule's own settings; else merged into its own |
| `garden.setTuft(key, layer)` | the layer a group's tufts reach, by name, or `null` (none: each tree as grown); the neuron recomputed (kind 2), each of the group's trees grown again with its trunk fitted (below), its channels and synapses placed again, each synapse keeping its conductance; the group's trunks carry it (`trunks.tuft`). Only for trunks that follow the shape, in a ball, shells, slab, column or band (a cord's and a ring's trunks run across their layers), a morphology with an apical dendrite (the spiny ones), a layer ahead of the group's range (toward the region's first face); `setTrunks` does not set it |
| `garden.arrange(key, seed?)` | the region laid out again at a new seed (unsaid: drawn from its seed and the change) |
| `garden.addRegion(o)` | a region as 2.1 gives one; `groups` (or `layers` as lists of keys) may list groups, moved into it with their trunks, or be left out (an empty region, kept until it is removed); beside the garden, clear of the others, unless `at` |
| `garden.removeRegion(key)` | an empty region |
| `garden.renameRegion(key, name)` | a region's name (`null`: none, "Region" and its key): shown wherever the region is named (the Space tab, the tissue), carried by the settings (`name`), so a build from them keeps it; its key unchanged, as every call names a region by its key; lands at once, not through the queue. Refused where there is no such region, the name is not a word, or another region has it as its key or its name. A region renamed while a change of it computes keeps its new name when that change lands |
| `await garden.preview(call, ...args)` | any of the calls above (`'setRegion'`, `'setLayers'`, `'addLayer'`, `'removeLayer'`, `'splitLayer'`, `'mergeLayers'`, `'placeGroup'`, `'setRange'`, `'setTrunks'`, `'arrange'`, `'addRegion'`, `'removeRegion'` and its arguments) computed and not landed: `{ regions` (each as `regions()` would give it), `moved` (each neuron that would move: `from`, `to`, µm), `delays` (each connection with a synapse regrown: `now` and `after`, each `{ min, mean, max }` ms), `ms }`, or `{ refused }` (the packing judged before any axon grows) |
| `garden.cancel(id)` | a placement change made by one of the placement calls above withdrawn before it lands: taken from the queue while it waits or is ready; while it computes, its state `'cancelling'` and its result dropped when the compute ends; then `'cancelled'` (`wait(id)` resolves with it), nothing in the garden changed. Refused once it has landed, been refused or cancelled, and for any other change (a group's, a connection's, the library's, or a region laid out by `groupSize` or `addGroup`) |

A group's count (`groupSize`, `addGroup` into a region) and its morphology (`setGroup(key, 'morphology', m)`) each lay its region out first, as a change of its own in the log (its somata's sizes and count are what its layout follows from), then the count or the trees; refused past the packing limit, naming the groups. Between the two, for as long as the trees take, a soma that shrinks may overlap a neighbour.

**The layout**. Each group's range is cut into as many slices of equal volume as it has neurons, each neuron taking one; the region's neurons are placed one after another, the largest somata first, each at a place drawn in its slice (its depth by volume, its place across uniform over its region's cross-section there, its soma whole inside the region) where its soma lies farther than the sum of the two radii from every soma placed before it; each soma's radius its reconstruction's (its tree seed's first draw). Where ranges overlap, their neurons mix on the one packing, so a change to one group can move a few of another's next to its own. A soma's centre lies in exactly one layer.

**Packing.** In every stretch between two range ends, the somata's volume over the volume their centres may take (each group's range, its cross-section shrunk by its somata's mean radius, a range thinner than their mean diameter counted as that thick), summed over the groups covering it, is at most 0.25: past it a change is refused, naming the groups. Mouse cortex at about 90,000 neurons a mm³ is 0.05 to 0.17 by the morphologies' own somata.

**Passing through.** Each region's solid is its stated extent: a ball or shells a sphere of its radius, a slab a box, a column or cord a cylinder, a band a box bent round its bend from its outer face to its depth, a ring a flat annulus of its outer diameter, width and thickness. Two regions pass through each other when some point lies more than 0.5 µm inside both (an overlap of more than 1 µm), judged where each ends up, found by a search over boxes of space on the solids' distances (not bounding spheres), so a region may stand as close to another as touching.

**Trees in their regions**. Neither of these is on unless set; unset, every tree grows as its morphology grows it.
- *A group's tuft layer* (`trunks.tuft`, `setTuft`): each neuron's apical trunk is scaled along its own path by one factor, so that its top, where its tuft begins, lies in that layer: at a depth drawn for the neuron between a tenth and three tenths of the layer's thickness in from its far side (the side nearer the soma; from the soma's own depth where the soma lies in the layer), measured as the region's layers are (down a slab or column, in from a ball's or shells' surface, in from a band's outer face). Its obliques leave it at the same fractions of its length, and each oblique's and the tuft's branches grow as they would, carried with the trunk; the tree-size dial scales the rest. A short trunk is stretched as far as it needs (some spiny trunks are 19–51 µm long); a tree whose trunk has no tuft gets its trunk fitted alone. A longer trunk adds membrane, so it lowers a neuron's input resistance, and a shorter one raises it (on the example column, L5's mostly longer trunks took its mean from 272 to 264 MΩ, L2/3's mostly shorter ones from 295 to 297 MΩ, each time constant moving with it); the group shows its own.
- *A region kept inside* (`inside: true`): no dendrite of its neurons grows past its first or last face along its axis (a ball's and shells' surface alone; their inner end is their centre); its sides stay open. A branch that would cross a face turns along it, keeping its length, and its branches go on from there, those heading out along the face, those heading in back in. Every length is kept, so the neurons' numbers (input resistance, time constant, each compartment's) do not change: only where the branches lie.
- *Changes.* A placement change regrows the trees of the neurons whose place in their region's own frame (their place and turn, their tuft layer's bounds, the region's depth or setting) changes and whose group names a tuft layer or whose region keeps inside: each grown again at its new place, its synapses placed again (each keeping its conductance), every axon from or to a neuron that moves or regrows grown again; `wrote.regrown` counts them. A region moved or turned whole regrows none (a group whose trunks are fixed in the garden's frame, in a region kept inside, regrows on a turn). A preview grows no tree. A tuft layer follows its layer when renamed or merged, and goes to the first part of a split one; a group moved to a region without a layer of that name, or given trunks that no longer follow the shape, loses it, and that change's `wrote.dropped` names it.

An example: §6, "trees in their layers".

**Refusals** (each naming what): two regions passing through each other (naming both); a tuft layer for trunks that do not follow the shape, in a cord or a ring, for a morphology with no apical dendrite, not one of the region's layers, or not ahead of the group's range (the group); a trunk that runs within 10° of across its region's axis, or away from its tuft layer, so that no length ends it there (the group and the neuron: a lean past about 40°); a layer removed that a group's tufts reach (the groups); `setTrunks` given a tuft; past the packing limit (the groups); a range leaving no room for its somata at the region's face, or somata that do not fit across it (the group); a layer removed holding a range's end (the groups); a range reversed or outside its region; a band longer than 2π times its bend or whose depth reaches its bend's axis; a ring whose width reaches its centre; a ball given a second layer; a region holding groups removed; a group in no region or in two; trunks with a setting their rule does not take; a spacing (the shorthand) not above 25.95 µm; no such region, layer, group or setting.

## 4. Reads

| call | returns |
|---|---|
| `garden.groups()` | the groups' keys |
| `garden.group(key)` | `{ settings, neurons, region, layer, layers, range, trunks, density, apart, fill, relation, Rin: { mean, lo, hi }, tau: { … }, label, connections: { in, out } }` (input resistance MΩ and time constant ms, results of its leak and trees; its region's key; the layer it fills, or null; the layers its range touches; its range (`from` and `to`, each its layer, place and `um`, and `words`: `'all of L5'`, `'L2/3 to L6'`, `'from the top of L2/3 to 17 % into L6'`); its trunks; its density, neurons a mm³ over its range's volume; `apart`, about how far apart (µm); `fill`, its fullest stretch's share of the packing limit; how it stands to the others: `'L23 above; mixed with PV over 284 µm'`, `'apart: alone in its region'`) |
| `garden.regions()` | every region: its settings (2.1; a working size, worked out while it holds no neurons, with `sizeFree`), `depth`, `neurons`, `word` (its layers' word: layer, shell, segment, ring), `layers` (each `{ name, thickness, share, from, to, groups, neurons }`: its extent along its axis in µm from its first face; its groups, each `{ key, part }`, `part` where its range covers only part of the layer; the neurons whose centres lie in it), `groups` (each as `group(key)` gives its range, trunks, density, apart, fill and relation), `solid` (in its own frame: `{ kind: 'sphere', r }`, `{ kind: 'box', hx, hz, y0, y1 }`, `{ kind: 'cyl', r, y0, y1 }`, `{ kind: 'band', rIn, rOut, phi, hz, cy }` (about an axis parallel to z through `[0, cy, 0]`, the half angle `phi` about +y), `{ kind: 'annulus', rIn, rOut, hy }`), `frame` (`at` and its own `x`, `y` (the axis) and `z` in the garden), `box` (`{ lo, hi }` in the garden), `centre`; all µm |
| `garden.region(key)` | one region as `regions()` gives it, with `relations`: each of its groups' standing (as `group(key).relation`) |
| `await garden.rates(ms = 500)` | each group's rate (Hz) over the next `ms` |
| `garden.record(on = true, o = {})` | the spike recorder held on (it keeps the last 2 s) or let go, by a holder: `o.by`, a name, `'script'` unsaid; the recorder runs while anything holds it. The interface holds it as `'graph'` while a node of the circuit graph shows its raster, and lets it go when none does. Returns `{ on, keep, holders }`, the holders as they then stand: a script's `record(false)` lets go of the script's hold alone, so while the graph holds the recorder it answers `{ on: true, …, holders: ['graph'] }` and the recorder keeps running. `record(false, { by: 'mine' })` lets go of nothing a script holds and reads the holders |
| `await garden.spikes(ms = 1000, o = {})` | over the last `ms` recorded: each group's `{ neurons, spikes, rate }`, each neuron's spike times (`'A[0]': [ms, …]`, each at its step); the recorder held by `'script'`, and `ms` waited (paused: run), if it was off. `o.groups`: a list of group keys, those groups' alone (a key the garden lacks refused, naming the groups) |
| `await garden.neuron(who)` | each compartment's voltage, its calcium (µM, where the garden carries calcium, a calcium type placed; a calcium type's entry gives its permeability `P`, µm³/s, and its GHK current), AMPA, NMDA, GABA-A, GABA-B (nS), GABA-B transmitter, background drive, each gate's value, each channel's conductance, open share and current (pA, outward positive); the axon start's; its synapses (ready share, release fraction, nS, U, D, F); its background at the setting (`background: { setting, rates: { E, I }, volley: { E, I } }`: each contact's rate, Hz, and each volley's contacts, 0 where none); its input resistance, time constant, own values, record |
| `await garden.trace(who, ms = 200, o)` | each step's lowest and highest soma voltage (and, where the garden carries calcium, a calcium type placed, its soma calcium and its highest calcium over its compartments, µM, at the step's end: the `columns` name them) (a spike at full height) over the next `ms`, stepping a paused garden; with `o.wait === false`, the last `ms` (at most 256) already recorded, without stepping. Up to 32 neurons are traced at once, each from the first call for it; a 33rd takes the slot read longest ago |
| `garden.placed()` | `{ types, calcium }`: the channel types the garden places, in the library's order, which the GPU carries and computes, and whether it carries calcium (a calcium type among them). The library (`garden.library()`) holds every type; placing one the garden holds none of is structural |
| `garden.morphologies()` | the 20 morphologies: `{ name, how, spiny, apical }` |
| `garden.classes()` | the sourced synapse classes: `{ key, name, U, D, F }`, each a centre and a spread (D and F in ms) |
| `garden.look(key)` | a group's colour (the Groups lens's and the raster's), transmitter, neurons, and how many of its trees have each zone: `{ soma, ais, basal, apical, tuft }` (a tree lacking a connection's zone takes none of it, or the nearest part, as the connection's `lacking` says) |
| `garden.pick(x, y)` | the neuron drawn under a point of the page (CSS pixels), `{ key, i, n }`, or `null` |
| `garden.project(points)` | each garden point (`[x, y, z]`, µm) as the tissue was drawn in the last frame: `[x, y]` in CSS pixels of the page, or `null` behind the camera. Without the View's Explode, which draws each neuron off its place |
| `garden.places(key)` | each neuron of a group as the page holds it: `{ i, at, up, quat }`, its soma's place (µm), its trunk's direction and its turn (a quaternion, x y z w) |
| `garden.stats()` | `{ neurons, synapses, rate, plateaus, ms }`: the mean rate (Hz a neuron) and the NMDA plateaus a second (a dendritic compartment above −30 mV for 5.5 ms with its NMDA current larger than its AMPA current) over the last read-out, about every 250 ms while it runs; `null` before one |
| `await garden.connection(key)` | its settings, `fraction`, `storeNS` (each synapse's nS), `gRef` (the receiving group's passive conductance), every synapse (from, to, compartment, nS, U, D, F, ready, release, delay, path) and its delays; `route`: `{ route, share, gap (µm, between its senders and where their axons begin branching; under 25 none), bundle (its axons run in one), own, tract }`, where they run in a bundle `own` and `tract` each `{ lo, hi, mean }` ms, the delays each synapse's path gives on its own and through the bundle (in Tract the first is what Direct would give, in Tract, drawn only the second is what the bundle would give) |

## 5. The dock and the drawing

| call | what |
|---|---|
| `garden.touch(key, on = true)`, `garden.touch(null)`, `garden.touched()` | glutamate on every dendrite of a group's neurons, held (keys 1–9, each key held its own group, several at once): `touch(key)` touches a group (or each of a list of keys) beside those already touched; `touch(key, false)` lets go of it alone; `touch(null)` lets go of every one; `touched()` the groups touched now, in the order touched. Returns `{ group, touched, amount }` (`null` for `touch(null)`). Refused (`{ refused }`, nothing changed) where a key names no group. The group bars mark every group touched |
| `garden.brush({ at, size, strength, depth, mode })`, `garden.brush(null)` | the brush at a place (`[x, y, z]`, a neuron, or a point of the page `{ x, y }`: one radius behind the first neuron drawn under it plus `depth` along the ray, as the dock's brush places it), Excite (`'excite'`: AMPA with NMDA events on the dendrites in the ball) or Inhibit (`'inhibit'`: GABA-A on every compartment); events of a fixed conductance at the brush's rate |
| `garden.lesion(who, on = true)`, `garden.lesioned()` | a neuron silenced (held at its leak reversal, receiving and sending nothing) or revived; `lesioned()` the neurons lesioned one by one, each `[group key, i]` (a muted group's neurons are `muted()`'s, not listed) |
| `garden.inject(who, pA)`, `garden.injected()` | a steady current into a neuron's soma (pA, positive depolarises; `0`: none), held until set again: a test input, not a dial. Kept through every change to the neuron; a neuron added, and every neuron of a garden built or regrown, starts with none; the settings do not carry it (a garden's file does, 2.4). `injected()` the neurons with one |
| `garden.rename(key, name)` | a group's name (`null`: none): shown wherever the group is named (its node, the raster, the bars, the cards), carried by the settings (`name`), so a build from them keeps it; its key unchanged, as every call and connection names a group by its key; refused where another group has the name as its key or its name |
| `garden.mute(key, on = true)`, `garden.muted()` | a group muted: every neuron of it silenced as Lesion silences one, or revived (a neuron lesioned on its own is revived with it); a neuron added to a muted group is muted; `muted()` the groups muted |
| `garden.view({ lens, colour, ions, channel, vis, groups, select })` | the colour lens of every part (`'garden'`, `'types'`, `'voltage'`, `'inhib'`), each part's colour (`colour: { den: 'ions' }`; also `'background'`, `'chan'`, `'ready'`), the Ions colour's option (`ions: 'nak'`, sodium and potassium together, unsaid; `'na'`, sodium alone; `'k'`, potassium alone; `'ca'`, the calcium inside the cell, the Calcium colour; any other refused, naming them; the colour `'calcium'`, its own colour before is taken as `'ions'` with the option `'ca'` and read back so), the Channels colour's type (now written to the GPU when set, so that the kernel records that type's current), any drawing number (`vis: { bloom: 0.5 }`; `inhGain`, the Inhibition part's strength, 0 to 2, 1 unsaid: the blue shade of inhibition over the dendrites and cell bodies in every colour, 0 none, and `hide: { inh: true }` the same as 0 (the Inhibition lens and the dendrites' Background colour keep their own blue); the axons' glow after a spike, `apGlow` its strength, 0 none, and `apFade` its fade in ms, View → Spikes); the colour scales among them: `gZero` the voltage drawn as rest and `vStep` its mV a step (the Voltage colour runs from `gZero − 1.2·vStep`, deepest blue, to `gZero + 2.6·vStep`, white), `ionGain` and `chanGain` the Ions' and Channels' brightness scales (×), the Garden colour's palette (`vis: { palette: 'Reef' }`: Nebula, Lagoon, Ember, Abyss, Opal, Aurora, Reef, Firefly, Confocal, Dusk, Glacier, Moss, Golgi, Nissl; any other name refused), the groups drawn (`groups: { A: false }`), the group outlined in the tissue (`select: key`, `null` none: a dashed ring around its neurons as drawn, its key above; or a list of keys, each group its own ring); returns them as they stand, with `ions` |
| `garden.frame(key or who)`, `garden.frame({ yaw, pitch, dist, target })` | the camera on a group or a neuron, or as given. A build frames the camera on its garden (a garden of no neurons on the origin); a garden's first neurons, as they land in a garden that had none, frame it on them; any other change leaves the camera where it is |

The touch, the brush, Lesion and mute are acts, not settings: a build from the settings does not keep them. A garden's file keeps the groups muted, the neurons lesioned and the test currents beside the settings, and its load sets them again (2.4); the touch and the brush's stroke it does not keep.

## 6. Examples

Each runs as written, evaluated in the page (1).

**A layered tissue: the cortex patch.** A garden built from published sources (Billeh and colleagues, 2020, and the Allen Institute's Synaptic Physiology dataset; the manual's list of sources), through these calls alone. Its settings (`garden.settings()` once it is open) show the steps: one region (a column 150 µm across, its layers L1 117, L2/3 220, L4 120, L5 227, L6 220 µm, `inside: true`); a group for each cell class, each filling its layer (`{ key, layer }`), its count the class's cells per area of cortex × the column's area, its trunks following the shape and the pyramidal groups' tufts in L1 (`trunks: { rule: 'shape', lean: 10, tuft: 'L1' }`); a connection for each pair of classes the source connects, its count per receiving neuron its probability (averaged over the column) × the sending group's neurons × its class's contacts a pair, its landing where the source puts that class's synapses (`'body'`, `'dendrites'`, a band of path distance with `lacking: 'nearest'`), its store fitted to the source's unitary PSP. A count is whole synapses, so a connection whose mean falls under 0.5 a neuron vanishes; real L4 density sits near the packing limit, so the column cannot be much narrower.

```js
// the cortex patch opened; its layers, each group's layer, count and density; one connection's count and landing; L4's pyramidal
// cells touched for 100 ms and each group's rate read
(async () => {
  const g = window.garden;
  const r = await g.open('cortex');                                  // { neurons: 1827, synapses: …, seed: 15 }
  g.pause();
  const layers = g.region('V1').layers.map(l => [l.name, l.thickness, l.neurons]);
  const groups = g.groups().map(k => { const q = g.group(k); return [k, q.neurons, q.layer, Math.round(q.density)]; });
  const c = g.settings().connections.find(x => x.key === 'E23>PV23');  // { count: { centre: 656, spread: 85 }, class: 'eFS', lands: 'dendrites', … }
  g.touch('E4'); await g.run(200); g.touch(null);
  const s = await g.spikes(100);
  return JSON.stringify({ r, layers, groups, E23toPV23: [c.count, c.class, c.lands], rates: Object.fromEntries(Object.entries(s.groups).map(([k, x]) => [k, x.rate])) });
})()
```

```js
// routes: the starting garden's L23 → L5 in a tract for 60 % of each axon's way, then 100 %, then drawn only; each
// landing between two steps; its delays through the bundle and on their own; drawn only giving Direct's delays again
(async () => {
  const g = window.garden; g.pause();
  const ms = async () => { const r = await g.connection('L23>L5'); return { route: r.route, delays: r.delays }; };
  const direct = await ms();
  const a = g.setConnection('L23>L5', { route: 'tract', share: 0.6 }); await g.run(4); await g.wait(a.id);
  const tract = await ms();                                                   // route.bundle true, route.gap its gap (µm); delays longer by the detour, the bundle's arc and its twist
  const b = g.setConnection('L23>L5', { share: 1 }); await g.run(4); await g.wait(b.id);
  const c = g.setConnection('L23>L5', { route: 'drawn' }); await g.run(4); await g.wait(c.id);
  const drawn = await ms();                                                   // the delays Direct's again; route.tract what the bundle would give
  const d = g.connect({ from: 'L5', to: 'L5', lands: 'body', count: { centre: 2, spread: 0 }, store: 1, class: 'eeDep', route: 'tract', share: 0.5 });   // refused: a group's own connection has no route
  await g.run(2);
  return JSON.stringify({ direct, tract, drawn, refused: (await g.wait(d.id)).refused, settings: g.settings().connections.find(x => x.key === 'L23>L5') });
})()
```

```js
// regions: L2/3 in a layer above L5 in a column, a preview of a move and turn, the move landed, a refusal
(async () => {
  const g = window.garden; g.pause();
  const a = g.setRegion('L5', { shape: 'column' });                           // kind 3: L5's ball becomes a column
  const b = g.placeGroup('L23', { region: 'L5', newLayer: 0 });              // L2/3 in a layer above L5 (its own region stays, empty)
  await g.run(2); await g.wait(a.id); await g.wait(b.id);
  const p = await g.preview('setRegion', 'L5', { at: [-600, 200, 0], tilt: 20, heading: 30 });   // nothing landed
  const c = g.setRegion('L5', { at: [-600, 200, 0], tilt: 20, heading: 30 });
  const d = g.setRegion('PV', { at: [-600, 200, 0] });                        // refused: PV would pass through L5
  await g.run(2);
  return JSON.stringify({ relation: g.group('L23').relation, delays: p.delays, moved: (await g.wait(c.id)).state, refused: (await g.wait(d.id)).refused, regions: g.regions().map(r => [r.key, r.shape, r.layers.map(l => l.groups.map(x => x.key))]) });
})()
```

```js
// layers and ranges: the starting garden's three groups in one cortex column (L1 empty), PV from the top of L2/3 to the bottom
// of L6; a preview of L2/3 thickened into L4, then landed; a group's trunks fixed; a count past the packing limit refused
(async () => {
  const g = window.garden; g.pause();
  const a = g.addRegion({ key: 'cortex', shape: 'column', at: [0, 600, 900], size: 300, layers: [{ name: 'L1', thickness: 100 }, { name: 'L2/3', thickness: 250 }, { name: 'L4', thickness: 150 }, { name: 'L5', thickness: 250 }, { name: 'L6', thickness: 250 }],
    groups: [{ key: 'L23', layer: 'L2/3' }, { key: 'L5', layer: 'L5' }, { key: 'PV', from: { layer: 'L2/3', at: 0 }, to: { layer: 'L6', at: 1 } }] });
  await g.run(2); await g.wait(a.id);
  const p = await g.preview('setLayers', 'cortex', [{}, { thickness: 350 }, { thickness: 50 }, {}, {}]);   // nothing landed
  const b = g.setLayers('cortex', [{}, { thickness: 350 }, { thickness: 50 }, {}, {}]);
  const c = g.setTrunks('L5', { rule: 'fixed', tilt: 20, heading: 0, lean: 5 });
  const d = g.groupSize('L23', 100000);                                       // refused: past the packing limit
  await g.run(2);
  return JSON.stringify({ moved: p.moved.length, resized: (await g.wait(b.id)).state, trunks: (await g.wait(c.id)).state, refused: (await g.wait(d.id)).refused, L23: g.group('L23').range.words, PV: g.group('PV').relation, layers: g.region('cortex').layers.map(l => [l.name, l.thickness, l.groups.map(x => x.key + (x.part ? ' (part)' : ''))]) });
})()
```

```js
// trees in their layers: the starting garden's groups in a column kept inside, L23's and L5's tufts in L1; L2/3 thickened
// while it runs; L23's tuft layer taken away (kind 2); a tuft layer for an aspiny group refused
(async () => {
  const g = window.garden; g.pause();
  const tr = k => ({ ...g.group(k).trunks, tuft: 'L1' });
  const a = g.addRegion({ key: 'cortex', name: 'Cortex', shape: 'column', at: [0, 600, 900], size: 300, inside: true,
    layers: [{ name: 'L1', thickness: 100 }, { name: 'L2/3', thickness: 250 }, { name: 'L4', thickness: 150 }, { name: 'L5', thickness: 250 }, { name: 'L6', thickness: 250 }],
    groups: [{ key: 'L23', layer: 'L2/3', trunks: tr('L23') }, { key: 'L5', layer: 'L5', trunks: tr('L5') }, { key: 'PV', from: { layer: 'L2/3', at: 0 }, to: { layer: 'L6', at: 1 } }] });
  await g.run(2); const A = await g.wait(a.id);
  const b = g.setLayers('cortex', [{}, { thickness: 300 }, { thickness: 100 }, {}, {}]);   // L23's neurons move and regrow
  const c = g.setTuft('L23', null);                                                   // kind 2: L23's trees as grown
  const d = g.setTuft('PV', 'L1');                                                    // refused: no apical dendrite
  await g.run(2);
  const B = await g.wait(b.id), C = await g.wait(c.id), D = await g.wait(d.id);
  return JSON.stringify({ added: [A.state, A.wrote.regrown], resized: [B.state, B.wrote.regrown], tuftOff: [C.kind, C.state], refused: D.refused, inside: g.region('cortex').inside, L5: g.group('L5').trunks, Rin: g.groups().map(k => [k, +g.group(k).Rin.mean.toFixed(1)]) });
})()
```

```js
// the Space tab's and the Move tool's calls: a region's centre drawn on the page, a move previewed, two moves of which the
// first is withdrawn, each neuron's place after the second lands
(async () => {
  const g = window.garden; g.pause();
  const R = g.region('L5'), at = R.frame.at;
  const onPage = g.project([R.centre])[0];                                    // [x, y] CSS pixels, or null behind the camera
  const p = await g.preview('setRegion', 'L5', { at: [at[0], at[1] + 100, at[2]] });   // R.frame, R.layers among p.regions'
  const a = g.setRegion('L5', { at: [at[0], at[1] + 100, at[2]] });
  const b = g.setRegion('L5', { at: [at[0], at[1] + 150, at[2]] });
  const c = g.cancel(a.id);                                                   // the first withdrawn: only the second lands
  await g.run(2);
  return JSON.stringify({ onPage, delays: p.delays, a: (await g.wait(a.id)).state, b: (await g.wait(b.id)).state, cancelled: c.state, at: g.region('L5').at, first: g.places('L5')[0] });
})()
```

```js
// a region's name: given, refused where it is another region's name or key, taken away; the settings carry it
(() => {
  const g = window.garden, [A, B] = g.regions().map(R => R.key);
  const a = g.renameRegion(A, 'Cortex');                 // { region, name }: lands at once
  const b = g.renameRegion(B, 'Cortex');                 // refused: the name is region A's
  const c = g.renameRegion(B, A);                        // refused: the name is region A's key
  const named = g.settings().regions.map(R => R.name || null);
  const d = g.renameRegion(A, null);                     // taken away: "Region" and its key
  return JSON.stringify({ a, b: b.refused, c: c.refused, named, d, after: g.region(A).name || null });
})()
```

```js
// build a garden of two groups and one connection, run it 1 s paused, read each group's rate
(async () => {
  const g = window.garden;
  const S = g.settings();                       // the starting garden's, as a template
  const r = await g.build({ groups: S.groups.slice(0, 2), connections: [{ from: S.groups[1].key, to: S.groups[0].key, lands: 'dendrites', count: { centre: 6, spread: 2 }, store: 1.5, class: 'eeDep' }], background: 0.25, seed: 7 });
  g.pause(); await g.run(2000);
  return JSON.stringify({ r, spikes: (await g.spikes(500)).groups });
})()
```

```js
// a garden saved to its file's text and loaded again: the view changed and a group muted first; the settings, the colour and the
// mute read back after the load, the clock started again; a file of a newer form refused, nothing changed
(async () => {
  const g = window.garden; g.pause();
  g.view({ colour: { den: 'voltage', soma: 'voltage' }, vis: { bloom: 0.5 } }); g.mute('PV');
  const text = await g.save();                                                // the file's text (JSON)
  const r = await g.load(text);                                                // { neurons: 18, synapses: …, seed: … }
  const same = JSON.stringify(JSON.parse(text).garden) === JSON.stringify(g.settings());   // true
  const bad = await g.load(text.replace('"number": 1,', '"number": 99,'));    // refused: written in form 99, by a newer page
  return JSON.stringify({ r, same, den: g.view().colour.den, muted: g.muted(), clock: g.clock().step < 100, refused: bad.refused, still: JSON.stringify(g.settings()) === JSON.stringify(JSON.parse(text).garden) });
})()
```

```js
// a change of each kind, each awaited
(async () => {
  const g = window.garden; g.pause();
  const a = g.setGroup('L5', 'na.soma.amount', { centre: 100 });            // kind 1: landed
  const b = g.setGroup('L5', 'leak.soma.g', { centre: 0.06 });              // kind 2: pending
  const c = g.connect({ from: 'PV', to: 'PV', lands: 'body', count: { centre: 4, spread: 1 }, store: 1, class: 'iDep' });   // kind 3
  await g.run(4);
  return JSON.stringify([a.state, (await g.wait(b.id)).state, (await g.wait(c.id)).state, (await g.connection('PV>PV')).synapses.length]);
})()
```

```js
// a refusal: a connection onto a tuft no receiving tree has (PV's trees are aspiny: no tuft, and no apical dendrite for the nearest part)
(async () => {
  const g = window.garden; g.pause();
  const r = g.connect({ from: 'L23', to: 'PV', lands: 'tuft', count: { centre: 4, spread: 1 }, store: 1, class: 'eFS' });
  await g.run(2);
  return JSON.stringify(await g.wait(r.id));    // state 'refused', naming the connection: none of its 6 receiving neurons can take it
})()
```

```js
// L5 grown to 91, a tuft connection onto it taking the nearest part; the neurons lacking a tuft, named; then taking none
(async () => {
  const g = window.garden; g.pause();
  const a = g.groupSize('L5', 91); await g.run(2); await g.wait(a.id);
  const b = g.connect({ from: 'L23', to: 'L5', key: 'tuft', lands: 'tuft', lacking: 'nearest', count: { centre: 8, spread: 2 }, store: 1.5, class: 'eeDep' });
  await g.run(2); await g.wait(b.id);
  const near = await g.connection('tuft');      // lacking: { zone: 'the tuft', takes: 'nearest', of: 91, neurons: ['L5[…]', …] }
  const c = g.setConnection('tuft', { lacking: 'none' }); await g.run(2); await g.wait(c.id);
  return JSON.stringify({ lacking: near.lacking, synapses: [near.synapses.length, (await g.connection('tuft')).synapses.length] });
})()
```

```js
// two groups touched at once (as keys 1 and 2 held together), then let go one at a time; a key naming no group refused
(() => {
  const g = window.garden;
  const a = g.touch('L23'), b = g.touch('L5');       // b.touched: ['L23', 'L5']
  const c = g.touch('L23', false);                     // c.touched: ['L5']: L5 still touched
  const d = g.touch('nowhere');                        // { refused: 'no group nowhere' }; L5 still touched
  const e = g.touched();                               // ['L5']
  g.touch(null);                                       // every group let go
  return JSON.stringify({ b: b.touched, c: c.touched, refused: d.refused, e, after: g.touched() });
})()
```

```js
// the tree's dials: a group's branch thickness, one neuron's branch complexity, each awaited; a complexity past its top refused
(async () => {
  const g = window.garden; g.pause();
  const a = g.setGroup('L5', 'thickness', { centre: 1.5, spread: 0.1 });   // kind 2: each tree regrown, from rest
  const b = g.setNeuron(['L5', 0], 'complexity', 0.5);                      // one neuron's own value
  const c = g.setGroup('L5', 'complexity', { centre: 1.5, spread: 0.2 });  // refused: reaches 1.7, past its top 1.6
  await g.run(2);
  return JSON.stringify([(await g.wait(a.id)).state, (await g.wait(b.id)).state, c.state, g.group('L5').settings.dials, (await g.neuron(['L5', 0])).complexity]);
})()
```

### The calcium

The try-out's L5 with HVA and SK: its calcium read as a train of spikes runs and stops, a dial moved, and SK made less sensitive (a gate reading calcium is shifted by a factor on its calcium).

```js
(async () => {
  const g = window.garden;
  await g.build({ groups: [{ key: 'L5', morphology: 'spiny L5', transmitter: 'glu', cells: 2,
    dials: { size: { centre: 1, spread: 0.1 }, nmda: { centre: 0.5, spread: 0 , reason: 'one share' } },
    background: { fE: { centre: 0, spread: 0, reason: 'quiet' }, fI: { centre: 0, spread: 0, reason: 'quiet' }, mE: { centre: 1, spread: 0, reason: 'quiet' } },
    channels: { hva: { soma: { amount: { centre: 13, spread: 1.3 } }, apical: { amount: { centre: 5.2, spread: 0.5 } }, tuft: { amount: { centre: 6.5, spread: 0.6 } } },
                hvaR: { soma: { amount: { centre: 7, spread: 0.7 } }, tuft: { amount: { centre: 3.5, spread: 0.3 } } },
                sk: { soma: { amount: { centre: 10, spread: 1 } } } } }], background: 0, seed: 4 });
  g.pause(true); g.inject(['L5', 0], 400);
  const t = await g.trace(['L5', 0], 300);                   // rows: ms, lowest and highest mV, soma calcium, highest calcium (µM)
  g.inject(['L5', 0], 0); await g.run(400);
  const after = (await g.neuron(['L5', 0])).compartments.map(c => c.calcium);   // back toward 0.064 µM
  const a = g.setGroup('L5', 'calcium.soma.buffer', { centre: 250 });            // twice the buffering: less rise, slower clearing
  const b = g.setGroup('L5', 'sk.c.shift', { centre: 3, spread: 0, reason: 'SK three times less sensitive' });
  g.view({ colour: { den: 'ions', soma: 'ions' }, ions: 'ca' });   // the calcium inside (the old { den: 'calcium' } is taken the same)
  const p0 = g.placed();                                    // { types: ['na', 'k', 'm', 'hvaR', 'hva', 'sk'], calcium: true }
  const c = g.setGroup('L5', 'sk.soma.amount', { centre: 0, spread: 0, reason: 'SK taken out' });   // its last placement: kind 3, pending
  await g.run(10);                                           // (paused: a structural change lands as soon as it is ready)
  const p1 = g.placed();                                    // sk gone from the GPU; the library still holds it
  return JSON.stringify([t.columns, t.steps.slice(-3), after.slice(0, 4), a.state, b.state, p0, c.kind, p1]);
})()
```

### The speed as it runs

The garden's speed read as the Stats window shows it (the run strip before), at each setting held long enough to fill the window, then the steps alone with nothing drawn; where the device gives no GPU timers, `gpu` says why and the speeds are counted all the same.

```js
(async () => {
  const g = window.garden, sl = ms => new Promise(q => setTimeout(q, ms)), rows = [];
  for (const [name, v] of [['starting', Math.log(20) / Math.log(480)], ['top', 1]]) {
    g.pause(false); g.speed(v); await sl(10000);                              // held 10 s
    const t = g.timing({ window: 8 });                                         // the last 8 s
    rows.push([name, +t.runs.toFixed(1), +t.asked.toFixed(1), t.behind, +t.framesPerSecond.toFixed(1),
      t.gpu.given ? { steps: +t.gpu.steps.toFixed(2), drawing: +t.gpu.drawing.toFixed(2), twigs: t.gpu.parts['axon twigs'] } : t.gpu.why]);
  }
  const a = await g.stepsAlone({ warm: 5, seconds: 5 });                      // drawing off; left running as it was
  return JSON.stringify({ rows, alone: [+a.stepsPerSecond.toFixed(1), a.gpu.given ? +a.gpu.stepMs.toFixed(4) : null] });
})()
```
