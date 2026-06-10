# setup-go-arch-lint

A GitHub Action that installs [go-arch-lint](https://github.com/fe3dback/go-arch-lint) and adds it to `PATH`, so you can run it in subsequent steps.

## Usage

```yaml
steps:
  - uses: actions/checkout@v6

  - uses: mmicatka/setup-go-arch-lint@v1
    with:
      version: 'v1.15.0'  # optional, defaults to v1.15.0

  - name: Check architecture
    run: go-arch-lint check --project-path .
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `version` | No | `v1.15.0` | Version of go-arch-lint to install. Accepts `v1.2.3` or `1.2.3`. |
| `checksum` | No | | Expected SHA256 (hex) of the release archive for the current platform. When set, it takes precedence over the vendored checksum and the release's `checksums.txt`. |

## Outputs

| Output | Description |
| --- | --- |
| `version` | The resolved version of go-arch-lint that was installed. |

## Checksum verification

Every downloaded archive is verified against a known SHA256 hash before it is
extracted. For pinned versions the expected hash is vendored into this action
(see `KNOWN_CHECKSUMS` in `src/index.ts`), so a download is rejected even if the
upstream release asset is later tampered with. For versions that aren't pinned
here, the action falls back to the `checksums.txt` published alongside the
release. A mismatch fails the step.

You can also supply your own hash via the `checksum` input, which overrides both
of the above. This is the most secure option for an unpinned version, since the
expected hash lives in your workflow rather than being fetched from the release:

```yaml
  - uses: mmicatka/setup-go-arch-lint@v1
    with:
      version: 'v1.14.0'
      checksum: 'b694a40d4b880b7665b164da6023775ba7461ac2110de09f0b2dddd1c58d4176'
```

The `checksum` must match the archive for the runner's platform (OS + arch), so
this is best suited to single-platform workflows.

To pin a new version, add its entry from the release's `checksums.txt`:

```bash
curl -fsSL https://github.com/fe3dback/go-arch-lint/releases/download/<version>/checksums.txt
```

## Caching

Downloaded binaries are cached using [`@actions/tool-cache`](https://github.com/actions/toolkit/tree/main/packages/tool-cache). Subsequent workflow runs on the same runner will skip the download if the requested version is already cached.

## Example: enforce architecture on every PR

```yaml
name: Architecture Check

on:
  pull_request:

jobs:
  arch-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: mmicatka/setup-go-arch-lint@v1

      - name: Run go-arch-lint
        run: go-arch-lint check --project-path .
```

## License

MIT
