import Image from 'next/image';
import type { Figure, GradingStatus, QuestionType } from '@/shared/contracts';
import { Icon } from './icons';

export const questionTypeLabels: Record<QuestionType, string> = {
  SINGLE_CHOICE: '单选题',
  MULTIPLE_CHOICE: '多选题',
  FILL_BLANK: '填空题',
  JUDGMENT_REASON: '判断说明题',
  PROOF: '证明题',
  PROOF_CALCULATION: '证明计算题',
  EXPLORATION_PROOF: '探究证明题',
  COMPREHENSIVE: '综合解答题',
};
export const difficultyLabels = { BASIC: '基础', INTERMEDIATE: '进阶', COMPREHENSIVE: '综合' };

export function PageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}
export function LoadingState({ text = '正在读取内容…' }: { text?: string }) {
  return (
    <div className="state-panel" role="status">
      <span className="loading-ring" />
      <p>{text}</p>
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-panel error-panel" role="alert">
      <Icon name="alert" />
      <h2>暂时无法完成操作</h2>
      <p>{message}</p>
      {retry && (
        <button className="btn" onClick={retry}>
          重新尝试
        </button>
      )}
    </div>
  );
}
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="state-panel">
      <Icon name="book" />
      <h2>{title}</h2>
      <div className="muted">{children}</div>
    </div>
  );
}
export function MathText({ children, className = '' }: { children: string; className?: string }) {
  return <div className={`math-text ${className}`}>{children}</div>;
}
export function GeometryFigure({ figure }: { figure: Figure }) {
  return (
    <figure className="geometry-figure">
      <a
        href={figure.src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${figure.alt}，打开原图`}
      >
        <Image src={figure.src} alt={figure.alt} width={1000} height={700} unoptimized />
      </a>
      <figcaption>
        {figure.caption}
        <span>点击查看原图</span>
      </figcaption>
    </figure>
  );
}
export function GradingBadge({ status }: { status: GradingStatus }) {
  return (
    <span className={`tag ${status === 'PENDING_REVIEW' ? 'amber' : 'green'}`}>
      <Icon name={status === 'PENDING_REVIEW' ? 'clock' : 'check'} />
      {status === 'PENDING_REVIEW' ? '待复核' : '已完成评分'}
    </span>
  );
}
