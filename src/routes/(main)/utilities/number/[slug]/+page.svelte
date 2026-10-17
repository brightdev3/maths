<script lang="ts">
  import type { PageData } from "./$types";
  import latex from "$lib/latex";
  import { ArrowLeft } from "@lucide/svelte/icons";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  interface Property {
    header: string;
    fn: (n: number) => string;
  }

  const properties: Property[] = [
    {
      header: "Is it even/odd?",
      fn(n) {
        return n % 2 === 0 ? "Even" : "Odd";
      }
    },
    {
      header: "Is it prime?",
      fn(n) {
        for (let i = 2, s = Math.sqrt(n); i <= s; i++) {
          if (n % i === 0) return "No";
        }
        return n > 1 ? "Yes" : "No";
      }
    },
    {
      header: "What is its prime factorisation?",
      fn(n) {
        let a = n;
        const factors: number[] = [];
        while (a >= 2) {
          for (let i = 2; i <= a; i++) {
            if (a % i === 0) {
              a = a / i;
              factors.push(i);
              break;
            }
          }
        }
        let str = "";
        let currentFactor = factors[0];
        let currentFactorTimes = 1;
        for (let i = 1; i <= factors.length; i++) {
          if (factors[i] === currentFactor) {
            currentFactorTimes++;
          } else {
            if (currentFactorTimes === 1) {
              str += `{${currentFactor}} \\times`;
            } else {
              str += `{${currentFactor}}^{${currentFactorTimes}} \\times`;
            }
            currentFactor = factors[i];
            currentFactorTimes = 1;
          }
        }
        if (currentFactor && currentFactorTimes === 1) {
          str += `${currentFactor}`;
        } else if (currentFactor && currentFactorTimes > 1) {
          str += `${currentFactor}^${currentFactorTimes}`;
        }

        let toReturn = str.trim();
        if (toReturn.endsWith("\\times")) toReturn = toReturn.substring(0, toReturn.length - 6);
        return latex(toReturn);
      }
    },
    {
      header: "What are its factors?",
      fn(n) {
        const factors: number[] = [];
        for (let i = 1; i <= n; i++) {
          if (n % i === 0) factors.push(i);
        }
        return factors.join(", ");
      }
    },
    {
      header: "Is it triangular?",
      fn(n) {
        return Math.sqrt(8 * n + 1) % 1 === 0 ? "Yes" : "No";
      }
    },
    {
      header: "Is it a perfect square?",
      fn(n) {
        return Math.sqrt(n) % 1 === 0 ? "Yes" : "No";
      }
    },
    {
      header: "Is it a perfect cube?",
      fn(n) {
        return Math.cbrt(n) % 1 === 0 ? "Yes" : "No";
      }
    },
    {
      header: "Is it a Fibonacci number?",
      fn(n) {
        return Math.sqrt(5 * n * n + 4) % 1 === 0 || Math.sqrt(5 * n * n - 4) % 1 === 0 ? "Yes" : "No";
      }
    },
    {
      header: "Is it a perfect number?",
      fn(n) {
        let factorSum = 0;
        for (let i = 1; i < n; i++) {
          if (n % i === 0) factorSum += i;
        }
        return factorSum === n ? "Yes" : "No";
      }
    },
    {
      header: "Is it palindromic?",
      fn(n) {
        return n.toString().split("").reverse().join("") === n.toString() ? "Yes" : "No";
      }
    },
    {
      header: "Is it a happy number?",
      fn(n) {
        function squareDigits(inp: number) {
          return inp
            .toString()
            .split("")
            .map(Number)
            .map((x) => x * x)
            .reduce((a, b) => a + b);
        }
        let previous = new Set();
        let currentValue = n;
        while (true) {
          currentValue = squareDigits(currentValue);
          if (currentValue === 1) return "Yes";
          if (previous.has(currentValue)) return "No";
          previous.add(currentValue);
        }
      }
    },
    {
      header: `What is its Collatz Conjecture (${latex("3n+1")}) number?`,
      fn(n) {
        let current = n;
        let steps = 0;
        while (true) {
          if (current === 1) return steps.toString();
          if (current % 2 === 0) current = current / 2;
          else current = 3 * current + 1;

          steps++;
          if (steps > 1500) return "Steps greater than 1500";
        }
      }
    }
  ];
</script>

<div class="py-12 sm:py-16">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <a
      href="/utilities/number"
      class="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary"
    >
      <ArrowLeft class="h-3.5 w-3.5" /> New search
    </a>

    <header class="mt-8 grid items-end gap-8 sm:grid-cols-[auto_1fr]">
      <div class="border border-foreground/25 bg-card px-6 py-5">
        <p class="mathex-kicker">Specimen</p>
        <p class="mt-2 font-display text-6xl font-bold tabular-nums leading-none sm:text-7xl">{data.n}</p>
      </div>
      <div class="pb-1">
        <h1 class="font-display text-3xl font-bold sm:text-4xl">
          Properties of {data.n}<span class="text-primary">.</span>
        </h1>
        <p class="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          Verified on the spot — no tables, no rounding, just arithmetic.
        </p>
      </div>
    </header>

    <dl class="mt-12 border-t-2 border-foreground/85">
      {#each properties as property}
        <div
          class="grid gap-1.5 border-b border-border py-4 sm:grid-cols-[minmax(0,22rem)_1fr] sm:items-baseline sm:gap-8 sm:py-5"
        >
          <dt class="text-sm font-semibold leading-6">{@html property.header}</dt>
          <dd class="font-mono text-sm leading-6 text-muted-foreground">{@html property.fn(data.n)}</dd>
        </div>
      {/each}
    </dl>
  </div>
</div>
