# Roadmap

Where Kiro-Kit is going, and roughly in what order. This is a statement of
intent, not a promise with dates — one maintainer, evenings and weekends.

Current release: **0.10.x**. The preset schema is not frozen yet, which is the
main thing standing between here and 1.0.

Anything below is open to being argued with. If you need something sooner,
[open an issue](https://github.com/ihatesea69/kiro-kit/issues/new/choose) — a
real use case moves an item up the list faster than anything else.

## 0.11 — Releasing without a human in the loop

Releases are cut by hand today, and that has already shipped one bad artefact
(see the 0.10.3 entry in [CHANGELOG.md](../CHANGELOG.md)). The publish workflow
needs to run on tag, verify that the version matches the tag, and publish with
provenance — so a release is a tag, not a person remembering the right
directory.

- Working publish workflow on tag push
- Guard: refuse to publish when `package.json` and the tag disagree
- Release notes generated from the CHANGELOG entry

## 0.12 — Take your workspace with you

Content flows one way today: Kiro-Kit writes into `.kiro/`. Teams that have
tuned their own agents and steering have no way to hand that to a colleague
except by copying folders around.

- `kiro-kit export` — turn the current `.kiro/` into a preset directory
- `kiro-kit add --from <path>` — install a preset that isn't bundled
- Preset validation as a standalone command, so a hand-written preset can be
  checked before anyone installs it

## 0.13 — Presets in CI

A workspace that only exists on a laptop cannot be verified in a pipeline.

- A GitHub Action that installs a preset and runs `doctor`
- Machine-readable `doctor` output for pipeline consumption
- A documented pattern for pinning a preset version in a repository

## 0.14 — Multi-agent work beyond security

The deep security scan is a pipeline — recon, parallel finders, adversarial
validation, deduplication, report — and none of that is specific to security.
The plan is to lift the harness out and let a preset describe its own pipeline.

- Reusable plan → execute → evaluate harness declared in a preset
- Worktree isolation so parallel agents cannot fight over the same files
- A second pipeline built on it; a documentation audit is the likely candidate

## 0.15 — Decisions, recorded

The `sa` preset teaches Architecture Decision Records in its steering but makes
you write every one by hand.

- `kiro-kit adr new` with automatic numbering and supersession links
- Trade-off tables generated from the options considered
- An ADR index kept in sync

## 1.0 — Freeze the schema

1.0 means the manifest schema and the install semantics stop moving, and
breaking either takes a major version.

- Documented, versioned preset manifest schema
- Migration path for presets written against earlier versions
- Deprecation policy with a stated support window

## Not planned

Some things get asked for and the answer is no, so they are worth stating:

- **A GUI.** The CLI plus the IDE is the interface.
- **Fetching presets from a registry at install time.** Everything ships inside
  the package on purpose; offline installs are a feature, not an oversight.
- **A preset per framework.** Nine presets already overlap. The line is drawn at
  stacks that differ in how you work, not in which library you imported.

## Smaller things worth doing

These need no roadmap slot, and they are good places to start contributing:

- `fullstack` and `mobile` ship one worked example spec each, where most presets
  ship four
- Example specs exist only in English
- `doctor` checks eight things; drift between an installed workspace and its
  preset is not one of them
