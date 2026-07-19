import { defineConfig, type Plugin } from 'vite';
import { appendFile, mkdir } from 'node:fs/promises';

/**
 * 개발 전용 플레이 로거 — 게임이 POST `/__log`로 보낸 판정/이벤트를 `logs/play.jsonl`에 append.
 * 브라우저 localStorage는 외부에서 못 읽으므로, 피드백을 위해 디스크에 남긴다. 빌드(serve 외)엔 미적용.
 */
function playLoggerPlugin(): Plugin {
  const logPath = 'logs/play.jsonl';
  return {
    name: 'incant-play-logger',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__log', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          void (async () => {
            try {
              await mkdir('logs', { recursive: true });
              await appendFile(logPath, body.trim() + '\n', 'utf8');
            } catch {
              // 로깅 실패는 무시 (개발 편의 기능)
            }
            res.statusCode = 204;
            res.end();
          })();
        });
      });
    },
  };
}

// GitHub Pages는 https://<user>.github.io/NHN-Project/ 경로로 서빙되므로 base 지정 필요
export default defineConfig({
  base: '/NHN-Project/',
  build: {
    target: 'es2022',
  },
  plugins: [playLoggerPlugin()],
});
