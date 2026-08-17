/**
 * What build this process is.
 *
 * Two different questions, kept separate on purpose:
 *
 *  - APP_VERSION is the RELEASE — the number a salon owner quotes when they
 *    report a problem, and the one the changelog is written against. It is a
 *    literal in this file rather than read from package.json at runtime,
 *    because the standalone server bundle does not reliably carry package.json
 *    and a version that silently reads "0.1.0" in production is worse than
 *    none. `npm run release` is what edits it.
 *
 *  - commit is the exact source. Deploys come from a container registry rather
 *    than git, so without the stamp there is no link from a running instance
 *    back to a commit; the only alternative was grepping served HTML for
 *    strings you happened to know were new.
 *
 * A release can be rebuilt, so one version may span several commits. Showing
 * both means "which release?" and "exactly which build?" are both answerable.
 */

/** Bumped by scripts/release.sh. Do not edit by hand — the changelog is
 *  generated alongside it and the two must not drift. */
export const APP_VERSION = "1.5.14";

export function appVersion(): {
  version: string;
  commit: string;
  builtAt: string | null;
  released: boolean;
} {
  const commit = process.env.APP_GIT_SHA;
  const builtAt = process.env.APP_BUILT_AT;
  return {
    version: APP_VERSION,
    // "dev" rather than "unknown": an unstamped build genuinely is not a
    // release, and "unknown" invites reading it as a release whose version
    // was merely lost.
    commit: commit && commit !== "unknown" ? commit : "dev",
    builtAt: builtAt && builtAt !== "unknown" ? builtAt : null,
    released: Boolean(commit && commit !== "unknown"),
  };
}

/**
 * What the console footer shows: the release number and nothing else.
 *
 * The commit used to be appended here. It means nothing to a salon owner and
 * read as noise beside a version — the people who need it look at /system or
 * /api/health, where it is still reported in full.
 */
export function versionLabel(): string {
  return `v${appVersion().version}`;
}
