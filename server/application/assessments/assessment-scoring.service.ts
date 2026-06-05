import type {
  AssessmentDefinition,
  AssessmentResultBand,
} from '@/shared/dto/assessments';

export type AssessmentAnswerInput = {
  questionId: string;
  optionId: string;
};

export type AssessmentScoreResult = {
  totalScore: number;
  band: AssessmentResultBand;
  answers: Array<AssessmentAnswerInput & { value: number }>;
};

export function resolveAssessmentBand(
  assessment: AssessmentDefinition,
  totalScore: number
): AssessmentResultBand | null {
  return (
    assessment.resultBands.find(
      (band) => totalScore >= band.minScore && totalScore <= band.maxScore
    ) ?? null
  );
}

export function scoreAssessmentAnswers(
  assessment: AssessmentDefinition,
  answers: AssessmentAnswerInput[]
): AssessmentScoreResult {
  if (assessment.status !== 'active') {
    throw new Error('Assessment is not active');
  }

  const answerByQuestion = new Map(
    answers.map((answer) => [answer.questionId, answer])
  );
  const optionById = new Map(
    assessment.options.map((option) => [option.id, option])
  );
  const optionValues = assessment.options.map((option) => option.value);
  const minOptionValue = Math.min(...optionValues);
  const maxOptionValue = Math.max(...optionValues);
  const normalizedAnswers: AssessmentScoreResult['answers'] = [];

  for (const question of assessment.questions) {
    const answer = answerByQuestion.get(question.id);

    if (!answer) {
      throw new Error(`Missing answer for question ${question.id}`);
    }

    const option = optionById.get(answer.optionId);
    if (!option) {
      throw new Error(`Unknown option ${answer.optionId}`);
    }

    // Для шкал поддержки высокий выбранный ответ на reverse-пунктах означает
    // больше давления/самокритики, поэтому в итог кладём перевёрнутый балл.
    const value = question.reverseScored
      ? minOptionValue + maxOptionValue - option.value
      : option.value;

    normalizedAnswers.push({
      questionId: question.id,
      optionId: option.id,
      value,
    });
  }

  const totalScore = normalizedAnswers.reduce(
    (sum, answer) => sum + answer.value,
    0
  );
  const band = resolveAssessmentBand(assessment, totalScore);

  if (!band) {
    throw new Error(`No result band for score ${totalScore}`);
  }

  return {
    totalScore,
    band,
    answers: normalizedAnswers,
  };
}
