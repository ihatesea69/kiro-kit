# FAQ

## Installation

**How do I install kiro-kit?**

No global install needed. Run directly with npx:

```bash
npx kiro-kit init
```

Or install globally:

```bash
npm install -g kiro-kit
kiro-kit init
```

**What Node.js version do I need?**

Node.js 18 or later. The CLI checks your version at startup and exits with a
clear error if it is too old.

**Does kiro-kit require network access?**

Only for the initial `npx` fetch. All preset content is bundled in the npm
package. Once installed, all commands work offline.

**Can I use it in a CI environment?**

Yes. Use `--yes` to skip interactive prompts and `--preset <name>` to specify
presets:

```bash
npx kiro-kit init --preset frontend --yes
```

## Conflict Resolution

**What happens if I already have a `.kiro/` directory?**

kiro-kit detects existing files and prompts you for each conflict. You can
choose to overwrite (with backup), skip, view a diff, or overwrite all
remaining conflicts at once.

**Will kiro-kit delete my custom files?**

No. kiro-kit never deletes files. It only writes new files or overwrites
existing ones (with your explicit consent and a backup). Files you created
manually that are not in any preset manifest are never touched.

**Where are backups stored?**

At `.kiro/.backup/<timestamp>/`. Each backup preserves the full relative path
of the original file. Backups are never automatically deleted.

**How do I restore from a backup?**

```bash
kiro-kit restore          # Restore from most recent backup
kiro-kit restore --list   # See available backup timestamps
kiro-kit restore --timestamp 20240115-143022-123
```

**What does "overwrite all" do?**

It sets a session flag so all remaining file conflicts in the current operation
are automatically overwritten (with backup). It does not affect future runs.

## Telemetry

**Does kiro-kit collect data?**

Telemetry is disabled by default. No data is collected unless you explicitly
opt in.

**What data is collected when enabled?**

Only anonymous usage events: command name, preset selection, OS, and Node
version. No file contents, file paths, project names, or personally
identifiable information are ever transmitted.

**How do I check my telemetry status?**

```bash
kiro-kit telemetry status
```

**How do I opt out?**

```bash
kiro-kit telemetry disable
```

**Where is the telemetry config stored?**

At `~/.kiro-kit/config.json` in your home directory.

## Updates

**How do I update my workspace to the latest preset version?**

```bash
kiro-kit update
```

This compares your installed preset versions against the bundled versions and
applies changes through the standard conflict resolution flow.

**Will update overwrite my customizations?**

Only if you choose "overwrite" during conflict resolution. By default, the CLI
prompts for each changed file. Use `--skip-existing` to keep all your current
files unchanged.

**How do I add another preset to an existing workspace?**

```bash
kiro-kit add backend
```

This merges the new preset into your existing workspace without affecting
previously installed presets.

**What if I want to start fresh?**

Delete the `.kiro/` directory and run `kiro-kit init` again. Or use
`kiro-kit restore` to revert to a previous state.

## Presets

**Can I install multiple presets?**

Yes. Select multiple presets during `init` or use `add` to install additional
presets later. Files are merged, and conflicts are resolved interactively.

**Are presets independent?**

Yes. Each preset is fully self-contained. Installing or removing one preset
has no effect on others.

**Can I create my own preset?**

Yes. See `docs/creating-presets.md` for the manifest schema, file conventions,
and contribution guide.

## Troubleshooting

**How do I check if my workspace is healthy?**

```bash
kiro-kit doctor
```

This runs 8 health checks and reports pass/fail/warn for each. Use `--fix` to
auto-repair fixable issues (like missing executable bits or malformed JSON).

**I see error code KKxxx. What does it mean?**

Each error code maps to a specific issue. The error message includes a
suggestion for resolution. Common codes:

- KK001: Node.js version below 18
- KK010: Manifest JSON parse error
- KK020: Preset does not exist
- KK040: Tracking file corrupt
- KK050: No backup found for restore

**The CLI shows no color output.**

kiro-kit respects the `NO_COLOR` environment variable and non-TTY terminals.
To force color off explicitly, use `--no-color`. To force color on, ensure
your terminal supports ANSI and `NO_COLOR` is not set.
