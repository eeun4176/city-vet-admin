import { route } from '../../../server/http';
import { requireAuth } from '../../../server/auth';
import { forbidden } from '../../../server/errors';

const retired = async (request: Parameters<typeof requireAuth>[0]) => {
  await requireAuth(request, { allowMaintenance: true });
  throw forbidden('Profile editing has been retired.');
};

export default route({ GET: async (c) => retired(c.req), PATCH: async (c) => retired(c.req) });
