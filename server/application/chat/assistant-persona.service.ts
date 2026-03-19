import { readChatSettings } from '../../utils/storage';
import {
  buildAssistantSettingsProjection,
  resolveAssistantPersonaFromVoice,
} from './assistant-persona';

export {
  buildAssistantPersonaInstruction,
  buildAssistantSettingsProjection,
  resolveAssistantPersonaFromVoice,
  type AssistantPersona,
} from './assistant-persona';

export async function getUserAssistantPersona(userId: number | string) {
  const settings = await readChatSettings(String(userId));
  return resolveAssistantPersonaFromVoice(settings.assistantVoice);
}

export async function getUserAssistantSettingsProjection(
  userId: number | string,
  locale?: string | null
) {
  const settings = await readChatSettings(String(userId));
  return buildAssistantSettingsProjection(settings.assistantVoice, locale);
}
