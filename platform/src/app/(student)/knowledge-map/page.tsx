import { KnowledgeMap } from '@/features/knowledge-map/knowledge-map';
import {
  STUDY_RETURN_PARAM,
  UPLOAD_TOPIC_LIMIT,
  UPLOAD_TOPIC_PARAM,
} from '@/shared/api/knowledge-tags';
import '@/features/knowledge-map/knowledge-map.css';
export default async function KnowledgeMapPage({
  searchParams,
}: {
  searchParams: Promise<{
    node?: string;
    question?: string;
    topic?: string | string[];
    studyReturn?: string;
  }>;
}) {
  const { node, question, topic, studyReturn } = await searchParams;
  const query = new URLSearchParams();
  if (typeof node === 'string') query.set('node', node);
  if (typeof question === 'string') query.set('question', question);
  if (typeof studyReturn === 'string') query.set(STUDY_RETURN_PARAM, studyReturn);
  for (const code of (typeof topic === 'string' ? [topic] : (topic ?? [])).slice(
    0,
    UPLOAD_TOPIC_LIMIT,
  ))
    query.append(UPLOAD_TOPIC_PARAM, code);
  return <KnowledgeMap initialQuery={query.size ? '?' + query.toString() : ''} />;
}
