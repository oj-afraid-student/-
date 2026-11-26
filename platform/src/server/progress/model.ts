import 'server-only';
import type { KnowledgeProgress, ProgressCounts, StudentProgress } from '@/shared/contracts';
import directory from '../ai/geometry-directory.json' with { type: 'json' };

export interface ProgressAttempt {
  submissionId: string;
  questionId: string;
  knowledgeIds: string[];
  isCorrect: boolean | null;
}

export interface ProgressUnit {
  id: string;
  title: string;
  knowledgeIds: string[] | null;
}

const minimumGradedCount = 3;
const titles = new Map(
  directory.flatMap((unit) => unit.points.map(({ id, title }) => [id, title])),
);
const emptyCounts = () => ({ attemptCount: 0, gradedCount: 0, correctCount: 0 });
type Counts = ReturnType<typeof emptyCounts>;

function countAnswer(counts: Counts, isCorrect: boolean | null) {
  counts.attemptCount++;
  if (isCorrect !== null) counts.gradedCount++;
  if (isCorrect === true) counts.correctCount++;
}

function withAccuracy({ attemptCount, gradedCount, correctCount }: Counts): ProgressCounts {
  return {
    attemptCount,
    gradedCount,
    correctCount,
    accuracy: gradedCount ? correctCount / gradedCount : null,
  };
}

// Both callers supply the submitted answers grouped by submission, newest first.
export function buildStudentProgress(
  units: ProgressUnit[],
  attempts: Iterable<ProgressAttempt>,
): StudentProgress {
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const unitByPoint = new Map<string, ProgressUnit>();
  const tallies = new Map<string, Counts & { latestSubmissionId: string | null }>();
  for (const unit of units) {
    for (const id of unit.knowledgeIds ?? []) {
      unitByPoint.set(id, unit);
      tallies.set(id, { ...emptyCounts(), latestSubmissionId: null });
    }
  }

  const overall = emptyCounts();
  let submissionCount = 0;
  let currentSubmissionId: string | null = null;
  const seenQuestions = new Set<string>();
  for (const attempt of attempts) {
    if (currentSubmissionId !== attempt.submissionId) {
      currentSubmissionId = attempt.submissionId;
      submissionCount++;
      seenQuestions.clear();
    }
    if (seenQuestions.has(attempt.questionId)) continue;
    seenQuestions.add(attempt.questionId);
    countAnswer(overall, attempt.isCorrect);
    for (const id of new Set(attempt.knowledgeIds)) {
      const counts = tallies.get(id) ?? { ...emptyCounts(), latestSubmissionId: null };
      countAnswer(counts, attempt.isCorrect);
      counts.latestSubmissionId ??= attempt.submissionId;
      tallies.set(id, counts);
    }
  }

  const points = Array.from(tallies, ([id, counts]): KnowledgeProgress => {
    // 001 → 002 answers carry the old unit ID as their original knowledge tag.
    const unit = unitByPoint.get(id) ?? unitsById.get(id);
    return {
      ...withAccuracy(counts),
      id,
      title: titles.get(id) ?? unitsById.get(id)?.title ?? id,
      unitId: unit?.id ?? null,
      unitTitle: unit?.title ?? null,
      status: !counts.attemptCount
        ? 'NO_ATTEMPTS'
        : counts.gradedCount < minimumGradedCount
          ? 'INSUFFICIENT_EVIDENCE'
          : 'ENOUGH_EVIDENCE',
      latestSubmissionId: counts.latestSubmissionId,
    };
  });
  return { submissionCount, minimumGradedCount, overall: withAccuracy(overall), points };
}
