<script lang="ts">
  // The profile circle as Svelte draws it: same markup and styles (src/styles/user.css)
  // as the site bar's, which paintAvatar() in src/user/local.ts fills.
  import type { Profile } from '../../storage/schema.ts';

  let { profile, size = 34 }: { profile: Pick<Profile, 'picture' | 'initials'> | null | undefined; size?: number } = $props();
  const kind = $derived(profile?.picture ? 'picture' : profile?.initials ? 'initials' : undefined);
</script>

<span class="avatar" style:--av={`${size}px`} data-kind={kind} data-tint={kind === 'initials' ? profile?.initials?.tint : undefined}>
  <svg class="avatar-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"></circle><path d="M4.5 20.5c1.5-3.8 4.3-5.5 7.5-5.5s6 1.7 7.5 5.5"></path></svg>
  {#if kind === 'picture'}
    <img class="avatar-img" src={profile?.picture} alt="" width={size} height={size} />
  {:else if kind === 'initials'}
    <span class="avatar-glyph">{profile?.initials?.letters}</span>
  {/if}
</span>
