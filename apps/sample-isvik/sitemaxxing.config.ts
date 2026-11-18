import { defineConfig } from 'sitemaxxing';

export default defineConfig({
  devUrl: 'http://localhost:5174',
  content: 'src/content.json',
  sections: 'auto',
  passes: ['default'],
  viewports: [[1440, 900], [390, 844]],
  category: 'travel',
});
