import {
  type ConfigEnv,
  mergeConfig,
  type UserConfig as ViteUserConfig,
} from 'vite';

import {
  installURLPattern,
  type ServerEndpoint,
  type ServerLayout,
  type ServerPage,
} from '../../../shared';
import { esmRequire, logger, normalizePath, trimExt } from '../../utils';
import type { App, AppDetails, AppFactory } from '../App';
import {
  type AppConfig,
  resolveAppConfig,
  type ResolvedAppConfig,
} from '../config';
import { MarkdocSchema } from '../markdoc/MarkdocSchema';
import { AppNodes } from '../nodes';
import type { VitebookPlugin } from '../plugins/Plugin';
import { createAppDirectories } from './app-dirs';
import { getAppVersion } from './app-utils';
import { DisposalBin } from './DisposalBin';

export const createAppFactory = async (
  config: AppConfig,
  viteConfig: ViteUserConfig,
  env: ConfigEnv,
): Promise<AppFactory> => {
  await installURLPattern();

  const root = viteConfig.root ?? process.cwd();

  const resolvedConfig = resolveAppConfig(root, config);
  resolvedConfig.isBuild = env.command === 'build';
  resolvedConfig.isSSR = !!viteConfig.build?.ssr;

  const dirs = createAppDirectories(root, resolvedConfig);
  const version = getAppVersion();

  let plugins = viteConfig
    .plugins!.flat()
    .filter((plugin) => plugin && 'vitebook' in plugin) as VitebookPlugin[];

  plugins = [
    ...plugins.filter((plugin) => plugin.enforce === 'pre'),
    ...plugins.filter((plugin) => !plugin.enforce),
    ...plugins.filter((plugin) => plugin.enforce === 'post'),
  ];

  const entry =
    plugins.find((plugin) => plugin.vitebook?.entry)?.vitebook!.entry ??
    defaultEntry();

  Object.keys(entry).forEach((key) => (entry[key] = normalizePath(entry[key])));

  const details: AppDetails = {
    version,
    dirs,
    entry,
    config: { ...resolvedConfig },
    vite: { env },
  };

  const app: AppFactory = {
    ...details,
    create: async () => {
      const $app: App = {
        ...details,
        logger,
        vite: { user: viteConfig, env },
        context: new Map(),
        nodes: new AppNodes(),
        markdoc: new MarkdocSchema(),
        disposal: new DisposalBin(),
        destroy: () => $app.disposal.empty(),
      };

      for (const plugin of plugins) {
        const overrides = await plugin.vitebook!.config?.($app.config);
        if (overrides) {
          $app.config = mergeConfig(
            $app.config,
            overrides,
          ) as ResolvedAppConfig;
        }
      }

      for (const plugin of plugins) {
        await plugin.vitebook?.configureApp?.($app);
      }

      return $app;
    },
  };

  return app;
};

function defaultEntry(): App['entry'] {
  const __require = esmRequire();
  return {
    client: __require.resolve(`vitebook/entry-client.js`),
    server: __require.resolve(`vitebook/entry-server.js`),
  };
}

export function createAppEntries(app: App, { isSSR = false } = {}) {
  const entries: Record<string, string> = {};

  for (const page of app.nodes.pages) {
    const filename = resolvePageOutputFilename(app, page);
    entries[filename] = page.filePath;
  }

  for (const layout of app.nodes.layouts) {
    const filename = resolveLayoutOutputFilename(app, layout);
    entries[filename] = layout.filePath;
  }

  if (isSSR || app.config.isSSR) {
    for (const endpoint of app.nodes.endpoints) {
      const filename = resolveEndpointFilename(app, endpoint);
      entries[filename] = endpoint.filePath;
    }
  }

  return entries;
}

function resolvePageOutputFilename(app: App, page: ServerPage) {
  const name = app.dirs.app.relative(page.rootPath);
  return `pages/${name}`;
}

function resolveLayoutOutputFilename(app: App, layout: ServerLayout) {
  const name = trimExt(
    app.dirs.app.relative(layout.rootPath).replace(/@layouts\//, ''),
  );
  return `layouts/${name}`;
}

function resolveEndpointFilename(app: App, endpoint: ServerEndpoint) {
  // /api/...
  return trimExt(app.dirs.app.relative(endpoint.rootPath));
}
