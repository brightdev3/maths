<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import { FAIR_PLAY_OPTIONS, FAIR_PLAY_LIMITATIONS, type FairPlaySettings } from "./fair-play";

  let {
    settings,
    onChange,
    idPrefix
  }: {
    settings: FairPlaySettings;
    onChange: (settings: Partial<FairPlaySettings>) => void;
    idPrefix: string;
  } = $props();
</script>

<fieldset class="space-y-3">
  <legend class="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
    >Additional fair play controls</legend
  >
  {#each FAIR_PLAY_OPTIONS as option}
    <div class="flex items-start gap-2.5">
      <Checkbox
        id={`${idPrefix}-${option.key}`}
        checked={settings[option.key]}
        onCheckedChange={(checked) => onChange({ [option.key]: checked === true })}
      />
      <div>
        <Label for={`${idPrefix}-${option.key}`} class="cursor-pointer text-sm font-semibold">{option.label}</Label>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
      </div>
    </div>
  {/each}
  <p class="text-xs leading-5 text-muted-foreground">
    Attempts are reported privately to the host as warnings, not tab-leaving flags. Repeated events of the same kind
    within five seconds are grouped. Only action type, time and question number are recorded, never clipboard contents.
    {FAIR_PLAY_LIMITATIONS}
  </p>
</fieldset>
