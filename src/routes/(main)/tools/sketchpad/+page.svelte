<script lang="ts">
  import { goto } from "$app/navigation";
  import SketchPad from "$lib/components/SketchPad.svelte";
</script>

<svelte:head>
  <title>Sketchpad - Tiger Maths</title>
</svelte:head>

<SketchPad onclose={() => goto("/tools")} />
