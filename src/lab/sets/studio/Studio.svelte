<script lang="ts">
  import { T } from '@threlte/core';
  import type { Group } from 'three';
  import { useMotion } from '../../render/motion.ts';
  import type { Prop, SetDef } from '../../types.ts';

  // The studio's 3D parts, all from the set's numbers (src/lab/sets/studio/set.ts).
  let { set }: { set: SetDef } = $props();
  const room = $derived(set.room);
  const plain = $derived(set.props.filter((p) => !p.spin));
  const fans = $derived(set.props.filter((p) => p.spin));

  const movers = useMotion();
  const blades = new Map<string, Group>();
  $effect(() => {
    const list = fans;
    const move = (t: number) => {
      for (const p of list) {
        const g = blades.get(p.id);
        if (g) g.rotation.z = -t * p.spin! * Math.PI * 2;
      }
    };
    movers?.add(move);
    return () => movers?.delete(move);
  });

  const bladeRef = (p: Prop) => (g: Group) => {
    blades.set(p.id, g);
  };
</script>

<!-- Floor and background wall -->
<T.Mesh
  rotation.x={-Math.PI / 2}
  position={[0, 0, (room.wallZ + room.depth + room.wallZ) / 2]}
  receiveShadow
>
  <T.PlaneGeometry args={[room.width, room.depth]} />
  <T.MeshStandardMaterial color={room.floorColour} roughness={0.95} />
</T.Mesh>
<T.Mesh position={[0, room.wallHeight / 2, room.wallZ]} receiveShadow>
  <T.PlaneGeometry args={[room.width, room.wallHeight]} />
  <T.MeshStandardMaterial color={room.wallColour} roughness={1} />
</T.Mesh>

{#each plain as p (p.id)}
  <T.Mesh position={[p.at.x, p.size.h / 2, p.at.z]} castShadow receiveShadow>
    {#if p.shape === 'box'}
      <T.BoxGeometry args={[p.size.w, p.size.h, p.size.d]} />
    {:else}
      <T.CylinderGeometry args={[p.size.w / 2, p.size.w / 2, p.size.h, 32]} />
    {/if}
    <T.MeshStandardMaterial
      color={p.colour}
      roughness={p.roughness ?? 0.6}
      metalness={p.metalness ?? 0}
    />
  </T.Mesh>
{/each}

{#each fans as p (p.id)}
  <T.Group position={[p.at.x, 0, p.at.z]}>
    <T.Mesh position={[0, 0.02, 0]} castShadow receiveShadow>
      <T.CylinderGeometry args={[0.18, 0.2, 0.04, 32]} />
      <T.MeshStandardMaterial color="#2b3542" roughness={0.6} />
    </T.Mesh>
    <T.Mesh position={[0, (p.spinAt ?? p.size.h) / 2, 0]} castShadow>
      <T.CylinderGeometry args={[0.02, 0.02, p.spinAt ?? p.size.h, 12]} />
      <T.MeshStandardMaterial color="#2b3542" roughness={0.5} metalness={0.4} />
    </T.Mesh>
    <T.Group position={[0, p.spinAt ?? p.size.h, 0.04]} oncreate={bladeRef(p)}>
      <T.Mesh castShadow>
        <T.SphereGeometry args={[0.05, 16, 12]} />
        <T.MeshStandardMaterial color="#2b3542" roughness={0.5} />
      </T.Mesh>
      {#each [0, 1, 2, 3] as b (b)}
        <T.Mesh rotation.z={(b * Math.PI) / 2} position={[0, 0, 0.01]} castShadow>
          <T.BoxGeometry args={[p.size.w, 0.09, 0.015]} />
          <T.MeshStandardMaterial
            color={b % 2 ? p.colour : '#e7ecf2'}
            roughness={p.roughness ?? 0.5}
          />
        </T.Mesh>
      {/each}
    </T.Group>
  </T.Group>
{/each}
