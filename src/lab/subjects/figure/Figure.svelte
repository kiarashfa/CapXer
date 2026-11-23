<script lang="ts">
  import { T } from '@threlte/core';

  // A smooth stylised mannequin built from simple shapes (no model file, no
  // licence). Proportions for a 1.75 m figure, scaled to `height`; standing on
  // the floor at the origin, facing +z (the camera).
  let { height }: { height: number } = $props();
  const s = $derived(height / 1.75);
  const skin = '#cbb8a3';
</script>

<T.Group scale={[s, s, s]}>
  <!-- legs -->
  {#each [-0.1, 0.1] as x (x)}
    <T.Mesh position={[x, 0.45, 0]} castShadow receiveShadow>
      <T.CapsuleGeometry args={[0.075, 0.74, 8, 24]} />
      <T.MeshStandardMaterial color={skin} roughness={0.55} />
    </T.Mesh>
  {/each}
  <!-- hips -->
  <T.Mesh position={[0, 0.93, 0]} rotation.z={Math.PI / 2} castShadow receiveShadow>
    <T.CapsuleGeometry args={[0.13, 0.12, 8, 24]} />
    <T.MeshStandardMaterial color={skin} roughness={0.55} />
  </T.Mesh>
  <!-- torso -->
  <T.Mesh position={[0, 1.22, 0]} scale={[1.15, 1, 0.75]} castShadow receiveShadow>
    <T.CapsuleGeometry args={[0.16, 0.34, 8, 32]} />
    <T.MeshStandardMaterial color={skin} roughness={0.55} />
  </T.Mesh>
  <!-- arms -->
  {#each [-1, 1] as side (side)}
    <T.Mesh position={[side * 0.27, 1.13, 0]} rotation.z={side * 0.1} castShadow receiveShadow>
      <T.CapsuleGeometry args={[0.05, 0.56, 8, 20]} />
      <T.MeshStandardMaterial color={skin} roughness={0.55} />
    </T.Mesh>
  {/each}
  <!-- neck and head -->
  <T.Mesh position={[0, 1.48, 0]} castShadow>
    <T.CylinderGeometry args={[0.05, 0.055, 0.1, 20]} />
    <T.MeshStandardMaterial color={skin} roughness={0.55} />
  </T.Mesh>
  <T.Mesh position={[0, 1.61, 0.01]} scale={[1, 1.15, 1]} castShadow receiveShadow>
    <T.SphereGeometry args={[0.105, 40, 28]} />
    <T.MeshStandardMaterial color={skin} roughness={0.5} />
  </T.Mesh>
</T.Group>
