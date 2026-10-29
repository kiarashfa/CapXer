<script lang="ts">
  import { live } from '../../camera/live.svelte.ts';
  import { aids } from '../../analysis/aids.svelte.ts';
  import { PEAK_THRESHOLD, frameInVideo, zebraThreshold } from '../../analysis/levels.ts';
  import type { AidFrame, AidRenderer } from '../../analysis/overlay.ts';
  import { FRAME_COLORS } from '../../setup/presets.ts';
  import type { Box } from '../../overlay/geometry.ts';

  // Exposure aids on the live video: the picture-aid canvas (laid over the
  // video, same box and mirroring) and the histogram sampling of the framed
  // area. Analysis code loads on first use and runs only while Live is showing.

  let { frame, style }: { frame: Box; style: string } = $props();

  type OverlayModule = typeof import('../../analysis/overlay.ts');
  let mod: Promise<OverlayModule> | undefined;
  const load = () => (mod ??= import('../../analysis/overlay.ts'));

  /** Zebra stripe period on screen, in CSS pixels. */
  const STRIPE_CSS = 8;
  let canvas = $state<HTMLCanvasElement>();

  function settings(c: HTMLCanvasElement, hex: (v: string) => [number, number, number]): AidFrame {
    let color: string = FRAME_COLORS[aids.peakColor];
    if (color.startsWith('var(')) color = getComputedStyle(c).getPropertyValue(color.slice(4, -1)).trim();
    return {
      mode: aids.picture === 'zebras' ? 1 : aids.picture === 'falseColour' ? 2 : 0,
      zebra: zebraThreshold(aids.zebra),
      peak: aids.peaking ? PEAK_THRESHOLD[aids.peakSens] : 0,
      peakColor: hex(color),
      stripe: c.clientWidth ? (STRIPE_CSS * c.width) / c.clientWidth : STRIPE_CSS,
    };
  }

  // Picture aids: one draw per new camera frame while any is on.
  $effect(() => {
    const c = canvas;
    const video = live.videoEl;
    if (!c || !video) return;
    let stopped = false;
    let renderer: AidRenderer | null = null;
    let handle = 0;
    const byFrame = 'requestVideoFrameCallback' in video;
    load().then((m) => {
      if (stopped) return;
      try {
        renderer = m.createRenderer(c);
      } catch (e) {
        if (import.meta.env.DEV) console.warn(e);
        renderer = null;
      }
      if (!renderer) {
        aids.gpu = false;
        return;
      }
      aids.gpu = true;
      let last = -Infinity;
      const tick = () => {
        if (stopped) return;
        const now = performance.now();
        if (now - last >= renderer!.interval) {
          last = now;
          renderer!.draw(video, settings(c, m.hexRgb));
        }
        handle = byFrame ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
      };
      tick();
    });
    return () => {
      stopped = true;
      if (byFrame) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
      renderer?.dispose();
    };
  });

  // Histogram of what is inside the frame lines, about ten times a second.
  $effect(() => {
    const video = live.videoEl;
    const region = live.box && frameInVideo(frame, live.box);
    if (!aids.histogram || !live.showing || !video || !region) {
      aids.hist = null;
      return;
    }
    let stopped = false;
    const id = setInterval(async () => {
      const m = await load();
      if (!stopped) aids.hist = m.sampleHistogram(video, region);
    }, 100);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  });
</script>

{#if aids.overlay && live.showing}
  <canvas bind:this={canvas} class="vf-aids" class:mirror={live.facing === 'user'} {style} data-testid="vf-aids" data-mode={aids.picture} data-peaking={aids.peaking}></canvas>
{/if}
