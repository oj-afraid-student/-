import { ConnectionCheck } from './connection-check';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="mb-4 text-sm font-medium tracking-widest text-blue-700">知序 · 学生端</p>
      <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">立体几何学习与练习</h1>
      <p className="mt-6 text-lg leading-8 text-slate-600">
        围绕空间位置关系、线面平行与线面垂直，逐步连接知识学习、题目练习和作答回看。
      </p>
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">首日工程基础</h2>
        <p className="mt-3 leading-7 text-slate-600">
          正式工程已初始化。账号、学习内容、练习与历史页面将按模块逐步接入。
        </p>
        <ConnectionCheck />
      </section>
    </main>
  );
}
