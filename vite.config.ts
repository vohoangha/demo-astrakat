import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Báo cho Vite biết các thư viện này sẽ được load từ CDN (index.html)
      // nên không cần tìm trong node_modules khi build.
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'firebase/app', 
        'firebase/database',
        '@google/genai',
        'lucide-react'
      ]
    }
  }
});