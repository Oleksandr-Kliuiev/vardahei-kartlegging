/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS API child on Node 22 */
'use strict';
require(require.resolve('reflect-metadata', { paths: [__dirname + '/../../apps/api'] }));
(async () => {
  const { createApp } = require('../../apps/api/dist/bootstrap.js');
  const app = await createApp();
  await app.listen(Number(process.env.PORT || 3000), '127.0.0.1');
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      void app.close().then(() => process.exit(0));
    });
})().catch(() => {
  console.error('staging API failed');
  process.exit(1);
});
