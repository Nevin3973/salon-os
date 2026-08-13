/**
 * What build this process is.
 *
 * Stamped into the image at build time by scripts/deploy.sh. Deploys come from
 * a container registry rather than git, so without this there is no link from a
 * running instance back to a commit — and the only way to tell what production
 * was serving was to grep the HTML for strings you knew were new.
 *
 * Falls back to "dev" rather than pretending: an unstamped build genuinely is
 * not a release, and labelling it "unknown" invites someone to read it as a
 * release whose version was merely lost.
 */
export function appVersion(): { commit: string; builtAt: string | null; released: boolean } {
  const commit = process.env.APP_GIT_SHA;
  const builtAt = process.env.APP_BUILT_AT;
  return {
    commit: commit && commit !== "unknown" ? commit : "dev",
    builtAt: builtAt && builtAt !== "unknown" ? builtAt : null,
    released: Boolean(commit && commit !== "unknown"),
  };
}
