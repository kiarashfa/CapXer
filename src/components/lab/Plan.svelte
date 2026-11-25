<script lang="ts">
  import { t } from '../../i18n/en.ts';
  import { formatMetres } from '../../lab/format.ts';
  import { alongToWall, at, beam, points, sharpBand, viewWedge } from '../../lab/plan.ts';
  import { lab } from '../../lab/store.svelte.ts';

  // Top view of the set, drawn from the same numbers as the 3D scene.
  // Units: centimetres (1 m = 100), z down the page towards the camera.
  // Lights and the camera can be dragged, or moved with the arrow keys once
  // focused (10 cm a press, 50 cm with Shift).
  const L = t.lab.plan;
  const U = 100;
  const room = $derived(lab.set.room);
  const cam = $derived({ x: lab.cameraAt.x, z: lab.cameraAt.z });
  const focus = $derived({ x: lab.focusPoint.x, z: lab.focusPoint.z });
  const w = $derived(viewWedge(cam, focus));
  const wall = $derived(alongToWall(cam, w, room.wallZ));
  const reach = $derived(Number.isFinite(wall) ? wall : 12);
  const band = $derived(
    sharpBand(cam, w, lab.camera.tanW, lab.dof.near / 1000, lab.dof.far / 1000, reach),
  );
  const edgeL = $derived(at(cam, w, reach, -reach * lab.camera.tanW));
  const edgeR = $derived(at(cam, w, reach, reach * lab.camera.tanW));
  const camAngle = $derived((Math.atan2(w.axis.x, -w.axis.z) * 180) / Math.PI);
  const dimFrom = $derived(at(cam, w, 0, -0.35));
  const dimTo = $derived(at(cam, w, Math.hypot(focus.x - cam.x, focus.z - cam.z), -0.35));

  const minX = $derived(-room.width / 2);
  const minZ = $derived(room.wallZ - 0.5);
  const maxZ = $derived(room.wallZ + room.depth);
  const viewBox = $derived(`${minX * U} ${minZ * U} ${room.width * U} ${(maxZ - minZ) * U}`);

  const sharpText = $derived(
    `${L.sharp} ${formatMetres(lab.dof.near / 1000).replace(' m', '')}–${formatMetres(lab.dof.far / 1000)}`,
  );
  const summary = $derived(
    `${L.title}: ${lab.subject.name} ${formatMetres(lab.focusM)} ${L.fromCamera}, ${lab.lights.map((l) => l.name).join(', ')}. ${sharpText}.`,
  );

  /** Labels go on the outer side of a light, unless that runs off the plan. */
  const labelRight = (x: number) => (x >= 0 ? x < room.width / 2 - 1.1 : x < -room.width / 2 + 1.1);

  /** "2.2 m right, 2.2 m in front": where a thing stands relative to the subject. */
  const where = (x: number, z: number) =>
    `${formatMetres(Math.abs(x))} ${x >= 0 ? L.right : L.left}, ${formatMetres(Math.abs(z))} ${z >= 0 ? L.inFront : L.behind}`;

  // ---- moving things --------------------------------------------------------
  let svg = $state<SVGSVGElement>();
  let dragging = $state<string | null>(null);

  function toPlan(e: PointerEvent): { x: number; z: number } | null {
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x / U, z: p.y / U };
  }

  function move(id: string, x: number, z: number) {
    if (id === 'camera') lab.moveCamera(x, z);
    else lab.moveLight(id, x, z);
  }

  function down(id: string) {
    return (e: PointerEvent) => {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragging = id;
      e.preventDefault();
    };
  }
  function drag(id: string) {
    return (e: PointerEvent) => {
      if (dragging !== id) return;
      const p = toPlan(e);
      if (p) move(id, p.x, p.z);
    };
  }
  function up(e: PointerEvent) {
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    dragging = null;
  }

  const KEYS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  function key(id: string, x: number, z: number) {
    return (e: KeyboardEvent) => {
      const d = KEYS[e.key];
      if (!d) return;
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : 0.1;
      move(id, x + d[0] * step, z + d[1] * step);
    };
  }
</script>

<svg
  class="lab-plan"
  {viewBox}
  role="group"
  aria-label={summary}
  preserveAspectRatio="xMidYMid meet"
  bind:this={svg}
  class:dragging={!!dragging}
>
  <defs>
    <clipPath id="lab-room"
      ><rect
        x={minX * U}
        y={room.wallZ * U}
        width={room.width * U}
        height={(maxZ - room.wallZ) * U}
      /></clipPath
    >
  </defs>
  <g aria-hidden="true">
    <g clip-path="url(#lab-room)">
      <polygon class="fov-area" points={points([cam, edgeL, edgeR])} />
      <polygon class="dof" points={points(band)} />
      <line class="fov" x1={cam.x * U} y1={cam.z * U} x2={edgeL.x * U} y2={edgeL.z * U} />
      <line class="fov" x1={cam.x * U} y1={cam.z * U} x2={edgeR.x * U} y2={edgeR.z * U} />
      {#each lab.lights as l (l.id)}
        <polygon
          class="beam"
          points={points(
            beam(
              { x: l.at.x, z: l.at.z },
              { x: l.aim.x, z: l.aim.z },
              l.angle ?? 30,
              Math.hypot(l.aim.x - l.at.x, l.aim.z - l.at.z) * 0.7,
            ),
          )}
        />
      {/each}
    </g>

    <line class="wall" x1={minX * U} y1={room.wallZ * U} x2={-minX * U} y2={room.wallZ * U} />
    <text class="lbl" x="0" y={(room.wallZ - 0.18) * U} text-anchor="middle">{L.wall}</text>

    {#each lab.set.props as p (p.id)}
      {#if p.shape === 'cylinder'}
        <circle class="prop" cx={p.at.x * U} cy={p.at.z * U} r={(p.size.w / 2) * U} />
      {:else}
        <rect
          class="prop"
          x={(p.at.x - p.size.w / 2) * U}
          y={(p.at.z - p.size.d / 2) * U}
          width={p.size.w * U}
          height={p.size.d * U}
          rx="4"
        />
      {/if}
      {#if lab.set.props.filter((q) => q.name === p.name).length === 1}
        <text class="lbl" x={(p.at.x + p.size.w / 2 + 0.12) * U} y={(p.at.z + 0.09) * U}
          >{p.name}</text
        >
      {/if}
    {/each}

    <circle class="subj" cx="0" cy="0" r={lab.subject.radius * U} />
    <text class="lbl" x={(lab.subject.radius + 0.12) * U} y={-0.2 * U}>{lab.subject.name}</text>

    <!-- focus distance, drawn beside the line of sight -->
    <line class="dim" x1={dimFrom.x * U} y1={dimFrom.z * U} x2={dimTo.x * U} y2={dimTo.z * U} />
    <text
      class="lbl num"
      x={((dimFrom.x + dimTo.x) / 2 - 0.15) * U}
      y={((dimFrom.z + dimTo.z) / 2) * U}
      text-anchor="end">{formatMetres(lab.focusM)}</text
    >
  </g>

  {#each lab.allLights as l (l.id)}
    <g
      class="mover lamp-g"
      class:off={!l.on}
      role="button"
      tabindex="0"
      aria-label={`${l.name} ${L.light}${l.on ? '' : ` (${L.off})`}: ${where(l.at.x, l.at.z)}. ${L.moveHint}`}
      data-testid={`plan-light-${l.id}`}
      onpointerdown={down(l.id)}
      onpointermove={drag(l.id)}
      onpointerup={up}
      onpointercancel={up}
      onkeydown={key(l.id, l.at.x, l.at.z)}
    >
      <circle class="hit" cx={l.at.x * U} cy={l.at.z * U} r="34" />
      <circle class="lamp" cx={l.at.x * U} cy={l.at.z * U} r="14" />
      <circle class="ring" cx={l.at.x * U} cy={l.at.z * U} r="24" />
      <text
        class="lbl"
        x={(l.at.x + (labelRight(l.at.x) ? 0.3 : -0.3)) * U}
        y={(l.at.z + 0.1) * U}
        text-anchor={labelRight(l.at.x) ? 'start' : 'end'}>{l.name}</text
      >
    </g>
  {/each}

  <g
    class="mover"
    role="button"
    tabindex="0"
    aria-label={`${L.camera} · ${lab.camera.focal} mm: ${where(cam.x, cam.z)}. ${L.moveHint}`}
    data-testid="plan-camera"
    onpointerdown={down('camera')}
    onpointermove={drag('camera')}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key('camera', cam.x, cam.z)}
  >
    <circle class="hit" cx={cam.x * U} cy={cam.z * U} r="40" />
    <g transform={`translate(${cam.x * U} ${cam.z * U}) rotate(${camAngle})`}>
      <rect class="cam" x="-22" y="-10" width="44" height="26" rx="6" />
      <circle class="ring" cx="0" cy="3" r="34" />
    </g>
    <text class="lbl" x={(cam.x + 0.4) * U} y={(cam.z + 0.12) * U}
      >{L.camera} · {lab.camera.focal} mm</text
    >
  </g>
</svg>
<p class="lab-legend">
  <span class="sw dof" aria-hidden="true"></span>{sharpText}
  <span class="sw fov" aria-hidden="true"></span>{L.sees}
</p>
