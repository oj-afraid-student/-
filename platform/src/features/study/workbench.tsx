'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MathText, PageHead } from '@/shared/ui/common';
import { request, errorMessage } from '@/shared/api/client';
import { AI_REQUEST_TIMEOUT_MS, HINT_REQUEST_TIMEOUT_MS } from '@/shared/api/timeouts';
import { preparePhoto } from '@/shared/prepare-photo';
import type { StudyProblem, StudyGuidance } from '@/shared/study-contract';
import { StudyKnowledgeLinks } from './study-knowledge-links';
import './workbench.css';
import { VisualizeButton } from '@/features/geometry/visualize-button';
import { DiagramRedraw } from '@/shared/ui/diagram-redraw';
import type { CandidateDiagram } from '@/shared/candidate-diagram';
export function StudyWorkbench() {
  const router = useRouter();
  const [text, setText] = useState(''),
    [photo, setPhoto] = useState(''),
    [photoName, setPhotoName] = useState(''),
    [preparingPhoto, setPreparingPhoto] = useState(false),
    [photoError, setPhotoError] = useState(''),
    [problem, setProblem] = useState<StudyProblem | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [selected, setSelected] = useState(0),
    [answers, setAnswers] = useState<Record<number, string>>({}),
    [followup, setFollowup] = useState(''),
    [guidance, setGuidance] = useState<StudyGuidance | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const [redrawn, setRedrawn] = useState<{ diagram: CandidateDiagram; photo: string } | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function choose(file: File) {
    setBusy(true);
    setPreparingPhoto(true);
    setPhotoError('');
    setError('');
    try {
      setPhoto(await preparePhoto(file));
      setPhotoName(file.name);
      setRedrawn(null);
      setProblem(null);
      setConfirmed(false);
      setGuidance(null);
    } catch (e) {
      setPhotoError(errorMessage(e) + (photo ? ' 原先选好的图片仍保留。' : ''));
    } finally {
      setPreparingPhoto(false);
      setBusy(false);
    }
  }
  async function run(action: 'recognize' | 'hint') {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    if (action === 'recognize') setGuidance(null);
    try {
      if (action === 'recognize') {
        const result = await request<StudyProblem>('/api/v1', '/ai/study', {
          method: 'POST',
          body: { action, text, ...(photo ? { photo } : {}) },
          signal: controller.signal,
          timeoutMs: AI_REQUEST_TIMEOUT_MS * 2,
        });
        setProblem(result);
        setRedrawn(null);
        setConfirmed(false);
        setSelected(0);
        setAnswers({});
        setFollowup('');
      } else if (problem) {
        setGuidance(
          await request<StudyGuidance>('/api/v1', '/ai/study', {
            method: 'POST',
            body: {
              action,
              problem,
              question: selected,
              progress: answers[selected] || '',
              followup,
              previousProgress: Object.entries(answers)
                .filter(([index, value]) => Number(index) < selected && value.trim())
                .sort(([left], [right]) => Number(left) - Number(right))
                .map(([index, progress]) => ({ question: Number(index), progress })),
            },
            signal: controller.signal,
            timeoutMs: HINT_REQUEST_TIMEOUT_MS,
          }),
        );
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(errorMessage(e));
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function edit(next: StudyProblem) {
    setRedrawn(null);
    setProblem(next);
    setConfirmed(false);
    setGuidance(null);
  }
  return (
    <>
      <PageHead
        eyebrow="AI / 自主学题"
        title="拍照学题"
        description="上传自己的题目，核对条件，再从一个分问开始思考。"
      />
      <div className="study-grid">
        <section className="panel study-stack">
          <h2>1 · 导入题目</h2>
          <label className="field">
            <span>题目文字或补充说明</span>
            <textarea
              rows={5}
              placeholder="可输入完整题目；图片中有多题时，可写“只识别第16题”或说明主体位置。"
              maxLength={12000}
              value={text}
              disabled={busy}
              onChange={(e) => {
                setText(e.target.value);
                setProblem(null);
                setGuidance(null);
                setConfirmed(false);
              }}
            />
          </label>
          <div className="study-upload">
            <label className="field">
              <span>上传题目图片</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void choose(f);
                }}
              />
            </label>
            <label className="field">
              <span>手机拍照</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void choose(f);
                }}
              />
            </label>
          </div>
          <p className="field-hint">
            支持 JPG / PNG / WebP，最大 15 MB。照片将发送给模型识别；本页内容尚不保存，刷新会清空。
          </p>
          {preparingPhoto && <p role="status">正在处理图片，请稍候…</p>}
          {photoError && (
            <p role="alert" className="field-error">
              {photoError}
            </p>
          )}
          {photo && (
            <div className="study-photo-preview">
              <p role="status">
                <strong>图片已选择，可以识别</strong>
                <br />
                <span>{photoName}</span>
              </p>
              <Image
                src={photo}
                alt={'待识别题图：' + photoName}
                width={600}
                height={400}
                unoptimized
                className="study-photo-image"
              />
              <p className="field-hint">点击下方「识别并整理题目」后，图片才会发送给 AI。</p>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setPhoto('');
                  setPhotoName('');
                  setPhotoError('');
                  setProblem(null);
                  setGuidance(null);
                  setConfirmed(false);
                }}
              >
                移除照片
              </button>
            </div>
          )}
          <button
            className="btn primary"
            disabled={busy || (!text.trim() && !photo)}
            onClick={() => void run('recognize')}
          >
            识别并整理题目
          </button>
          {error && !problem && (
            <p role="alert" className="field-error">
              {error} 已选择的图片和文字会保留，可直接重新识别。
            </p>
          )}
          {problem && (
            <>
              <h2>2 · 核对题目</h2>
              {!!problem.supplements?.length && (
                <div className="study-guidance">
                  <h3>AI 对照题图补充的条件</h3>
                  <p>以下条件已加入下方已知条件；请核对图像依据，错误时可直接编辑。</p>
                  <ul>
                    {problem.supplements.map((a, i) => (
                      <li key={i}>
                        <strong>{a.text}</strong>
                        <br />
                        {a.evidence}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p>请对照原题修改识别结果，尤其是符号、图示关系和分问。AI 整理结果尚未经数学验证。</p>
              <label className="field">
                <span>完整题干</span>
                <textarea
                  rows={7}
                  value={problem.text}
                  maxLength={10000}
                  disabled={busy}
                  onChange={(e) => edit({ ...problem, text: e.target.value })}
                />
              </label>
              <label className="field">
                <span>已知条件（每行一项）</span>
                <textarea
                  rows={5}
                  value={problem.conditions.join('\n')}
                  disabled={busy}
                  onChange={(e) => edit({ ...problem, conditions: e.target.value.split('\n') })}
                />
              </label>
              <label className="field">
                <span>分问（每行一问，可增删；修改会清空各问作答）</span>
                <textarea
                  rows={4}
                  value={problem.questions.join('\n')}
                  disabled={busy}
                  onChange={(e) => {
                    edit({ ...problem, questions: e.target.value.split('\n') });
                    setAnswers({});
                    setSelected(0);
                  }}
                />
              </label>
              <label className="field">
                <span>待核对项（解决后删除对应行）</span>
                <textarea
                  value={problem.uncertainties.join('\n')}
                  disabled={busy}
                  onChange={(e) =>
                    edit({ ...problem, uncertainties: e.target.value.split('\n').filter(Boolean) })
                  }
                />
              </label>
              {problem.uncertainties.length > 0 && (
                <div role="note">
                  <strong>需要核对</strong>
                  <ul>
                    {problem.uncertainties.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => {
                    setConfirmed(e.target.checked);
                    setGuidance(null);
                  }}
                />{' '}
                我已核对题干、条件与分问，已修正或明确标注不确定项
              </label>
              {confirmed && <StudyKnowledgeLinks problem={problem} disabled={busy} />}
            </>
          )}
        </section>
        <section className="panel study-stack">
          <h2>3 · 分步探索</h2>

          {!problem ? (
            <p>
              导入题目后，这里会根据分问生成学习入口。支持证明、计算、选择和开放问题的文字指导。
            </p>
          ) : (
            <>
              <div className="study-tabs">
                {problem.questions.map((q, i) => (
                  <button
                    key={i}
                    className="btn"
                    aria-pressed={selected === i}
                    disabled={busy}
                    onClick={() => {
                      setSelected(i);
                      setGuidance(null);
                      setFollowup('');
                    }}
                  >
                    第 {i + 1} 问
                  </button>
                ))}
              </div>
              <h3>{problem.questions[selected]}</h3>
              <label className="field">
                <span>我的思路与已完成步骤</span>
                <textarea
                  rows={8}
                  maxLength={12000}
                  value={answers[selected] || ''}
                  disabled={busy}
                  onChange={(e) => {
                    setAnswers({ ...answers, [selected]: e.target.value });
                    setGuidance(null);
                  }}
                />
              </label>
              <label className="field">
                <span>我想追问（可选）</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={followup}
                  disabled={busy}
                  onChange={(e) => setFollowup(e.target.value)}
                  placeholder="例如：为什么可以作这条辅助线？"
                />
              </label>
              <button
                className="btn primary"
                disabled={busy || !confirmed}
                onClick={() => void run('hint')}
              >
                给我一个下一步提示
              </button>
              {!confirmed && <p>先在左侧核对并确认题目。</p>}
              {!guidance && (
                <div>
                  <button className="btn" type="button" disabled>
                    AI 可视化 · 前往几何实验室
                  </button>
                  <p className="field-hint">
                    先核对题目并点击「给我一个下一步提示」，提示成功返回后即可进入本题的三维可视化。
                  </p>
                </div>
              )}
              {guidance && (
                <div className="study-guidance" aria-live="polite">
                  <h3>下一步</h3>
                  <MathText>{guidance.hint}</MathText>
                  <VisualizeButton
                    photo={photo || undefined}
                    problem={problem}
                    hint={guidance.hint}
                    question={selected}
                    progress={answers[selected] || ''}
                  />
                  <h3>试着想一想</h3>
                  <MathText>{guidance.check}</MathText>
                  {guidance.limitations.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="field-hint">
            三维探索按受支持模板生成，不支持的题目保留文字学习；AI 提示可能出错，请结合原题核对。
          </p>
          {problem && confirmed && (
            <DiagramRedraw
              key={problem.text}
              text={problem.text}
              photo={photo || undefined}
              initial={redrawn?.diagram}
              disabled={busy}
              onBusyChange={setBusy}
              onApply={(diagram, photo) => setRedrawn({ diagram, photo })}
              onRestore={photo ? () => setRedrawn(null) : undefined}
            />
          )}
          {problem && confirmed && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                sessionStorage.setItem(
                  'zhixu-upload-review',
                  JSON.stringify({
                    ...problem,
                    photo: redrawn?.photo ?? (photo || undefined),
                    originalPhoto: photo || undefined,
                    editableDiagram: redrawn?.diagram,
                  }),
                );
                router.push('/practice/candidates');
              }}
            >
              自动标注并进入题库复核
            </button>
          )}
          {busy && <p role="status">正在识别题目或复核图示，请稍候…</p>}
          {error && problem && <p role="alert">{error}</p>}
        </section>
      </div>
    </>
  );
}
