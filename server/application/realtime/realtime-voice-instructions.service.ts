import { eq } from 'drizzle-orm';
import { getUserAssistantPersona } from '../chat/assistant-persona.service';
import {
  getMeaningfulDurableUserMemoryForUser,
  getLatestMeaningfulHandoffSummaryForUser,
  isChatMemoryEnabledForUser,
} from '../chat/chatMemory.service';
import type { RuntimeCompactState } from '../chat/chatMemory.types';
import { db } from '../../infrastructure/db/client';
import { userPreferences, users } from '../../infrastructure/db/schema';
import { resolveOnboardingReasons } from '../../../shared/dto/onboarding';
import { getAssistantToneMeta } from '../../../shared/constants/assistantTone';
import type { ChatEntryContext } from '../../../shared/dto';
import { resolveAddressing } from '../../../shared/utils/addressing';
import { composeRealtimeVoiceInstructions } from './realtime-voice-instructions';

export async function buildRealtimeVoiceInstructions(params: {
  userId: number;
  entryContext?: ChatEntryContext | null;
  crisisGuidance?: string | null;
  runtimeCompactState?: RuntimeCompactState | null;
}) {
  const rows = await db
    .select({
      name: users.name,
      gender: users.gender,
      locale: users.locale,
      addressing: userPreferences.addressing,
      tone: userPreferences.tone,
      onboardingReason: userPreferences.onboardingReason,
      onboardingReasons: userPreferences.onboardingReasons,
    })
    .from(users)
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(eq(users.id, params.userId))
    .limit(1);

  const profile = rows[0];
  const assistantPersona = await getUserAssistantPersona(params.userId);
  const toneMeta = getAssistantToneMeta(profile?.tone);
  const addressing = resolveAddressing(profile?.addressing);
  const onboardingReasons = resolveOnboardingReasons({
    reasons: profile?.onboardingReasons,
    reason: profile?.onboardingReason,
  });
  const [handoffSummary, durableUserMemory] = (await isChatMemoryEnabledForUser(
    params.userId
  ))
    ? await Promise.all([
        getLatestMeaningfulHandoffSummaryForUser(params.userId),
        getMeaningfulDurableUserMemoryForUser(params.userId),
      ])
    : [null, null];

  return composeRealtimeVoiceInstructions({
    userName: profile?.name,
    userGender: profile?.gender,
    userLocale: profile?.locale,
    assistantPersona,
    addressing,
    toneKey: toneMeta.value,
    toneLabel: toneMeta.label,
    toneDescription: toneMeta.description,
    onboardingReasons,
    entryContext: params.entryContext,
    crisisGuidance: params.crisisGuidance,
    durableUserMemory,
    handoffSummary,
    runtimeCompactState: params.runtimeCompactState,
  });
}
