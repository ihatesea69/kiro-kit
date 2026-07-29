/**
 * normalizeMCP — turn preset MCP server definitions into config Kiro can
 * actually start.
 *
 * A freshly-initialised workspace used to show a wall of red servers in Kiro's
 * MCP panel. Three separate causes, all fixed here:
 *
 *   1. `${WORKSPACE_ROOT}` was written verbatim. Kiro does not interpolate it,
 *      so the filesystem server was handed a literal `${WORKSPACE_ROOT}` path.
 *   2. Servers needing credentials were "disabled" by renaming the key to
 *      `_disabled_<name>`. That is not a Kiro convention — Kiro saw a server
 *      literally named `_disabled_github` and tried to launch it. Kiro's schema
 *      has a `disabled` boolean; that is what we emit now.
 *   3. `uvx`-based servers were enabled by default, but `uvx` needs the `uv`
 *      Python toolchain, which most machines do not have.
 *
 * Anything that cannot start on a clean machine ships `disabled: true` with a
 * `_comment` explaining how to turn it on. A red server teaches the user
 * nothing; a disabled one with a reason does.
 */

export interface NormalizedServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled: boolean;
  autoApprove: string[];
  _comment?: string;
  [key: string]: unknown;
}

/** Commands that depend on the `uv` Python toolchain being installed. */
const UV_COMMANDS = new Set(['uvx', 'uv']);

/** Matches an un-substituted `${VAR}` placeholder. */
const PLACEHOLDER_RE = /\$\{([A-Z0-9_]+)\}/g;

/** Legacy key prefix used before Kiro's `disabled` field was adopted. */
const LEGACY_PREFIX = '_disabled_';

export interface NormalizeOptions {
  /** Absolute path substituted for `${WORKSPACE_ROOT}`. */
  workspaceRoot: string;
}

function substitute(value: string, workspaceRoot: string): string {
  return value.replace('${WORKSPACE_ROOT}', workspaceRoot);
}

/**
 * Collect `${VAR}` placeholders left in a server's env block. These are
 * credential slots the user has not filled in, so the server cannot start.
 */
function unresolvedEnvVars(env: Record<string, string> | undefined): string[] {
  if (!env) return [];
  const found = new Set<string>();
  for (const value of Object.values(env)) {
    for (const match of value.matchAll(PLACEHOLDER_RE)) {
      found.add(match[1]);
    }
  }
  return [...found];
}

/**
 * Normalise one server definition into Kiro's schema.
 *
 * An explicit `disabled` already on the entry wins — that is a user decision,
 * and re-running `init` must not re-enable a server they switched off.
 */
export function normalizeServer(
  entry: Record<string, unknown>,
  opts: NormalizeOptions,
): NormalizedServer {
  const command = String(entry.command ?? '');
  const rawArgs = Array.isArray(entry.args) ? (entry.args as unknown[]) : undefined;
  const rawEnv = (entry.env as Record<string, string> | undefined) ?? undefined;

  const args = rawArgs?.map((a) =>
    typeof a === 'string' ? substitute(a, opts.workspaceRoot) : String(a),
  );

  const env = rawEnv
    ? Object.fromEntries(
        Object.entries(rawEnv).map(([k, v]) => [k, substitute(String(v), opts.workspaceRoot)]),
      )
    : undefined;

  const missingVars = unresolvedEnvVars(env);
  const needsUv = UV_COMMANDS.has(command);

  const userDisabled = typeof entry.disabled === 'boolean' ? entry.disabled : undefined;

  let disabled: boolean;
  let comment: string | undefined;

  if (userDisabled !== undefined) {
    disabled = userDisabled;
    comment = typeof entry._comment === 'string' ? entry._comment : undefined;
  } else if (missingVars.length > 0) {
    disabled = true;
    comment =
      `Needs ${missingVars.join(', ')}. Set the variable, then change ` +
      `"disabled" to false.`;
  } else if (needsUv) {
    disabled = true;
    comment =
      'Needs the `uv` Python toolchain (https://docs.astral.sh/uv/). ' +
      'Install it, then change "disabled" to false.';
  } else {
    disabled = false;
  }

  const result: NormalizedServer = {
    command,
    ...(args && args.length > 0 ? { args } : {}),
    ...(env && Object.keys(env).length > 0 ? { env } : {}),
    disabled,
    autoApprove: Array.isArray(entry.autoApprove) ? (entry.autoApprove as string[]) : [],
  };

  if (comment) result._comment = comment;

  return result;
}

/**
 * Normalise a whole `mcpServers` map, folding any legacy `_disabled_<name>`
 * keys back onto their real name with `disabled: true`.
 *
 * A real entry always wins over a legacy one for the same server, so a
 * workspace that has both does not lose the live definition.
 */
export function normalizeServerMap(
  servers: Record<string, unknown>,
  opts: NormalizeOptions,
): Record<string, NormalizedServer> {
  const out: Record<string, NormalizedServer> = {};
  const legacy: Record<string, NormalizedServer> = {};

  for (const [key, value] of Object.entries(servers)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;

    if (key.startsWith(LEGACY_PREFIX)) {
      const realName = key.slice(LEGACY_PREFIX.length);
      // The legacy prefix *was* the disable switch, so honour it as one — and
      // drop any stale _comment telling the user to rename the key.
      const { _comment, ...rest } = entry;
      void _comment;
      legacy[realName] = normalizeServer({ ...rest, disabled: true }, opts);
      if (!legacy[realName]._comment) {
        legacy[realName]._comment =
          'Disabled by default. Provide the required credentials, then change ' +
          '"disabled" to false.';
      }
      continue;
    }

    out[key] = normalizeServer(entry, opts);
  }

  for (const [name, entry] of Object.entries(legacy)) {
    if (!Object.hasOwn(out, name)) out[name] = entry;
  }

  return out;
}

/** Normalise a full config object in place of its `mcpServers` map. */
export function normalizeMCPConfig(
  config: Record<string, unknown>,
  opts: NormalizeOptions,
): Record<string, unknown> {
  const servers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
  return { ...config, mcpServers: normalizeServerMap(servers, opts) };
}
