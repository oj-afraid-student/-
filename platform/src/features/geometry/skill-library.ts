import type { UniversalPlan } from './universal';
import { z } from 'zod';
import type { Vec3 } from './scene';
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,24}$/),
  pair = z.tuple([id, id]);
const scalar = z.union([
  z.number().finite().min(-10000).max(10000),
  z
    .object({
      parameter: id,
      scale: z.number().finite().min(-1000).max(1000),
      offset: z.number().finite().min(-10000).max(10000),
    })
    .strict(),
]);
const label = z.string().min(1).max(20),
  length = z.number().finite().min(0.001).max(10000);
export const skillSchema = z.discriminatedUnion('skill', [
  z
    .object({
      skill: z.literal('ratio_point'),
      id,
      label,
      ends: pair,
      reference: pair,
      ratio: length,
    })
    .strict(),
  z
    .object({
      skill: z.literal('rectangle'),
      wireframe: z.boolean().optional(),
      id,
      points: z.tuple([id, id, id, id]),
      width: length,
      height: length,
    })
    .strict(),
  z
    .object({
      skill: z.literal('box'),
      id,
      points: z.tuple([id, id, id, id, id, id, id, id]),
      width: length,
      depth: length,
      height: length,
    })
    .strict(),
  z.object({ skill: z.literal('pyramid'), id, base: z.array(id).min(3).max(4), apex: id }).strict(),
  z
    .object({
      skill: z.literal('prism'),
      id,
      base: z.array(id).min(3).max(4),
      top: z.array(id).min(3).max(4),
      vector: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    })
    .strict(),
  z.object({ skill: z.literal('polygon'), id, points: z.array(id).min(3).max(4) }).strict(),
  z.object({ skill: z.literal('midpoint'), id, label, ends: pair }).strict(),
  z.object({ skill: z.literal('edge_point'), id, label, ends: pair, t: scalar }).strict(),
  z
    .object({ skill: z.literal('plane_foot'), id, label, source: id, plane: z.tuple([id, id, id]) })
    .strict(),
  z
    .object({
      skill: z.literal('rotate_group'),
      id,
      axis: pair,
      angle: scalar,
      outputs: z
        .array(z.object({ source: id, id, label }).strict())
        .min(1)
        .max(12),
    })
    .strict(),
  z.object({ skill: z.literal('triangle'), id, points: z.tuple([id, id, id]) }).strict(),
  z.object({ skill: z.literal('connect'), id, points: pair }).strict(),
]);
export type GeometrySkill = z.infer<typeof skillSchema>;
export const GEOMETRY_SKILLS = [
  {
    name: 'ratio_point',
    purpose: '按参考线段长度的倍数构造边上点，比例由引擎精确维持',
    input:
      '{skill:"ratio_point",id,label,ends:[起点,终点],reference:[参考首点,参考末点],ratio:倍数}',
    output:
      '从ends首点沿边取 reference长度×ratio；超出边长时拒绝。优先用于BE=2DF这类约束。例如F从D向C，reference=[B,E],ratio=0.5，自动保证DF=BE/2。',
  },
  {
    name: 'pyramid',
    purpose: '将已有凸底面与顶点组织成棱锥，含三棱锥和四棱锥',
    input: '{skill:"pyramid",id,base:[3或4个底面点],apex:已有顶点}',
    output: '底面、侧面及边；顶点必须不在底面内',
  },
  {
    name: 'prism',
    purpose: '将已有三角形或四边形沿固定向量平移形成棱柱',
    input: '{skill:"prism",id,base:[3或4点],top:[对应新点ID],vector:[dx,dy,dz]}',
    output: '平移后的顶面点、侧棱及全部面；平移方向不能平行底面',
  },
  {
    name: 'polygon',
    purpose: '由有序点组成凸三角形或四边形面',
    input: '{skill:"polygon",id,points:[3或4点]}',
    output: '面片；共面、凸性检查',
  },
  {
    name: 'rectangle',
    purpose: '创建平面矩形及边、面，自动校验宽高和邻边垂直',
    input: '{skill:"rectangle",id,points:[A,B,C,D],width,height}',
    output: '四点，AB/CD为width，AD/BC为height；A原点，B在x轴，D在y轴',
  },
  {
    name: 'box',
    purpose: '创建长方体或正方体，自动生成12边6面及尺寸校验',
    input: '{skill:"box",id,points:[A,B,C,D,P,Q,R,S],width,depth,height}',
    output: '底面ABCD，上面PQRS，AP/BQ/CR/DS竖棱',
  },
  {
    name: 'midpoint',
    purpose: '确定性构造线段中点',
    input: '{skill:"midpoint",id,label,ends:[点,点]}',
    output: '一个依赖端点的新点',
  },
  {
    name: 'edge_point',
    purpose: '边上动点；多个动点共享参数实现线性比例约束',
    input: '{skill:"edge_point",id,label,ends:[点,点],t:数值或{parameter,scale,offset}}',
    output: '(1-t)首点+t末点；t必须在0到1',
  },
  {
    name: 'plane_foot',
    purpose: '点到平面的正交投影',
    input: '{skill:"plane_foot",id,label,source:点,plane:[三点]}',
    output: '垂足；退化平面拒绝',
  },
  {
    name: 'rotate_group',
    purpose: '多个点绕共同轴刚体旋转，可组成折叠面',
    input:
      '{skill:"rotate_group",id,axis:[两点],angle:弧度标量,outputs:[{source:原点,id:新点,label:显示名}]}',
    output: '新点；共享旋转轴和角度，原点保留',
  },
  {
    name: 'triangle',
    purpose: '以已有三个点形成三角形面片',
    input: '{skill:"triangle",id,points:[三点]}',
    output: '面片；共线退化拒绝',
  },
  {
    name: 'connect',
    purpose: '连接已有两个点作辅助边',
    input: '{skill:"connect",id,points:[两点]}',
    output: '线段；重合点拒绝',
  },
];
/** Expand high-level skills into the same bounded declarative protocol, never executable code. */
export function expandSkills(plan: UniversalPlan) {
  const nodes: UniversalPlan['nodes'] = [...plan.nodes],
    segments: UniversalPlan['segments'] = [...plan.segments],
    faces: UniversalPlan['faces'] = [...plan.faces],
    checks: UniversalPlan['checks'] = [...plan.checks];
  const known = new Set(nodes.map((n) => n.id));
  const skillIds = new Set<string>();
  const addPoint = (n: UniversalPlan['nodes'][number]) => {
    if (known.has(n.id)) throw new Error('skill输出点重复：' + n.id);
    known.add(n.id);
    nodes.push(n);
  };
  const requirePoints = (ids: string[]) => {
    if (ids.some((id) => !known.has(id)))
      throw new Error('skill依赖尚未生成的点：' + ids.join(','));
  };
  for (const s of plan.skills ?? []) {
    if (skillIds.has(s.id)) throw new Error('skill步骤ID重复');
    skillIds.add(s.id);
    if (s.skill === 'rectangle' || s.skill === 'box') {
      const width = s.width,
        depth = s.skill === 'rectangle' ? s.height : s.depth,
        h = s.skill === 'box' ? s.height : 0;
      const positions: Vec3[] = [
        [0, 0, 0],
        [width, 0, 0],
        [width, depth, 0],
        [0, depth, 0],
        [0, 0, h],
        [width, 0, h],
        [width, depth, h],
        [0, depth, h],
      ];
      s.points.forEach((id, i) =>
        addPoint({ id, label: id, type: 'fixed', position: positions[i] }),
      );
      const edges =
        s.skill === 'rectangle'
          ? [
              [0, 1],
              [1, 2],
              [2, 3],
              [3, 0],
            ]
          : [
              [0, 1],
              [1, 2],
              [2, 3],
              [3, 0],
              [4, 5],
              [5, 6],
              [6, 7],
              [7, 4],
              [0, 4],
              [1, 5],
              [2, 6],
              [3, 7],
            ];
      edges.forEach((pair, i) =>
        segments.push({
          id: s.id + '_e' + i,
          points: pair.map((j) => s.points[j]) as [string, string],
        }),
      );
      const polygons =
        s.skill === 'rectangle'
          ? [[0, 1, 2, 3]]
          : [
              [0, 1, 2, 3],
              [4, 5, 6, 7],
              [0, 1, 5, 4],
              [1, 2, 6, 5],
              [2, 3, 7, 6],
              [3, 0, 4, 7],
            ];
      (s.skill === 'rectangle' && s.wireframe ? [] : polygons).forEach((face, i) =>
        faces.push({
          id: s.id + '_f' + i,
          vertices: face.map((j) => s.points[j]),
          color: '#72a69a',
        }),
      );
      checks.push(
        { type: 'distance', points: [s.points[0], s.points[1]], value: width },
        { type: 'distance', points: [s.points[0], s.points[3]], value: depth },
        {
          type: 'perpendicular',
          first: [s.points[0], s.points[1]],
          second: [s.points[0], s.points[3]],
        },
      );
      if (s.skill === 'box')
        checks.push({ type: 'distance', points: [s.points[0], s.points[4]], value: h });
    } else if (s.skill === 'pyramid' || s.skill === 'prism') {
      requirePoints(s.base);
      if (s.skill === 'pyramid') requirePoints([s.apex]);
      if (s.skill === 'prism') {
        if (s.top.length !== s.base.length) throw new Error('棱柱顶点数不一致');
        s.top.forEach((id, i) =>
          addPoint({ id, label: id, type: 'translate', source: s.base[i], vector: s.vector }),
        );
      }
      faces.push({ id: s.id + '_base', vertices: s.base, color: '#72a69a' });
      if (s.skill === 'prism') faces.push({ id: s.id + '_top', vertices: s.top, color: '#d99b4e' });
      s.base.forEach((a, i) => {
        const j = (i + 1) % s.base.length,
          b = s.base[j];
        segments.push({ id: s.id + '_basee' + i, points: [a, b] });
        if (s.skill === 'pyramid') {
          segments.push({ id: s.id + '_sidee' + i, points: [a, s.apex] });
          faces.push({ id: s.id + '_side' + i, vertices: [a, b, s.apex], color: '#d99b4e' });
        } else {
          segments.push(
            { id: s.id + '_sidee' + i, points: [a, s.top[i]] },
            { id: s.id + '_tope' + i, points: [s.top[i], s.top[j]] },
          );
          faces.push({
            id: s.id + '_side' + i,
            vertices: [a, b, s.top[j], s.top[i]],
            color: '#d99b4e',
          });
        }
      });
    } else if (s.skill === 'ratio_point') {
      requirePoints([...s.ends, ...s.reference]);
      addPoint({
        id: s.id,
        label: s.label,
        type: 'ratio_point',
        ends: s.ends,
        reference: s.reference,
        ratio: s.ratio,
      });
    } else if (s.skill === 'midpoint' || s.skill === 'edge_point') {
      requirePoints(s.ends);
      addPoint({
        id: s.id,
        label: s.label,
        type: 'lerp',
        ends: s.ends,
        t: s.skill === 'midpoint' ? 0.5 : s.t,
      });
    } else if (s.skill === 'plane_foot') {
      requirePoints([s.source, ...s.plane]);
      addPoint({ id: s.id, label: s.label, type: 'foot', source: s.source, plane: s.plane });
    } else if (s.skill === 'rotate_group') {
      requirePoints([...s.axis, ...s.outputs.map((o) => o.source)]);
      for (const o of s.outputs)
        addPoint({
          id: o.id,
          label: o.label,
          type: 'rotate',
          source: o.source,
          axis: s.axis,
          angle: s.angle,
        });
    } else if (s.skill === 'connect') {
      requirePoints(s.points);
      segments.push({ id: s.id, points: s.points });
    } else {
      requirePoints(s.points);
      faces.push({ id: s.id, vertices: s.points, color: '#d99b4e' });
    }
  }
  if (nodes.length > 32 || segments.length > 64 || faces.length > 16 || checks.length > 60)
    throw new Error('技能组合超过场景预算');
  return { ...plan, nodes, segments, faces, checks };
}
