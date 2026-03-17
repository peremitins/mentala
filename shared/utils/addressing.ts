import type { Addressing } from '../dto/notifications';

export interface AddressingText<T = string> {
  informal: T;
  formal: T;
}

export const DEFAULT_ADDRESSING: Addressing = 'informal';

export function resolveAddressing(
  value?: Addressing | string | null
): Addressing {
  return value === 'formal' ? 'formal' : DEFAULT_ADDRESSING;
}

export function isFormalAddressing(
  value?: Addressing | string | null
): boolean {
  return resolveAddressing(value) === 'formal';
}

export function pickAddressingText<T>(
  value: Addressing | string | null | undefined,
  text: AddressingText<T>
): T {
  return isFormalAddressing(value) ? text.formal : text.informal;
}
