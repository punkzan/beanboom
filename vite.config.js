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
        blogIndex: resolve(__dirname, 'blog.html'),
        blogHowToPlay: resolve(__dirname, 'blog/how-to-play-minesweeper.html'),
        blogRules: resolve(__dirname, 'blog/minesweeper-rules.html'),
        blogNumbers: resolve(__dirname, 'blog/minesweeper-numbers-meaning.html'),
        blogTips: resolve(__dirname, 'blog/minesweeper-tips-and-tricks.html'),
        blogStrategy: resolve(__dirname, 'blog/minesweeper-strategy-guide.html'),
        blogFlagging: resolve(__dirname, 'blog/minesweeper-flagging-guide.html'),
        blogHighScore: resolve(__dirname, 'blog/minesweeper-high-score-guide.html'),
        blogBestFree: resolve(__dirname, 'blog/best-free-online-minesweeper-games.html'),
        blogVsTraditional: resolve(__dirname, 'blog/bean-boom-vs-traditional-minesweeper.html'),
        blogVsSudoku: resolve(__dirname, 'blog/minesweeper-vs-sudoku-vs-solitaire.html'),
        blogEggVsClassic: resolve(__dirname, 'blog/egg-mode-vs-classic-mode.html'),
        blogOnlineVsDownload: resolve(__dirname, 'blog/play-minesweeper-online-vs-download.html'),
        blogVariations: resolve(__dirname, 'blog/minesweeper-variations.html'),
        blogBrainBenefits: resolve(__dirname, 'blog/why-play-minesweeper-brain-benefits.html'),
        blogAllAges: resolve(__dirname, 'blog/minesweeper-for-all-ages.html'),
      },
    },
  },
});
