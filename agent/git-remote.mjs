function availableBranchMessage(branches) {
  const visible = branches.slice(0, 8).map((branch) => `"${branch}"`).join(', ');
  return branches.length > 8 ? `${visible}, and ${branches.length - 8} more` : visible;
}

export function parseRemoteReferences(output) {
  const branches = new Map();
  let defaultBranch = null;
  let headRevision = null;

  for (const line of String(output || '').split(/\r?\n/)) {
    const symbolicHead = line.match(/^ref:\s+refs\/heads\/(.+?)\s+HEAD$/);
    if (symbolicHead) {
      defaultBranch = symbolicHead[1];
      continue;
    }

    const reference = line.match(/^([0-9a-fA-F]{40,64})\s+(.+)$/);
    if (!reference) continue;
    if (reference[2] === 'HEAD') headRevision = reference[1];
    if (reference[2].startsWith('refs/heads/')) branches.set(reference[2].slice('refs/heads/'.length), reference[1]);
  }

  return { defaultBranch, headRevision, branches };
}

export function selectRemoteBranch(references, requestedBranch = '') {
  const branches = [...references.branches.keys()].sort((left, right) => left.localeCompare(right));
  const requested = String(requestedBranch || '').trim();

  if (!branches.length) {
    throw new Error('The Git repository has no commits or branches yet. In Lovable, connect GitHub or GitLab and publish the project to Git, then retry the deployment.');
  }

  if (requested && references.branches.has(requested)) return requested;

  // Older dashboard and MCP clients submitted "main" even when the field was never
  // intentionally selected. Preserve those launches by treating it as auto-detect.
  if (requested && requested !== 'main') {
    throw new Error(`The branch "${requested}" was not found. Available branches: ${availableBranchMessage(branches)}.`);
  }

  if (references.defaultBranch && references.branches.has(references.defaultBranch)) return references.defaultBranch;
  if (branches.length === 1) return branches[0];
  if (references.branches.has('main')) return 'main';
  if (references.branches.has('master')) return 'master';

  throw new Error(`The repository default branch could not be detected. Choose one of these branches: ${availableBranchMessage(branches)}.`);
}
