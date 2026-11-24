import { z } from 'zod';

export const candidateDiagramSchema = z
  .object({
    view: z
      .object({
        yaw: z.number().min(-80).max(80),
        pitch: z.number().min(10).max(70),
        zoom: z.number().min(0.5).max(1),
      })
      .strict()
      .optional(),
    points: z
      .array(
        z
          .object({
            id: z.string().regex(/^[A-Z](?:[0-9]|['′])?$/),
            x: z.number().min(30).max(570),
            y: z.number().min(30).max(370),
          })
          .strict(),
      )
      .min(3)
      .max(12),
    edges: z
      .array(
        z
          .object({
            from: z.string(),
            to: z.string(),
            dashed: z.boolean(),
          })
          .strict(),
      )
      .min(2)
      .max(30),
    labels: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(40),
            x: z.number().min(30).max(570),
            y: z.number().min(30).max(370),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict()
  .refine((diagram) => {
    const ids = new Set(diagram.points.map((point) => point.id));
    return (
      ids.size === diagram.points.length &&
      diagram.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to)
    );
  }, '示意图顶点或连线无效');
export type CandidateDiagram = z.infer<typeof candidateDiagramSchema>;

export function candidateDiagramPhoto(diagram: CandidateDiagram) {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器无法绘制示意图。');
  ctx.scale(1.5, 1.5);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 600, 400);
  ctx.strokeStyle = '#263f3b';
  ctx.lineWidth = 1.5;
  for (const edge of diagram.edges) {
    const a = diagram.points.find((point) => point.id === edge.from)!;
    const b = diagram.points.find((point) => point.id === edge.to)!;
    ctx.setLineDash(edge.dashed ? [5, 5] : []);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.fillStyle = '#263f3b';
  ctx.font = '16px serif';
  for (const point of diagram.points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(point.id, point.x + 5, point.y - 6);
  }
  for (const label of diagram.labels ?? []) ctx.fillText(label.text, label.x, label.y);
  return canvas.toDataURL('image/jpeg', 0.85);
}
