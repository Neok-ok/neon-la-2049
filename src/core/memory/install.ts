// First import in main.ts. Hooks three.js constructors before district modules build meshes.
import { params } from '../params';
import { installResourceGuard } from './resources';

installResourceGuard({ strict: params.memguard });
