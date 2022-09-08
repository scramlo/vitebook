import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  normalizePath,
  type VitebookPluginOptions,
  VM_PREFIX,
} from 'vitebook/node';

import { renderMarkdoc, svelteMarkdocTags, transformTreeNode } from './markdoc';
import { svelteSSRPlugin } from './svelte-ssr';

const VIRTUAL_APP_ID = `${VM_PREFIX}/svelte/app` as const;

export function sveltePlugin(): VitebookPluginOptions {
  let appDir: string;

  function resolveAppId() {
    const userAppFile = normalizePath(path.posix.resolve(appDir, 'app.svelte'));
    return fs.existsSync(userAppFile)
      ? { id: userAppFile }
      : { id: '@vitebook/svelte/app.svelte' };
  }

  const require = createRequire(import.meta.url);

  return [
    {
      name: '@vitebook/svelte',
      enforce: 'pre',
      config() {
        return {
          resolve: {
            alias: {
              [VIRTUAL_APP_ID]: `/${VIRTUAL_APP_ID}`,
            },
          },
        };
      },
      vitebook: {
        enforce: 'pre',
        config(config) {
          appDir = config.dirs.app;
          const appId = resolveAppId().id;
          return {
            entry: {
              client: require.resolve('@vitebook/svelte/entry-client.js'),
              server: require.resolve('@vitebook/svelte/entry-server.js'),
            },
            client: {
              app: appId,
              configFiles: [config.isBuild ? appId : VIRTUAL_APP_ID],
            },
            markdown: {
              markdoc: { tags: svelteMarkdocTags },
              render: renderMarkdoc,
              transformTreeNode: [transformTreeNode],
            },
          };
        },
      },
      resolveId(id) {
        if (id === `/${VIRTUAL_APP_ID}`) {
          return resolveAppId();
        }

        return null;
      },
    },
    svelteSSRPlugin(),
  ];
}
