'use client';

import type { PublicQuestion } from '@/shared/contracts';
import { difficultyLabels, GeometryFigure, MathText, questionTypeLabels } from '@/shared/ui/common';
import type { AnswerDraft, AnswerIssue } from './answer-model';

export function QuestionContent({ question }: { question: PublicQuestion }) {
  return (
    <>
      <div className="question-meta">
        <span className="tag green">{questionTypeLabels[question.type]}</span>
        <span className="tag">{difficultyLabels[question.difficulty]}</span>
        <span className="code-label">{question.id}</span>
      </div>
      <h2 className="question-title">{question.title}</h2>
      <MathText className="question-stem">{question.stem}</MathText>
      {question.figures.map((figure) => (
        <GeometryFigure key={figure.id} figure={figure} />
      ))}
    </>
  );
}
export function QuestionRenderer({
  question,
  draft,
  onChange,
  disabled = false,
  issues = [],
  prefix,
}: {
  question: PublicQuestion;
  draft: AnswerDraft;
  onChange: (draft: AnswerDraft) => void;
  disabled?: boolean;
  issues?: AnswerIssue[];
  prefix: string;
}) {
  const errorFor = (field: string) => issues.find((issue) => issue.field === field)?.message;
  const error = (field: string) =>
    errorFor(field) ? (
      <p className="field-error" id={`${prefix}-${field}-error`}>
        {errorFor(field)}
      </p>
    ) : null;
  if ('options' in question && (draft.type === 'SINGLE_CHOICE' || draft.type === 'MULTIPLE_CHOICE'))
    return (
      <fieldset
        className="answer-fieldset"
        disabled={disabled}
        aria-describedby={errorFor('choice') ? `${prefix}-choice-error` : undefined}
      >
        <legend>
          {draft.type === 'SINGLE_CHOICE'
            ? '选择一个答案'
            : '选择所有符合条件的答案（完整选对得分）'}
        </legend>
        <div className="answer-options">
          {question.options.map((option) => {
            const checked =
              draft.type === 'SINGLE_CHOICE'
                ? draft.selectedOptionId === option.id
                : draft.selectedOptionIds.includes(option.id);
            return (
              <label className={`answer-option ${checked ? 'selected' : ''}`} key={option.id}>
                <input
                  type={draft.type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                  name={`${prefix}-choice`}
                  value={option.id}
                  checked={checked}
                  onChange={() =>
                    onChange(
                      draft.type === 'SINGLE_CHOICE'
                        ? { ...draft, selectedOptionId: option.id }
                        : {
                            ...draft,
                            selectedOptionIds: checked
                              ? draft.selectedOptionIds.filter((id) => id !== option.id)
                              : [...draft.selectedOptionIds, option.id],
                          },
                    )
                  }
                />
                <span className="option-letter">{option.id}</span>
                <MathText>{option.text}</MathText>
              </label>
            );
          })}
        </div>
        {error('choice')}
      </fieldset>
    );
  if (question.type === 'FILL_BLANK' && draft.type === 'FILL_BLANK')
    return (
      <fieldset className="answer-fieldset" disabled={disabled}>
        <legend>填写答案</legend>
        <p className="field-hint">根式可输入 √3/3 或 sqrt(3)/3；单位无需重复填写。</p>
        {question.blanks.map((blank) => (
          <div className="blank-group" key={blank.id}>
            <div className="row wrap">
              <strong>{blank.label}</strong>
              {blank.unordered && <span className="tag amber">多个值，顺序不限</span>}
            </div>
            <div className="blank-inputs">
              {Array.from({ length: blank.valueCount }, (_, index) => {
                const field = `${blank.id}-${index}`;
                return (
                  <div className="blank-value" key={field}>
                    <label className="sr-only" htmlFor={`${prefix}-${field}`}>
                      {blank.label}
                      {blank.valueCount > 1 ? `，第 ${index + 1} 个值` : ''}
                    </label>
                    <input
                      id={`${prefix}-${field}`}
                      value={
                        draft.blanks.find((entry) => entry.blankId === blank.id)?.values[index] ??
                        ''
                      }
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          blanks: draft.blanks.map((entry) =>
                            entry.blankId === blank.id
                              ? {
                                  ...entry,
                                  values: entry.values.map((value, i) =>
                                    i === index ? event.target.value : value,
                                  ),
                                }
                              : entry,
                          ),
                        })
                      }
                      maxLength={200}
                      autoComplete="off"
                      placeholder={blank.valueCount > 1 ? `第 ${index + 1} 个值` : '输入答案'}
                      aria-invalid={!!errorFor(field)}
                      aria-describedby={errorFor(field) ? `${prefix}-${field}-error` : undefined}
                    />
                    {blank.unit && <span className="muted">{blank.unit}</span>}
                    {error(field)}
                  </div>
                );
              })}
            </div>
            {error(blank.id)}
          </div>
        ))}
      </fieldset>
    );
  if (question.type === 'JUDGMENT_REASON' && draft.type === 'JUDGMENT_REASON')
    return (
      <fieldset className="answer-fieldset" disabled={disabled}>
        <legend>分别判断并说明理由</legend>
        {question.statements.map((statement, index) => {
          const judgment = draft.judgments.find((entry) => entry.statementId === statement.id)!;
          return (
            <fieldset key={statement.id} className="written-part">
              <legend>判断 {index + 1}</legend>
              <MathText>{statement.prompt}</MathText>
              <div className="judgment-options">
                {[true, false].map((value) => (
                  <label key={String(value)} className="option-pill">
                    <input
                      type="radio"
                      name={`${prefix}-${statement.id}`}
                      checked={judgment.value === value}
                      onChange={() =>
                        onChange({
                          ...draft,
                          judgments: draft.judgments.map((entry) =>
                            entry.statementId === statement.id ? { ...entry, value } : entry,
                          ),
                        })
                      }
                    />
                    {value ? '正确' : '错误'}
                  </label>
                ))}
              </div>
              {error(`${statement.id}-value`)}
              <label className="field">
                <span>判断理由</span>
                <textarea
                  value={judgment.reason}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      judgments: draft.judgments.map((entry) =>
                        entry.statementId === statement.id
                          ? { ...entry, reason: event.target.value }
                          : entry,
                      ),
                    })
                  }
                  maxLength={10000}
                  rows={4}
                  placeholder="写出依据、推理或反例"
                  aria-invalid={!!errorFor(`${statement.id}-reason`)}
                />
              </label>
              {error(`${statement.id}-reason`)}
            </fieldset>
          );
        })}
        <p className="field-hint">判断与理由整体进入复核，请完整写出依据。</p>
      </fieldset>
    );
  if ('parts' in question && 'parts' in draft)
    return (
      <fieldset className="answer-fieldset" disabled={disabled}>
        <legend>写出完整推理过程</legend>
        {question.parts.map((part, index) => (
          <div className="written-part" key={part.id}>
            <label className="field">
              <span className="part-prompt">
                {question.parts.length > 1 ? `（${index + 1}）` : ''}
                {part.prompt}
              </span>
              <textarea
                value={draft.parts.find((entry) => entry.partId === part.id)?.text ?? ''}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    parts: draft.parts.map((entry) =>
                      entry.partId === part.id ? { ...entry, text: event.target.value } : entry,
                    ),
                  })
                }
                maxLength={10000}
                rows={6}
                placeholder="可直接输入数学符号、文字和分步计算过程"
                aria-invalid={!!errorFor(part.id)}
              />
            </label>
            {error(part.id)}
          </div>
        ))}
        <p className="field-hint">每问最多 10000 个字符。提交后保存过程并进入复核。</p>
      </fieldset>
    );
  return (
    <p role="alert" className="notice error">
      本题作答结构异常，请重新读取练习。
    </p>
  );
}
