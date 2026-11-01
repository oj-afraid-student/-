'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth/session';
import { ApiClientError, errorMessage } from '@/shared/api/client';
import { useResource } from '@/shared/api/use-resource';
import {
  EmptyState,
  ErrorState,
  GeometryFigure,
  LoadingState,
  MathText,
  PageHead,
} from '@/shared/ui/common';
import { GeometryArt, Icon } from '@/shared/ui/icons';
import type { KnowledgeSummary } from '@/shared/contracts';

export function LearningList() {
  const { api, user } = useSession();
  const loader = useCallback((signal: AbortSignal) => api.knowledgePoints(signal), [api]);
  const state = useResource(loader);
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} retry={state.retry} />;
  const units = [...(state.data ?? [])].sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHead
        eyebrow="LEARNING / 知识学习"
        title={`你好，${user?.username ?? '同学'}`}
        description="从空间关系出发，把条件、图形与推理连在一起。"
      />
      <section className="learning-hero">
        <div>
          <span className="tag hero-tag">高中数学 · 立体几何</span>
          <h2>
            看懂一个图形，
            <br />
            建立一条推理路径。
          </h2>
          <p>
            先理解概念成立的条件，再用练习检验思考。
            <br />
            每一次作答，都是连接知识的一步。
          </p>
          <Link className="btn primary" href="/practice/new">
            开始自主练习
            <Icon name="arrow" />
          </Link>
        </div>
        <GeometryArt />
      </section>
      <div className="learning-strip">
        <span>
          <b>{units.filter((unit) => !unit.extension).length}</b> 核心单元
        </span>
        <span>
          <b>{units.filter((unit) => unit.extension).length}</b> 拓展单元
        </span>
        <span>
          <Icon name="book" />
          概念 · 条件 · 例题 · 易错点
        </span>
      </div>
      {!units.length ? (
        <EmptyState title="暂时没有可学习的单元">课程内容准备完成后会出现在这里。</EmptyState>
      ) : (
        <>
          {[false, true].map((extension) => (
            <section key={String(extension)}>
              <div className="section-head">
                <div>
                  <p className="eyebrow">
                    {extension ? 'EXPLORE FURTHER' : 'BUILD THE FOUNDATION'}
                  </p>
                  <h2>{extension ? '拓展与综合' : '从基础建立空间观念'}</h2>
                </div>
                <span className="muted small">
                  {extension
                    ? '把已有关系用于更复杂的问题'
                    : '按目录学习，也可以选择需要巩固的单元'}
                </span>
              </div>
              <div className="unit-grid">
                {units
                  .filter((unit) => unit.extension === extension)
                  .map((unit) => (
                    <UnitCard key={unit.id} unit={unit} />
                  ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
function UnitCard({ unit }: { unit: KnowledgeSummary }) {
  return (
    <article className={`panel unit-card ${unit.extension ? 'extension' : ''}`}>
      <div className="unit-card-top">
        <span className="unit-symbol">
          <Icon name={unit.extension ? 'diamond' : 'book'} />
        </span>
        <span className="code-label">{unit.id}</span>
      </div>
      <span className="tag">
        {unit.extension ? '拓展单元' : `核心单元 ${String(unit.order).padStart(2, '0')}`}
      </span>
      <h3>{unit.title}</h3>
      <p>{unit.summary}</p>
      <div className="unit-card-meta">
        <span>{unit.knowledgeIds.length} 个知识点</span>
        <span>{unit.questionIds.length} 道关联练习</span>
      </div>
      <Link className="unit-link" href={`/learn/${encodeURIComponent(unit.id)}`}>
        进入学习
        <Icon name="arrow" />
      </Link>
    </article>
  );
}
export function KnowledgeView({ id }: { id: string }) {
  const { api, expire } = useSession();
  const router = useRouter();
  const loader = useCallback((signal: AbortSignal) => api.knowledgePoint(id, signal), [api, id]);
  const state = useResource(loader);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function practice() {
    setBusy(true);
    setError('');
    try {
      const result = await api.createPractice({ mode: 'FILTERED', knowledgePointId: id });
      router.push(`/practice/${encodeURIComponent(result.id)}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) expire();
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} retry={state.retry} />;
  const unit = state.data;
  if (!unit) return null;
  return (
    <>
      <PageHead
        eyebrow={`${unit.id} / 知识单元`}
        title={unit.title}
        description={unit.summary}
        actions={
          <Link className="btn" href="/learn">
            返回目录
          </Link>
        }
      />
      <div className="knowledge-layout">
        <article className="panel knowledge-content">
          <div className="row wrap">
            <span className="tag green">{unit.extension ? '拓展单元' : '核心单元'}</span>
            <span className="muted small">
              {unit.sections.length} 个知识点 · {unit.questionIds.length} 道关联练习
            </span>
          </div>
          {unit.figures.map((figure) => (
            <GeometryFigure key={figure.id} figure={figure} />
          ))}
          {unit.sections.map((section, index) => (
            <section id={`section-${section.id}`} className="knowledge-section" key={section.id}>
              <div className="row">
                <span className="section-number">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <span className="code-label">{section.id}</span>
                  <h2>{section.title}</h2>
                </div>
              </div>
              {section.paragraphs.map((paragraph, i) => {
                const colon = paragraph.indexOf('：');
                const label = colon > 0 && colon < 10 ? paragraph.slice(0, colon) : '';
                return (
                  <div
                    key={i}
                    className={`knowledge-paragraph ${label === '易错' ? 'pitfall' : label === '例' || label === '例题' ? 'example' : ''}`}
                  >
                    {label && <span className="paragraph-label">{label}</span>}
                    <MathText>{label ? paragraph.slice(colon + 1) : paragraph}</MathText>
                  </div>
                );
              })}
            </section>
          ))}
        </article>
        <aside className="stack sticky-aside">
          <div className="panel">
            <h2>本单元路径</h2>
            <nav className="section-navigation" aria-label="知识点目录">
              {unit.sections.map((section) => (
                <a key={section.id} href={`#section-${section.id}`}>
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
          <div className="panel soft">
            <Icon name="pen" />
            <h2>用练习检验理解</h2>
            <p>完成本单元关联的 {unit.questionIds.length} 道题，记录你的独立思考过程。</p>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary wide" onClick={() => void practice()} disabled={busy}>
              {busy ? '正在创建练习…' : '开始单元练习'}
              <Icon name="arrow" />
            </button>
            <Link className="text-link" href={`/practice/new?unit=${encodeURIComponent(unit.id)}`}>
              自行选择题型与难度
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
