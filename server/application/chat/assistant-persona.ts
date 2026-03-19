import {
  resolveAssistantVoicePresentation,
  resolveAssistantVoiceCatalogItem,
  type AssistantVoiceGender,
} from '../../../shared/constants/assistantVoiceCatalog';

export type AssistantPersona = {
  voice: string;
  voiceLabel: string;
  gender: AssistantVoiceGender;
  displayName: 'Mentala';
};

export function resolveAssistantPersonaFromVoice(
  voice?: string | null,
  locale?: string | null
): AssistantPersona {
  const item = resolveAssistantVoiceCatalogItem(voice);
  const presentation = resolveAssistantVoicePresentation(voice, locale);

  return {
    voice: item.id,
    voiceLabel: presentation.label,
    gender: item.gender,
    displayName: 'Mentala',
  };
}

export function buildAssistantSettingsProjection(
  voice?: string | null,
  locale?: string | null
) {
  const persona = resolveAssistantPersonaFromVoice(voice, locale);

  return {
    voice: persona.voice,
    voiceLabel: persona.voiceLabel,
    voiceGender: persona.gender,
  };
}

export function buildAssistantPersonaInstruction(params: {
  assistantGender?: AssistantVoiceGender | null;
  assistantDisplayName?: string | null;
}): string {
  const gender = params.assistantGender;
  if (gender !== 'female' && gender !== 'male') {
    return '';
  }

  const displayName = String(params.assistantDisplayName || 'Mentala').trim();
  const genderLabel = gender === 'female' ? 'женская' : 'мужская';
  const selfReferenceInstruction =
    gender === 'female'
      ? 'Если говоришь о себе в первом лице по-русски, используй женские формы: «я заметила», «я подумала», «я сделала».'
      : 'Если говоришь о себе в первом лице по-русски, используй мужские формы: «я заметил», «я подумал», «я сделал».';

  return `Персона ассистента:
 Ты — ассистент ${displayName}.
 Твоя продуктовая голосовая персона: ${genderLabel}.
 ${selfReferenceInstruction}
 Не подчеркивай свой пол без необходимости.
 Не выдумывай биографию, телесность или личный опыт.`;
}
