import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  server: {
    port: 3000,
    open: false,
  },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        share: resolve(__dirname, 'share-preview.html'),
        howToPlay: resolve(__dirname, 'how-to-play.html'),
        patterns: resolve(__dirname, 'minesweeper-patterns.html'),
        strategy: resolve(__dirname, 'minesweeper-strategy.html'),
        tips: resolve(__dirname, 'minesweeper-tips.html'),
        history: resolve(__dirname, 'minesweeper-history.html'),
        about: resolve(__dirname, 'about.html'),
        privacy: resolve(__dirname, 'privacy-policy.html'),
        eggMode: resolve(__dirname, 'egg-mode.html'),
        classicMode: resolve(__dirname, 'classic-mode.html'),
        difficultyGuide: resolve(__dirname, 'difficulty-guide.html'),
        leaderboard: resolve(__dirname, 'leaderboard.html'),
        challenges: resolve(__dirname, 'challenges.html'),
      },
    },
  },
});
