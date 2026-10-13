import 'reflect-metadata';
import { bootstrap, createApp } from './bootstrap.js';

bootstrap(createApp).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
