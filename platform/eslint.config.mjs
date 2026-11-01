import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server', '@/server/**', '**/server/**'],
              message: '页面通过业务接口访问服务端。',
            },
            { group: ['**/fixtures/server/**'], message: '完整答案样例仅供服务端使用。' },
          ],
          paths: [{ name: 'pg', message: '数据库连接只在 server/db 中使用。' }],
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'coverage/**', 'next-env.d.ts']),
]);
