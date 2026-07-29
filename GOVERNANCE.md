# Governance

Kiro-Kit is a small project with a single maintainer. This document says who
decides what, so contributors know what to expect before spending time on a
change.

## Roles

**Maintainer** — [@ihatesea69](https://github.com/ihatesea69). Reviews and merges
pull requests, cuts releases, and has the final call on scope.

**Contributor** — anyone who opens an issue or a pull request. No application,
no invitation.

## How decisions get made

Discussion happens in the open, in issues and pull requests. The maintainer
decides, and explains the reasoning in the thread. Disagreement is fine and
useful; a decision that cannot survive being questioned in public is not worth
keeping.

Changes that alter the preset manifest schema, the install semantics, or the
CLI's public flags are breaking. They wait for a minor release and get a
CHANGELOG entry describing the migration.

## What gets accepted

**Presets.** A new preset must meet the thresholds the structural tests enforce
(16+ agents, 22+ skills, 40+ commands, 6+ hooks, 4+ workflows), ship at least
one complete worked example spec, and cover a stack that the existing nine do
not. Open a
[preset request](https://github.com/ihatesea69/kiro-kit/issues/new?template=preset-request.yml)
before writing it — a preset is a few hundred files, and it is a poor use of
your weekend to find out afterwards that it overlaps `fullstack`.

**Content changes.** Corrections to agents, skills, commands, and steering are
the easiest contributions to land. Accuracy beats volume: one command that does
what it claims is worth more than five that approximate it.

**Code.** Changes to `packages/cli` need tests. The suite is described in
[CONTRIBUTING.md](./CONTRIBUTING.md); structural and property-based tests are
not optional decoration, they are what keeps 3,800 shipped files honest.

**What usually gets declined:** content generated wholesale without review,
presets that duplicate an existing one, and dependencies added for a single
convenience function.

## Releases

The maintainer cuts releases. Versioning is [SemVer](https://semver.org):
patch for fixes, minor for new presets and features, major once the preset
schema is frozen at 1.0. Every release has a CHANGELOG entry written for the
person hitting the bug, not for the commit log.

## Response times

Best effort, from one person in the UTC+7 timezone with a day job:

- Security reports — see [SECURITY.md](./SECURITY.md)
- Issues — usually within a week
- Pull requests — usually within a week; a large one may take longer to review
  properly, and a short comment saying so is not a rejection

If something has gone quiet for two weeks, a nudge on the thread is welcome
rather than rude.

## Becoming a maintainer

There is no committee. A few merged, non-trivial contributions and a habit of
reviewing other people's pull requests is the whole path — the maintainer will
offer, and you are free to decline.

## Code of Conduct

Everything here happens under the
[Code of Conduct](./CODE_OF_CONDUCT.md).
