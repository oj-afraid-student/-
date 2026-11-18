'use client';
import { useEffect, useRef, useState } from 'react';
import { PageHead } from '@/shared/ui/common';
import { request, errorMessage } from '@/shared/api/client';
import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/timeouts';
import { preparePhoto } from '@/shared/prepare-photo';
import type { StudyProblem, StudyGuidance } from '@/shared/study-contract';
import './workbench.css';
export function StudyWorkbench() {
  const [text, setText] = useState(''),
    [photo, setPhoto] = useState(''),
    [problem, setProblem] = useState<StudyProblem | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [selected, setSelected] = useState(0),
    [answers, setAnswers] = useState<Record<number, string>>({}),
    [followup, setFollowup] = useState(''),
    [guidance, setGuidance] = useState<StudyGuidance | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function choose(file: File) {
    setBusy(true);
    setError('');
    try {
      setPhoto(await preparePhoto(file));
      setProblem(null);
      setConfirmed(false);
      setGuidance(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function run(action: 'recognize' | 'hint') {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    setGuidance(null);
    try {
      if (action === 'recognize') {
        const result = await request<StudyProblem>('/api/v1', '/ai/study', {
          method: 'POST',
          body: { action, text, ...(photo ? { photo } : {}) },
          signal: controller.signal,
          timeoutMs: AI_REQUEST_TIMEOUT_MS,
        });
        setProblem(result);
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
            },
            signal: controller.signal,
            timeoutMs: AI_REQUEST_TIMEOUT_MS,
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
          {photo && (
            <>
              <a href={photo} target="_blank" rel="noreferrer">
                查看原始题图
              </a>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setPhoto('');
                  setConfirmed(false);
                }}
              >
                移除照片
              </button>
            </>
          )}
          <button
            className="btn primary"
            disabled={busy || (!text.trim() && !photo)}
            onClick={() => void run('recognize')}
          >
            识别并整理题目
          </button>
          {problem && (
            <>
              <h2>2 · 核对题目</h2>
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
              {guidance && (
                <div className="study-guidance" aria-live="polite">
                  <h3>下一步</h3>
                  <p>{guidance.hint}</p>
                  <h3>试着想一想</h3>
                  <p>{guidance.check}</p>
                  {guidance.limitations.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="field-hint">
            当前为文字学习模式。任意上传题目尚不自动生成三维模型；几何实验室中的固定演示不能视为本题模型。AI
            提示可能出错，请结合原题核对。
          </p>
          {busy && <p role="status">正在处理，请稍候…</p>}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </>
  );
}
