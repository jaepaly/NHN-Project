import { defineConfig } from 'vite';

// GitHub Pages는 https://<user>.github.io/NHN-Project/ 경로로 서빙되므로 base 지정 필요
export default defineConfig({
  base: '/NHN-Project/',
  build: {
    target: 'es2022',
  },
});
