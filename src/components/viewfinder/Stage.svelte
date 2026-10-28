<script lang="ts">
  import { vf } from '../../setup/store.svelte.ts';
  import { live } from '../../camera/live.svelte.ts';
  import { displaySize } from '../../setup/derive.ts';
  import { FRAME_COLORS, SAFE_AREAS, aspectText } from '../../setup/presets.ts';
  import { toEntry } from '../../setup/focal.ts';
  import { overlayGeometry, type Box } from '../../overlay/geometry.ts';
  import { SCENE, SCENE_HALF_WIDTH, viewBoxFor } from '../../overlay/scene.ts';
  import { t } from '../../i18n/en.ts';

  // The viewfinder: the drawn scene or the live camera, with the frame, mask
  // and guides on top. Both backdrops sit in the same tangent space, so the
  // overlay never changes. Interactive parts (the camera card) sit outside the
  // role="img" element.

  const d = $derived(vf.derived);
  const size = $derived(displaySize(d.area, d.squeeze));
  const box = $derived(viewBoxFor(size.width, size.height, vf.setup.focal));
  const half = $derived(size.width / (2 * vf.setup.focal));
  const ov = $derived(overlayGeometry(d.frameFraction, vf.setup.guides, SAFE_AREAS));
  const aspectLabel = $derived(aspectText(vf.setup.mode, vf.setup.aspect));
  const focalLabel = $derived(`${toEntry(vf.setup.focal, vf.setup.focalEntry, d.crop)} mm${vf.setup.focalEntry === 'equivalent' ? ' FF' : ''}`);
  const label = $derived(
    `${vf.camera.name}, ${vf.format.name}, ${vf.setup.focal} mm lens, ${aspectLabel} frame, ` +
      `${d.fov.horizontal.toFixed(1)} by ${d.fov.vertical.toFixed(1)} degrees` +
      (live.showing ? `, live camera, ${live.modeLabel}` : ''),
  );
  const pct = (b: Box) => `left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`;
  const level = $derived(live.level && live.rollValid && Math.abs(live.roll) < 0.5);
  const card = $derived(live.source === 'live' && !live.showing ? live.status : null);
  const err = $derived(card && card in t.vf.live.errors ? t.vf.live.errors[card as keyof typeof t.vf.live.errors] : null);

  let video = $state<HTMLVideoElement>();

  $effect(() => {
    if (!video) return;
    video.srcObject = live.stream;
    live.videoEl = video;
    return () => (live.videoEl = null);
  });

  // Ask the camera for the zoom the plan wants (only where it has zoom), a moment after the user stops changing things.
  $effect(() => {
    const target = live.plan?.camera;
    const zoom = live.caps.zoom;
    if (!zoom || target === undefined || Math.abs(target - live.appliedZoom) < Math.max(zoom.step ?? 0, 0.01)) return;
    const id = setTimeout(() => live.zoom(target), 120);
    return () => clearTimeout(id);
  });

  const onsize = () => {
    if (video?.videoWidth) live.video = { width: video.videoWidth, height: video.videoHeight };
  };
</script>

<div class="vf-stagebox" data-live={live.showing || undefined}>
  <div
    class="vf-stage grid-paper"
    class:live={live.showing}
    role="img"
    aria-label={label}
    data-testid="vf-stage"
    style={`aspect-ratio:${size.width} / ${size.height};--frame:${FRAME_COLORS[vf.setup.frameColor]}`}
  >
    {#if !live.showing}
      <svg class="vf-scene" class:dim={card} viewBox={box} preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
        {#if half > SCENE_HALF_WIDTH}
          <rect class="outside" x={-half} y="-10" width={half - SCENE_HALF_WIDTH} height="20" />
          <rect class="outside" x={SCENE_HALF_WIDTH} y="-10" width={half - SCENE_HALF_WIDTH} height="20" />
        {/if}
        {#each SCENE.paths as p}<path d={p} />{/each}
        {#each SCENE.circles as c}<ellipse cx={c.cx} cy={c.cy} rx={c.r} ry={c.r} />{/each}
      </svg>
    {/if}
    {#if live.stream}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={video}
        class="vf-video"
        class:mirror={live.facing === 'user'}
        style={live.box ? pct(live.box) : 'opacity:0'}
        autoplay
        muted
        playsinline
        data-testid="vf-video"
        onloadedmetadata={onsize}
        onresize={onsize}
      ></video>
    {/if}
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
    {#if live.level}
      {#if live.rollValid}
        <div class="vf-ov vf-level" class:ok={level} style={`transform:translate(-50%,-50%) rotate(${-live.roll}deg)`}></div>
        <span class="vf-tag vf-level-tag vf-num" class:ok={level}>{level ? t.vf.live.levelOk : `${live.roll > 0 ? '+' : ''}${live.roll.toFixed(1)}°`}</span>
      {:else}
        <span class="vf-tag vf-level-tag">{t.vf.live.levelFlat}</span>
      {/if}
    {/if}
    <span class="vf-tag" style="left:8px">{aspectLabel}</span>
    <span class="vf-tag" style="right:8px">{focalLabel}</span>
    {#if live.showing && live.modeLabel}<span class="vf-tag vf-mode" data-testid="vf-mode" data-mode={live.plan?.mode}>{live.modeLabel}</span>{/if}
  </div>

  {#if card}
    <div class="vf-card" role="status" data-testid="vf-live-card" data-status={card}>
      {#if card === 'off'}
        <b>{t.vf.live.intro.title}</b>
        <p>{t.vf.live.intro.body}</p>
        <div class="vf-card-actions">
          <button type="button" class="btn btn-primary" onclick={() => live.start()}>{t.vf.live.intro.start}</button>
          <button type="button" class="btn btn-secondary" onclick={() => live.stop()}>{t.vf.live.backToScene}</button>
        </div>
      {:else if card === 'asking'}
        <p>{t.vf.live.asking}</p>
      {:else if card === 'paused'}
        <p>{t.vf.live.paused}</p>
        <div class="vf-card-actions"><button type="button" class="btn btn-primary" onclick={() => live.resume()}>{t.vf.live.resume}</button></div>
      {:else if err}
        <b>{err[0]}</b>
        <p>{err[1]}</p>
        <div class="vf-card-actions">
          {#if card !== 'unsupported' && card !== 'insecure'}<button type="button" class="btn btn-primary" onclick={() => live.start()}>{t.vf.live.retry}</button>{/if}
          <button type="button" class="btn btn-secondary" onclick={() => live.stop()}>{t.vf.live.backToScene}</button>
        </div>
      {/if}
    </div>
  {/if}
</div>
