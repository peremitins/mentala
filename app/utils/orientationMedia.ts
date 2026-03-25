interface OrientationMediaOptions {
  portraitFirst?: boolean;
}

export function buildOrientationMediaVariants(path?: string | null) {
  if (!path) return [];

  const dotIndex = path.lastIndexOf('.');
  if (dotIndex === -1) return [path];

  const name = path.slice(0, dotIndex);
  const ext = path.slice(dotIndex);

  // Поддерживаем оба соглашения по именованию portrait-ассетов:
  // 1) `file-portrait.ext`
  // 2) `portrait-file.ext`
  const suffixedPortrait = `${name}-portrait${ext}`;
  const prefixedPortrait = name.replace(/\/([^/]+)$/, '/portrait-$1') + ext;

  return Array.from(
    new Set(
      [suffixedPortrait, prefixedPortrait, path].filter(
        (value): value is string => Boolean(value)
      )
    )
  );
}

export function pickOrientationMediaPath(
  path?: string | null,
  options: OrientationMediaOptions = {}
) {
  const variants = buildOrientationMediaVariants(path);

  if (!variants.length) return '';

  const [portrait1, portrait2, base] = [
    variants[0],
    variants[1],
    variants[2] || variants[variants.length - 1],
  ];

  const ordered = options.portraitFirst
    ? [portrait1, portrait2, base]
    : [base, portrait1, portrait2];

  return ordered.find(Boolean) || '';
}

export function getOrientationMediaCandidates(
  path?: string | null,
  options: OrientationMediaOptions = {}
) {
  const variants = buildOrientationMediaVariants(path);

  if (!variants.length) return [];

  const [portrait1, portrait2, base] = [
    variants[0],
    variants[1],
    variants[2] || variants[variants.length - 1],
  ];

  return (
    options.portraitFirst
      ? [portrait1, portrait2, base]
      : [base, portrait1, portrait2]
  ).filter((value): value is string => Boolean(value));
}
