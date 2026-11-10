# Dendrite Garden

A psychedelic, beauty-first simulator of spiking neurons with living dendrites, running live in the browser.

**Site: https://gsnautilus.github.io/dendrite-garden/**

- [`cortex.html`](https://gsnautilus.github.io/dendrite-garden/cortex.html) — **Cortex Garden**, the main garden: 5,000 to 100,000 Izhikevich neurons, each with up to 31 electrical dendrite compartments (cable diffusion, NMDA plateaus, back-propagating spikes). Synapses form only where an axon passes close to a dendrite, and they learn (short-term plasticity, STDP, consolidation) and rewire. Raw WebGPU, no libraries.
- [`tadpole/`](https://gsnautilus.github.io/dendrite-garden/tadpole/) — **The Tadpole**, a guide to Cortex Garden's 30,000-neuron specimen: groups of neurons with jobs, wired so that swimming, feeding and learning emerge from spikes alone. Labelled renders from every angle and a wiring diagram.
- [`cochlea.html`](https://gsnautilus.github.io/dendrite-garden/cochlea.html) — **Cochlea Garden**: the inner ear as neurons, driven by real audio.
- [`garden.html`](https://gsnautilus.github.io/dendrite-garden/garden.html) — the original **Dendrite Garden** (three.js, CPU), which runs in any browser.

Cortex Garden and Cochlea Garden need WebGPU: a recent Chrome or Edge, or Firefox 141+ on Windows.

## Running locally

Every page is a single HTML file with no build step: open it in a browser. Add `#debug` to a simulator's URL to expose `window.__cg` (deterministic stepping, checksums, profiling).

`tools/` holds the headless test driver (`cdp.mjs`, Chrome DevTools Protocol), the regression tests (`tools/tests/`) and the renderer for the Tadpole guide (`tools/guide/`).
