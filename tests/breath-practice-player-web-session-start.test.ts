import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentPath = fileURLToPath(
  new URL(
    '../app/components/breath-practices/BreathPracticePlayer.vue',
    import.meta.url
  )
);

describe('BreathPracticePlayer web session start', () => {
  it('не обходит startSession в web-режиме дыхательной практики', () => {
    const source = readFileSync(componentPath, 'utf8');

    expect(source).toContain('return startSession({');
    expect(source).not.toContain(
      'if (!isNativeSessionEnabled()) {\n      return Date.now();\n    }'
    );
  });
});
