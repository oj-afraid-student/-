'use client';

import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/shared/api/client';
import { requestKnowledgeTags } from '@/shared/api/knowledge-tags';
import type { StudyProblem } from '@/shared/study-contract';
import { STUDY_KNOWLEDGE_ANCHOR, type StudyKnowledgeSelection } from './study-return';

export function StudyKnowledgeLinks({
  problem,
  disabled,
  initial,
  onLocate,
}: {
  problem: StudyProblem;
  disabled: boolean;
  initial?: StudyKnowledgeSelection;
  onLocate: (selection: StudyKnowledgeSelection) => void;
}) {
  const [result, setResult] = useState<StudyKnowledgeSelection['result'] | null>(
    initial?.result ?? null,
  );
  const [selected, setSelected] = useState<string[]>(initial?.selected ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function recommend() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError('');
    try {
      const data = await requestKnowledgeTags(problem.text, problem.questions, controller.signal);
      if (!controller.signal.aborted) {
        setResult(data);
        setSelected(data.tags.map((tag) => tag.id));
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <section className="study-knowledge" aria-labelledby={STUDY_KNOWLEDGE_ANCHOR}>
      <div className="row wrap">
        <h3 id={STUDY_KNOWLEDGE_ANCHOR}>本题涉及的知识点</h3>
        <button
          className="btn small"
          type="button"
          onClick={() => void recommend()}
          disabled={disabled || loading}
        >
          {result ? '重新推荐标签' : '推荐知识点标签'}
        </button>
      </div>
      <p className="field-hint">根据已核对的题干和分问推荐，请核对后选择要定位的知识点。</p>
      {loading && <p role="status">正在匹配知识点…</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {result &&
        (result.tags.length ? (
          <fieldset className="study-knowledge-tags" disabled={loading}>
            <legend>推荐标签</legend>
            {result.tags.map(({ id, title, reason }) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((ids) =>
                      checked ? [...ids, id] : ids.filter((entry) => entry !== id),
                    );
                  }}
                />
                <span>
                  <strong>{title}</strong>
                  <small>{reason}</small>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p role="status">暂未匹配到知识点。可检查题干和分问后重新推荐。</p>
        ))}
      <button
        className="btn primary"
        type="button"
        disabled={disabled || loading || !result || selected.length === 0}
        onClick={() => result && onLocate({ result, selected })}
      >
        查看本题涉及知识点在知识图谱中位置
      </button>
    </section>
  );
}
