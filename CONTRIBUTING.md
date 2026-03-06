# Contributing to Nexra

Nexra is an active fork of Gauntlet.

## Scope (Phase 1)

- **Phase 1 focus: macOS-only.**
- Other platforms are **best-effort** (CI may still run, but macOS is the priority).

## macOS prerequisites (minimal)

- **Node.js 22** (matches CI)
- **Rust stable** (must support **Edition 2024** used by this repo)
- **Protobuf compiler**: `brew install protobuf` (provides `protoc`)

Common missing prerequisites:

- Xcode Command Line Tools: `xcode-select --install`
- CMake (some dependencies require it): `brew install cmake`

### Verify versions

`.nvmrc` and `rust-toolchain.toml` are the source of truth for the expected
Node/Rust versions. If you use `nvm` + `rustup`, they can automatically follow
these pins.

```bash
node -v
rustc -V
```

## Local verification (CI-aligned)

From the repo root:

```bash
npm ci
npm run build
cargo build --workspace --locked
```

These three commands are the baseline expected to work before opening a PR.

## Troubleshooting

### `npm ci` fails or hangs fetching a GitHub git dependency

Some dependencies (for example `@project-gauntlet/tools`) are pinned to a Git
commit in a GitHub repository. On fresh machines or in some CI environments,
Git may attempt to use SSH (or other git URL schemes) and prompt for
credentials, which can look like the install is “stuck”.

Recommended fix (repo-local, does not touch global git config):

```bash
git config --local url."https://github.com/".insteadOf "ssh://git@github.com/"
git config --local url."https://github.com/".insteadOf "git@github.com:"
git config --local url."https://github.com/".insteadOf "git://github.com/"
```

Then retry:

```bash
npm ci
```

If you suspect the process is waiting for input, run with:

```bash
GIT_TERMINAL_PROMPT=0 npm ci
```
