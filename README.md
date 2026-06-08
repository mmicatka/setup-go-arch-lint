# setup-go-arch-lint

A GitHub Action that installs [go-arch-lint](https://github.com/fe3dback/go-arch-lint) and adds it to `PATH`, so you can run it in subsequent steps.

## Usage

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: your-username/setup-go-arch-lint@v1
    with:
      version: 'v1.14.0'  # optional, defaults to v1.14.0

  - name: Check architecture
    run: go-arch-lint check --project-path .
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `version` | No | `v1.14.0` | Version of go-arch-lint to install. Accepts `v1.2.3` or `1.2.3`. |

## Outputs

| Output | Description |
| --- | --- |
| `version` | The resolved version of go-arch-lint that was installed. |

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
      - uses: actions/checkout@v4

      - uses: your-username/setup-go-arch-lint@v1

      - name: Run go-arch-lint
        run: go-arch-lint check --project-path .
```

## License

MIT
