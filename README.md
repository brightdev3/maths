# Tiger Maths

This is a website that contains resources about maths. It uses Bun and SvelteKit.

## How to develop

You need to have Bun installed on your computer. You can [get Bun here](https://bun.sh).

Then, run `bun install` to install dependencies, and `bun --bun run dev` to start the Vite development server.

Alternatively, you could use the `Dockerfile`/`docker-compose.yml`:

```bash
docker-compose up --build
```

## Legacy browser support

Tailwind CSS v4 targets 2023-era browsers, so in addition to the regular Tailwind v4 bundle the site
ships `legacy.css`, a flattened and downlevelled copy of the stylesheets for older browsers (back to
~2017). `bun run build` generates it automatically, and `src/app.html` only loads it in browsers that
cannot use the Tailwind v4 output — modern browsers keep the untouched Tailwind v4 CSS.

See [docs/legacy-browser-support.md](docs/legacy-browser-support.md) for how it works, the support
matrix and testing instructions.

## Docker images

Every push to the repository triggers the `.github/workflows/docker-publish.yml`
workflow, which builds the image and publishes it to GHCR:

```nolang
ghcr.io/brightdev3/maths:{branch}-{sha}
```

On the default branch (`main`) it also publishes `latest` and `{branch}` tags.

To run a published image:

```bash
docker run -p 5185:5185 ghcr.io/brightdev3/maths:latest
```
