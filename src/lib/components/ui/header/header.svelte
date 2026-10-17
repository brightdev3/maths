<script lang="ts">
  import type { Props } from "./index.js";

  type $$Props = Props;

  interface Props_1 {
    size: $$Props["size"];
    class?: string;
    children?: import("svelte").Snippet;
  }

  let { size, class: className, children }: Props_1 = $props();
</script>

<svelte:element
  this={size}
  class={`scroll-m-20 font-display font-bold ${size === "h1" ? "text-4xl sm:text-5xl" : size === "h2" ? "text-3xl" : size === "h3" ? "text-2xl" : "text-xl"} ${className ?? ""}`}
  >{@render children?.()}</svelte:element
>
