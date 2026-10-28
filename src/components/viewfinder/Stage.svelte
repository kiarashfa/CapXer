<script lang="ts">
  import { vf } from '../../setup/store.svelte.ts';
  import { displaySize } from '../../setup/derive.ts';
  import { FRAME_COLORS, SAFE_AREAS, aspectText } from '../../setup/presets.ts';
  import { toEntry } from '../../setup/focal.ts';
  import { overlayGeometry, type Box } from '../../overlay/geometry.ts';
  import { SCENE, SCENE_HALF_WIDTH, viewBoxFor } from '../../overlay/scene.ts';

  const d = $derived(vf.derived);
  const size = $derived(displaySize(d.area, d.squeeze));
  const box = $derived(viewBoxFor(size.width, size.height, vf.setup.focal));
  const half = $derived(size.width / (2 * vf.setup.focal));
  const ov = $derived(overlayGeometry(d.frameFraction, vf.setup.guides, SAFE_AREAS));
  const aspectLabel = $derived(aspectText(vf.setup.mode, vf.setup.aspect));
  const focalLabel = $derived(`${toEntry(vf.setup.focal, vf.setup.focalEntry, d.crop)} mm${vf.setup.focalEntry === 'equivalent' ? ' FF' : ''}`);
  const label = $derived(
    `${vf.camera.name}, ${vf.format.name}, ${vf.setup.focal} mm lens, ${aspectLabel} frame, ` +
      `${d.fov.horizontal.toFixed(1)} by ${d.fov.vertical.toFixed(1)} degrees`,
  );
  const pct = (b: Box) => `left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`;
</script>

<div
  class="vf-stage grid-paper"
  role="img"
  aria-label={label}
  data-testid="vf-stage"
  style={`aspect-ratio:${size.width} / ${size.height};--frame:${FRAME_COLORS[vf.setup.frameColor]}`}
>
  <svg class="vf-scene" viewBox={box} preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
    {#if half > SCENE_HALF_WIDTH}
      <rect class="outside" x={-half} y="-10" width={half - SCENE_HALF_WIDTH} height="20" />
      <rect class="outside" x={SCENE_HALF_WIDTH} y="-10" width={half - SCENE_HALF_WIDTH} height="20" />
    {/if}
    {#each SCENE.paths as p}<path d={p} />{/each}
    {#each SCENE.circles as c}<ellipse cx={c.cx} cy={c.cy} rx={c.r} ry={c.r} />{/each}
  </svg>
  {#each ov.masks as m}<div class="vf-ov vf-mask" style={`${pct(m)};opacity:${vf.setup.mask}`}></div>{/each}
  <div class="vf-ov vf-frame" style={pct(ov.frame)}></div>
  {#each ov.lines as l}
    <div class="vf-ov vf-line" style={l.x1 === l.x2 ? `left:${l.x1 * 100}%;top:${l.y1 * 100}%;width:1px;height:${(l.y2 - l.y1) * 100}%` : `left:${l.x1 * 100}%;top:${l.y1 * 100}%;height:1px;width:${(l.x2 - l.x1) * 100}%`}></div>
  {/each}
  {#if ov.centre}<div class="vf-ov vf-centre" style={`left:${ov.centre.x * 100}%;top:${ov.centre.y * 100}%`}></div>{/if}
  {#if ov.safe}
    <div class="vf-ov vf-safe" style={pct(ov.safe.action)}></div>
    <div class="vf-ov vf-safe" style={pct(ov.safe.graphics)}></div>
  {/if}
  <span class="vf-tag" style="left:8px">{aspectLabel}</span>
  <span class="vf-tag" style="right:8px">{focalLabel}</span>
</div>
