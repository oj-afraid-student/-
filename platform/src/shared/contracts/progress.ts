export interface ProgressCounts {
  attemptCount: number;
  gradedCount: number;
  correctCount: number;
  accuracy: number | null;
}

export interface KnowledgeProgress extends ProgressCounts {
  id: string;
  title: string;
  unitId: string | null;
  unitTitle: string | null;
  status: 'NO_ATTEMPTS' | 'INSUFFICIENT_EVIDENCE' | 'ENOUGH_EVIDENCE';
  latestSubmissionId: string | null;
}

export interface StudentProgress {
  submissionCount: number;
  minimumGradedCount: number;
  overall: ProgressCounts;
  points: KnowledgeProgress[];
}
