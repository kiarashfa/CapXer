<script lang="ts">
  import { BANDS } from '../../analysis/levels.ts';
  import { displayName, getSensor, makers, sensors } from '../../data/index.ts';
  import { t } from '../../i18n/en.ts';
  import { formatStops } from '../../lab/format.ts';
  import { lab, type LabPanel } from '../../lab/store.svelte.ts';
  import { SETS } from '../../lab/sets/index.ts';
  import { FRAME_RATES, nearestIndex, step } from '../../lab/stops.ts';
  import { getSubject } from '../../lab/subjects/index.ts';
  import { ASPECTS, LENS_STOPS, aspectPreset } from '../../setup/presets.ts';
  import type { Mode, Setup } from '../../setup/types.ts';
  import Stepper from './Stepper.svelte';
  import { tick } from 'svelte';
  import { labKey, labSummary, suggestLabName } from '../../lab/describe.ts';
  import { deleteLab, openLab, renameLab, replaceLab, saveLab, shareLab } from '../../lab/persist.svelte.ts';

  // The lab's tool panes (dock: Set, Lights, Camera, Aids). One is shown at a
  // time in the right column, in place of the studio plan.
  let { panel, onclose }: { panel: LabPanel; onclose: () => void } = $props();
  const L = t.lab;
  const A = t.vf.aids;

  // ---- Lights ----------------------------------------------------------------
  const SOFTNESS = [
    { size: 0, label: L.lightsPane.hard },
    { size: 0.5, label: L.lightsPane.soft },
    { size: 1.2, label: L.lightsPane.verySoft },
  ];
  const COLOURS = [2700, 3200, 4300, 5600, 6500];
  const softnessOf = (size: number) => SOFTNESS.reduce((best, s) => (Math.abs(s.size - size) < Math.abs(best.size - size) ? s : best)).size;
  const third = (v: number) => Math.round(v * 3) / 3;
  /** One light's controls open at a time (the first light to begin with): keeps the tool short. */
  let openLight = $state<string | null>(lab.allLights[0]?.id ?? null);

  // ---- Saved -----------------------------------------------------------------
  const SP = L.savedPane;
  let saveName = $state('');
  let menuFor = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let renameText = $state('');
  const suggestion = $derived(suggestLabName(lab.setup, lab.toState()));
  const currentKey = $derived(labKey(lab.setup, lab.toState()));
  function onsave(e: SubmitEvent) {
    e.preventDefault();
    if (saveLab(saveName.trim() || suggestion)) saveName = '';
  }
  async function startRename(id: string, current: string) {
    menuFor = null;
    renaming = id;
    renameText = current;
    await tick();
    document.getElementById(`lab-rename-${id}`)?.focus();
  }
  async function finishRename(e?: SubmitEvent) {
    e?.preventDefault();
    const id = renaming;
    if (!id) return;
    renameLab(id, renameText);
    renaming = null;
    await tick();
    document.querySelector<HTMLElement>(`[data-lab="${id}"]`)?.focus();
  }
  function menuAction(fn: () => void) {
    const id = menuFor;
    menuFor = null;
    fn();
    if (id) tick().then(() => document.querySelector<HTMLElement>(`[data-lab-more="${id}"]`)?.focus());
  }
  function savedKeys(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (renaming) {
      e.stopPropagation();
      renaming = null;
    } else if (menuFor) {
      e.stopPropagation();
      const id = menuFor;
      menuFor = null;
      document.querySelector<HTMLElement>(`[data-lab-more="${id}"]`)?.focus();
    }
  }

  // ---- Camera (the viewfinder's setup) ---------------------------------------
  const setup = $derived(lab.setup);
  const sensor = $derived(getSensor(setup.sensorId)!);
  const byMaker = $derived(makers.map((m) => ({ maker: m, list: sensors.filter((s) => s.maker.id === m.id) })).filter((g) => g.list.length));
  const lenses = $derived(LENS_STOPS[setup.mode]);
  const lensIndex = $derived(nearestIndex(lenses, setup.focal));
  const change = (patch: Partial<Setup>) => lab.setSetup({ ...setup, ...patch });
  function setMode(mode: Mode) {
    change({ mode, aspect: aspectPreset(mode, setup.aspect) ? setup.aspect : 'full' });
  }
  function setCamera(id: string) {
    const s = getSensor(id);
    if (!s) return;
    const f = s.formats[0]!;
    change({ sensorId: s.id, formatId: f.id, squeeze: f.squeeze ?? 1 });
  }
  function setFormat(id: string) {
    const f = sensor.formats.find((x) => x.id === id) ?? sensor.formats[0]!;
    change({ formatId: f.id, squeeze: f.squeeze ?? 1 });
  }
  function stepLens(d: 1 | -1) {
    const cur = lenses[lensIndex]!;
    // From a focal length between stops, the first step lands on the next stop that way.
    const next = d > 0 ? lenses.find((f) => f > setup.focal + 0.01) : [...lenses].reverse().find((f) => f < setup.focal - 0.01);
    change({ focal: next ?? cur });
  }
</script>

{#snippet minus()}<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12" /></svg>{/snippet}
{#snippet plus()}<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12M12 6v12" /></svg>{/snippet}

<section class="card lab-pane" id={`lab-pane-${panel}`} role="region" aria-labelledby="lab-pane-title" data-testid={`lab-pane-${panel}`}>
  <header class="lab-pane-head">
    <h2 id="lab-pane-title">{L.panels[panel]}</h2>
    <button type="button" class="dock-icon" aria-label={L.close} title={L.close} onclick={onclose}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </header>
  <div class="lab-pane-body">
    {#if panel === 'set'}
      <div class="vf-row stack">
        <div class="vf-txt"><b>{L.setPane.place[0]}</b><span>{L.setPane.place[1]}</span></div>
        <div class="chips" role="group" aria-label={L.setPane.place[0]}>
          {#each SETS as s (s.id)}<button type="button" class="chip" aria-pressed={lab.setId === s.id} onclick={() => lab.setSet(s.id)}>{s.name}</button>{/each}
        </div>
      </div>
      <div class="vf-row stack">
        <div class="vf-txt"><b>{L.setPane.subject[0]}</b><span>{L.setPane.subject[1]}</span></div>
        <div class="chips" role="group" aria-label={L.setPane.subject[0]}>
          {#each lab.set.subjects as id (id)}<button type="button" class="chip" aria-pressed={lab.subject.id === id} onclick={() => (lab.subjectId = id)}>{getSubject(id).name}</button>{/each}
        </div>
      </div>
      <div class="vf-row stack">
        <div class="vf-txt"><b>{L.setPane.lighting[0]}</b><span>{L.setPane.lighting[1]}</span></div>
        <div class="chips" role="group" aria-label={L.setPane.lighting[0]}>
          {#each lab.set.lighting as sc (sc.id)}<button type="button" class="chip" aria-pressed={lab.lighting.id === sc.id} onclick={() => lab.setLighting(sc.id)} data-testid={`lab-lighting-${sc.id}`}>{sc.name}</button>{/each}
        </div>
      </div>
    {:else if panel === 'lights'}
      {#each lab.allLights as l (l.id)}
        <div class="lab-light" class:off={!l.on} data-testid={`lab-light-${l.id}`}>
          <div class="lab-light-head">
            <input type="checkbox" class="switch" aria-label={`${l.name} ${L.lightsPane.on.toLowerCase()}`} checked={l.on} onchange={(e) => lab.editLight(l.id, { on: e.currentTarget.checked })} />
            <button type="button" class="lab-light-toggle" aria-expanded={l.on && openLight === l.id} aria-controls={`lab-light-body-${l.id}`} disabled={!l.on} onclick={() => (openLight = openLight === l.id ? null : l.id)} data-testid={`lab-light-open-${l.id}`}>
              <b>{l.name}</b>
              <span class="lab-light-sum vf-num">{l.on ? `${formatStops(l.stops)} · ${SOFTNESS.find((x) => x.size === softnessOf(l.size))!.label} · ${l.kelvin} K` : L.lightsPane.off}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>
          {#if l.on && openLight === l.id}
          <div id={`lab-light-body-${l.id}`}>
            <div class="lab-light-row">
              <span class="lab-mini">{L.lightsPane.brightness}</span>
              <div class="lab-mini-step">
                <button type="button" class="dock-icon" aria-label={`${l.name}: ${L.lightsPane.dimmer}`} disabled={l.stops <= -3} onclick={() => lab.editLight(l.id, { stops: third(l.stops - 1 / 3) })}>{@render minus()}</button>
                <output class="vf-num">{formatStops(l.stops)}</output>
                <button type="button" class="dock-icon" aria-label={`${l.name}: ${L.lightsPane.brighter}`} disabled={l.stops >= 3} onclick={() => lab.editLight(l.id, { stops: third(l.stops + 1 / 3) })}>{@render plus()}</button>
              </div>
            </div>
            <div class="lab-light-row">
              <span class="lab-mini">{L.lightsPane.softness}</span>
              <div class="seg lab-seg" role="group" aria-label={`${l.name}: ${L.lightsPane.softness}`}>
                {#each SOFTNESS as sft (sft.size)}<button type="button" aria-pressed={softnessOf(l.size) === sft.size} onclick={() => lab.editLight(l.id, { size: sft.size })}>{sft.label}</button>{/each}
              </div>
            </div>
            <div class="lab-light-row">
              <span class="lab-mini">{L.lightsPane.colour} <small>K</small></span>
              <div class="seg lab-seg mono" role="group" aria-label={`${l.name}: ${L.lightsPane.colour}, kelvin`}>
                {#each COLOURS as k (k)}<button type="button" aria-pressed={l.kelvin === k} onclick={() => lab.editLight(l.id, { kelvin: k })}>{k}</button>{/each}
              </div>
            </div>
          </div>
          {/if}
        </div>
      {/each}
      <div class="lab-light">
        <div class="lab-light-row">
          <span class="lab-mini">{L.lightsPane.ambient[0]}</span>
          <div class="lab-mini-step">
            <button type="button" class="dock-icon" aria-label={`${L.lightsPane.ambient[0]}: ${L.lightsPane.dimmer}`} disabled={lab.ambientStops <= -3} onclick={() => (lab.ambientStops = third(lab.ambientStops - 1 / 3))}>{@render minus()}</button>
            <output class="vf-num">{formatStops(lab.ambientStops)}</output>
            <button type="button" class="dock-icon" aria-label={`${L.lightsPane.ambient[0]}: ${L.lightsPane.brighter}`} disabled={lab.ambientStops >= 3} onclick={() => (lab.ambientStops = third(lab.ambientStops + 1 / 3))}>{@render plus()}</button>
          </div>
        </div>
      </div>
      <div class="lab-pane-foot">
        <p class="lab-pane-note">{L.lightsPane.moveHint}</p>
        <button type="button" class="btn btn-secondary" onclick={() => lab.resetLights()}>{L.lightsPane.reset}</button>
      </div>
    {:else if panel === 'camera'}
      <p class="lab-pane-note">{L.cameraPane.shared}</p>
      <div class="vf-row">
        <div class="vf-txt"><b>{L.cameraPane.mode[0]}</b><span>{L.cameraPane.mode[1]}</span></div>
        <div class="seg" role="group" aria-label={L.cameraPane.mode[0]}>
          <button type="button" aria-pressed={setup.mode === 'cinema'} onclick={() => setMode('cinema')}>{L.cameraPane.cinema}</button>
          <button type="button" aria-pressed={setup.mode === 'stills'} onclick={() => setMode('stills')}>{L.cameraPane.stills}</button>
        </div>
      </div>
      <div class="vf-row stack">
        <label class="vf-txt" for="lab-camera"><b>{L.cameraPane.camera}</b><span>{displayName(sensor)}</span></label>
        <select id="lab-camera" class="select" value={setup.sensorId} onchange={(e) => setCamera(e.currentTarget.value)} data-testid="lab-camera-select">
          {#each byMaker as g (g.maker.id)}
            <optgroup label={g.maker.name}>{#each g.list as s (s.id)}<option value={s.id}>{displayName(s)}</option>{/each}</optgroup>
          {/each}
        </select>
      </div>
      {#if sensor.formats.length > 1}
        <div class="vf-row stack">
          <label class="vf-txt" for="lab-format"><b>{L.cameraPane.format}</b><span class="vf-num">{lab.format.width} x {lab.format.height} mm</span></label>
          <select id="lab-format" class="select" value={setup.formatId} onchange={(e) => setFormat(e.currentTarget.value)}>
            {#each sensor.formats as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
          </select>
        </div>
      {/if}
      <div class="vf-row stack">
        <div class="vf-txt"><b>{L.cameraPane.frame}</b></div>
        <div class="chips" role="group" aria-label={L.cameraPane.frame}>
          {#each ASPECTS[setup.mode] as a (a.id)}<button type="button" class="chip mono" aria-pressed={setup.aspect === a.id} onclick={() => change({ aspect: a.id })}>{a.label}</button>{/each}
        </div>
      </div>
      <div class="lab-light-grid">
        <Stepper
          id="lab-lens"
          label={L.cameraPane.lens}
          value={`${Number(setup.focal.toFixed(1))} mm`}
          less={{ label: L.cameraPane.shorter, disabled: setup.focal <= lenses[0]! + 0.01, onclick: () => stepLens(-1) }}
          more={{ label: L.cameraPane.longer, disabled: setup.focal >= lenses.at(-1)! - 0.01, onclick: () => stepLens(1) }}
        />
        {#if lab.cinema}
          <Stepper
            id="lab-fps"
            label={L.cameraPane.fps}
            value={`${lab.fps} fps`}
            less={{ label: L.cameraPane.slower, disabled: lab.fpsIndex === 0, onclick: () => (lab.fpsIndex = step(lab.fpsIndex, -1, FRAME_RATES.length)) }}
            more={{ label: L.cameraPane.faster, disabled: lab.fpsIndex === FRAME_RATES.length - 1, onclick: () => (lab.fpsIndex = step(lab.fpsIndex, 1, FRAME_RATES.length)) }}
          />
        {/if}
      </div>
      <div class="vf-row">
        <div class="vf-txt"><b>{L.cameraPane.position[0]}</b><span>{L.cameraPane.position[1]}</span></div>
        <button type="button" class="btn btn-secondary" disabled={lab.cameraPlace === null} onclick={() => lab.resetCamera()}>{L.cameraPane.resetPosition}</button>
      </div>
    {:else if panel === 'saved'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div onkeydown={savedKeys}>
        <div class="vf-row stack">
          <div class="vf-txt"><b>{SP.current}</b><span class="sv-sum" data-testid="lab-saved-summary">{labSummary(lab.setup, lab.toState())}</span></div>
          <form class="sv-save" onsubmit={onsave}>
            <input class="field-input" aria-label={SP.nameLabel} placeholder={suggestion} maxlength="60" bind:value={saveName} data-testid="lab-saved-name" />
            <button type="submit" class="btn btn-primary" data-testid="lab-saved-save">{SP.save}</button>
          </form>
        </div>
        <div class="vf-row stack">
          <div class="sv-head"><h3>{SP.list}</h3>{#if lab.savedLabs.length}<span class="sv-sum">{lab.savedLabs.length}</span>{/if}</div>
          {#if !lab.savedLabs.length}
            <p class="vf-note">{SP.empty}</p>
          {:else}
            <ul class="sv-list" data-testid="lab-saved-list">
              {#each lab.savedLabs as sv (sv.id)}
                {@const showing = !lab.shared && labKey(sv.setup, sv.lab) === currentKey}
                <li class:current={showing}>
                  {#if renaming === sv.id}
                    <form class="sv-rename" onsubmit={finishRename}>
                      <input id={`lab-rename-${sv.id}`} class="field-input" aria-label={`${SP.renameLabel} ${sv.name}`} maxlength="60" bind:value={renameText} />
                      <button type="submit" class="btn btn-secondary">{SP.done}</button>
                    </form>
                  {:else}
                    <button type="button" class="sv-item" data-lab={sv.id} aria-current={showing ? 'true' : undefined} onclick={() => openLab(sv.id)}>
                      <span class="nm"><span class="sv-name">{sv.name}</span>{#if showing}<span class="sv-tag">{SP.showing}</span>{/if}</span>
                      <span class="sv-sum">{labSummary(sv.setup, sv.lab)}</span>
                    </button>
                    <button type="button" class="icon-btn sv-more" data-lab-more={sv.id} aria-label={`${SP.more} ${sv.name}`} aria-expanded={menuFor === sv.id} aria-controls={`lab-menu-${sv.id}`} onclick={() => (menuFor = menuFor === sv.id ? null : sv.id)}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" /></svg>
                    </button>
                    {#if menuFor === sv.id}
                      <div class="sv-menu" id={`lab-menu-${sv.id}`} role="group" aria-label={`${SP.more} ${sv.name}`}>
                        <button type="button" class="chip" onclick={() => menuAction(() => shareLab(sv))}>{SP.share}</button>
                        <button type="button" class="chip" onclick={() => startRename(sv.id, sv.name)}>{SP.rename}</button>
                        <button type="button" class="chip" onclick={() => menuAction(() => replaceLab(sv.id))}>{SP.replace}</button>
                        <button type="button" class="chip" onclick={() => menuAction(() => deleteLab(sv.id))}>{SP.remove}</button>
                      </div>
                    {/if}
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        <p class="lab-pane-note">{SP.note}</p>
      </div>
    {:else}
      <p class="lab-pane-note">{L.aidsPane.note}</p>
      <div class="vf-row">
        <label class="vf-txt" for="lab-hist"><b>{L.aidsPane.histogram[0]}</b><span>{L.aidsPane.histogram[1]}</span></label>
        <input id="lab-hist" type="checkbox" class="switch" bind:checked={lab.histogram} data-testid="lab-hist-switch" />
      </div>
      {#if lab.histogram}
        <div class="vf-row">
          <div class="vf-txt"><b>{A.histMode[0]}</b><span>{A.histMode[1]}</span></div>
          <div class="seg" role="group" aria-label={A.histMode[0]}>
            <button type="button" aria-pressed={lab.histMode === 'luma'} onclick={() => (lab.histMode = 'luma')}>{A.luma}</button>
            <button type="button" aria-pressed={lab.histMode === 'rgb'} onclick={() => (lab.histMode = 'rgb')}>{A.rgb}</button>
          </div>
        </div>
      {/if}
      <div class="vf-row stack">
        <div class="vf-txt"><b>{A.picture[0]}</b><span>{A.picture[1]}</span></div>
        <div class="seg" role="group" aria-label={A.picture[0]}>
          <button type="button" aria-pressed={lab.picture === 'off'} onclick={() => (lab.picture = 'off')}>{A.pictureOff}</button>
          <button type="button" aria-pressed={lab.picture === 'zebras'} onclick={() => (lab.picture = 'zebras')} data-testid="lab-aid-zebras">{A.zebras}</button>
          <button type="button" aria-pressed={lab.picture === 'falseColour'} onclick={() => (lab.picture = 'falseColour')} data-testid="lab-aid-false">{A.falseColour}</button>
        </div>
      </div>
      {#if lab.picture === 'zebras'}
        <div class="vf-row stack">
          <div class="vf-txt"><b>{A.zebraLevel}</b></div>
          <div class="chips" role="group" aria-label={A.zebraLevel}>
            {#each [70, 80, 90, 95, 100] as z (z)}<button type="button" class="chip mono" aria-pressed={lab.zebra === z} onclick={() => (lab.zebra = z)}>{z} %</button>{/each}
          </div>
        </div>
      {:else if lab.picture === 'falseColour'}
        <ul class="lab-bands" data-testid="lab-bands">
          {#each BANDS as b (b.id)}<li><span class="sw" style:background={b.color} aria-hidden="true"></span>{A.bands[b.id]}</li>{/each}
          <li><span class="sw grey" aria-hidden="true"></span>{A.otherBands}: {A.otherShown}</li>
        </ul>
        <p class="lab-pane-note">{L.aidsPane.bandsNote}</p>
      {/if}
    {/if}
  </div>
</section>
