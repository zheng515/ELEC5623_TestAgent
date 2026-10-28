import { createHash } from 'node:crypto';

export const projectTextFile = (name: string) => /\.(py|[cm]?[jt]sx?|md|rst|txt|toml|cfg|ini|json|lock|html?|css|csv|xml|ya?ml|metadata|svg)$/.test(name) || /(?:^|\/)(?:LICENSE(?:[.][\w-]+)?|COPYING|NOTICE)$/.test(name);
export const projectAssetFile = (name: string) => /(?:^|\/)(?:tests?|fixtures?|data|assets?|static|shared|resources?|templates?)\//.test(name) && !/\.(?:pyc|pyo|so|dylib|dll|exe|sh|bat|ps1|zip|tar|gz|whl)$/.test(name);

// Keep legacy all-text fingerprints unchanged. Binary assets bind exact bytes,
// without decoding them or including their contents in model context.
export function projectFingerprint(entries: [string, Buffer][]) {
  const values = entries.map(([name, bytes]) => [name, projectTextFile(name)
    ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    : { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }]);
  return createHash('sha256').update(JSON.stringify(values.sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0))).digest('hex');
}
