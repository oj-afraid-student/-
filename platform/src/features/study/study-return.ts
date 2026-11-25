'use client';

import type { CandidateDiagram } from '@/shared/candidate-diagram';
import type { StudyGuidance, StudyProblem } from '@/shared/study-contract';
import type { requestKnowledgeTags } from '@/shared/api/knowledge-tags';

export const STUDY_KNOWLEDGE_ANCHOR = 'study-knowledge-title';

export interface StudyKnowledgeSelection {
  result: Awaited<ReturnType<typeof requestKnowledgeTags>>;
  selected: string[];
}

interface StudyReturnDraft {
  text: string;
  photo: string;
  photoName: string;
  problem: StudyProblem;
  selectedQuestion: number;
  answers: Record<number, string>;
  followup: string;
  guidance: StudyGuidance | null;
  redrawn: { diagram: CandidateDiagram; photo: string } | null;
  knowledge: StudyKnowledgeSelection;
  anchorTop: number;
}

// Keep one same-tab snapshot for the graph round trip, scoped to the signed-in user.
let pendingReturn: { id: string; userId: string; draft: StudyReturnDraft } | undefined;

export function saveStudyReturn(userId: string, draft: StudyReturnDraft) {
  const id = crypto.randomUUID();
  pendingReturn = { id, userId, draft };
  return id;
}

export function readStudyReturn(userId: string | undefined, id: string | null) {
  return pendingReturn?.id === id && pendingReturn.userId === userId
    ? pendingReturn.draft
    : undefined;
}
