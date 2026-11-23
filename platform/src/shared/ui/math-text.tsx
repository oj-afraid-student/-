import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';

// Recognize the Unicode notation used in the geometry bank at display time.
const operand = '[A-Za-z0-9αβγδεθλμπφω∞₀-₉⁰¹²³⁴-⁹√∠△⊙∥⊥∩∪⊂∈∉≠≤≥＝=＋+−–—×·°′⃗/()\\[\\]]';
const expression = new RegExp(
  '[[(]' +
    operand +
    '+[，,]' +
    operand +
    '+[\\])]|' +
    '(?:' +
    operand +
    '|(?<=\\d)\\.(?=\\d)|(?<=[a-z])_(?=[A-Z])|[ \\t])+',
  'gu',
);
const notation = /[π∞₀-₉⁰¹²³⁴-⁹√∠△⊙∥⊥∩∪⊂∈∉≠≤≥＝=＋+−×°′⃗/]|[a-z]_[A-Z]|\b(?:sin|cos|tan)\b/u;
const fractionTerm =
  '(?:\\([A-Za-z0-9π∞√＋+−.]+\\)|(?:√\\([A-Za-z0-9π∞＋+−.]+\\)|[A-Za-z0-9π∞√₀-₉.])+)';
const fraction = new RegExp('(' + fractionTerm + ')/(' + fractionTerm + ')', 'gu');
const subscriptDigits = '₀₁₂₃₄₅₆₇₈₉';
const superscriptDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const commands: Record<string, string> = {
  α: '\\alpha ',
  β: '\\beta ',
  γ: '\\gamma ',
  δ: '\\delta ',
  ε: '\\epsilon ',
  θ: '\\theta ',
  λ: '\\lambda ',
  μ: '\\mu ',
  π: '\\pi ',
  φ: '\\phi ',
  ω: '\\omega ',
  '∞': '\\infty ',
  '∠': '\\angle ',
  '△': '\\triangle ',
  '⊙': '\\odot ',
  '∥': '\\parallel ',
  '⊥': '\\perp ',
  '∩': '\\cap ',
  '∪': '\\cup ',
  '⊂': '\\subset ',
  '∈': '\\in ',
  '∉': '\\notin ',
  '≠': '\\ne ',
  '≤': '\\le ',
  '≥': '\\ge ',
  '＝': '=',
  '＋': '+',
  '−': '-',
  '–': '\\text{–}',
  '—': '\\text{—}',
  '×': '\\times ',
  '·': '\\cdot ',
  '，': ',',
  '°': '^{\\circ}',
  '′': "'",
};

function ungroup(value: string): string {
  return value.startsWith('(') && value.endsWith(')') ? value.slice(1, -1) : value;
}

function digits(value: string, alphabet: string): string {
  return Array.from(value, (digit) => alphabet.indexOf(digit)).join('');
}

function latex(value: string): string {
  return value
    .replace(
      fraction,
      (_match, top: string, bottom: string) =>
        '\\frac{' + latex(ungroup(top)) + '}{' + latex(ungroup(bottom)) + '}',
    )
    .replace(
      /√(\([^()]+\)|\d+(?:\.\d+)?|[a-zπ])/gu,
      (_match, radicand: string) => '\\sqrt{' + latex(ungroup(radicand)) + '}',
    )
    .replace(/([A-Z]+)⃗/gu, '\\overrightarrow{$1}')
    .replace(/(?<![\\a-z])(sin|cos|tan)(?![a-z])/gu, '\\$1 ')
    .replace(/(?<=[a-z])_([A-Z]+)/gu, '_{$1}')
    .replace(/[₀-₉]+/gu, (value) => '_{' + digits(value, subscriptDigits) + '}')
    .replace(/[⁰¹²³⁴-⁹]+/gu, (value) => '^{' + digits(value, superscriptDigits) + '}')
    .replace(/[αβγδεθλμπφω∞∠△⊙∥⊥∩∪⊂∈∉≠≤≥＝＋−–—×·，°′]/gu, (symbol) => commands[symbol]);
}

function inlineMath(node: Text, displayFractions: boolean): ElementContent[] {
  const { value } = node;
  const pieces: ElementContent[] = [];
  let offset = 0;
  for (const match of value.matchAll(expression)) {
    const chunk = match[0].trim();
    if (!notation.test(chunk) || !/[\p{L}\p{N}]/u.test(chunk)) continue;
    const start = match.index + match[0].indexOf(chunk);
    const end = start + chunk.length;
    if (offset < start) pieces.push({ type: 'text', value: value.slice(offset, start) });
    const formula = latex(chunk);
    const standalone = displayFractions && value.trim() === chunk;
    pieces.push({
      type: 'element',
      tagName: 'code',
      properties: { className: ['language-math', 'math-inline'] },
      children: [
        { type: 'text', value: standalone ? formula.replaceAll('\\frac{', '\\dfrac{') : formula },
      ],
    });
    offset = end;
  }
  if (offset === 0) return [node];
  if (offset < value.length) pieces.push({ type: 'text', value: value.slice(offset) });
  return pieces;
}

function rehypeGeometryNotation({ displayFractions }: { displayFractions: boolean }) {
  return (tree: Root) => {
    function convert(node: Root | Element) {
      // The Markdown parser already identified explicit LaTeX and code spans.
      if (node.type === 'element' && ['pre', 'code', 'a'].includes(node.tagName)) return;
      const children: RootContent[] = node.children;
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index];
        if (child.type === 'element') convert(child);
        if (child.type === 'text')
          children.splice(index, 1, ...inlineMath(child, displayFractions));
      }
    }
    convert(tree);
  };
}

function rehypeMathVariables() {
  return (tree: Root) => {
    function mark(node: Root | Element) {
      if (node.type === 'element' && node.tagName === 'mi') {
        const identifier = node.children[0];
        const variant = node.properties.mathVariant ?? node.properties.mathvariant;
        if (
          (!variant || variant === 'italic') &&
          identifier?.type === 'text' &&
          /^[A-Za-zα-ωΑ-Ω]$/u.test(identifier.value)
        ) {
          node.properties.className = ['math-variable'];
        }
      }
      for (const child of node.children) if (child.type === 'element') mark(child);
    }
    mark(tree);
  };
}

export function MathText({
  children,
  className = '',
  displayFractions = false,
  verbatim = false,
  allowLinksAndImages = true,
}: {
  children: string;
  className?: string;
  displayFractions?: boolean;
  verbatim?: boolean;
  allowLinksAndImages?: boolean;
}) {
  if (verbatim) return <div className={'math-text math-verbatim ' + className}>{children}</div>;
  return (
    <div className={'math-text ' + className}>
      <Markdown
        remarkPlugins={[remarkMath, remarkBreaks]}
        rehypePlugins={[
          [rehypeGeometryNotation, { displayFractions }],
          [rehypeKatex, { output: 'mathml', trust: false }],
          rehypeMathVariables,
        ]}
        skipHtml
        disallowedElements={allowLinksAndImages ? undefined : ['a', 'img']}
        unwrapDisallowed
      >
        {children.replace(/_{4,}/gu, (blank) => '\\_'.repeat(blank.length))}
      </Markdown>
    </div>
  );
}
