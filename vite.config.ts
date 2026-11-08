import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig,loadEnv} from 'vite';
import {loadSchoolBuild,institutionBuildPlugin} from './server/platform/schoolBuild.js';

export default defineConfig(({mode}) => {
  const env={...loadEnv(mode,process.cwd(),''),...process.env};
  const school=loadSchoolBuild(env.SCHOOL_INSTITUTION_MANIFEST,env.SCHOOL_INSTITUTION_ASSETS_DIR);
  return {
    plugins: [react(), tailwindcss(),institutionBuildPlugin(school)],
    ...(school?{publicDir:false}:{}),
    define:{__SCHOOL_PUBLIC_CONFIG__:JSON.stringify(school?.publicConfig||null)},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
