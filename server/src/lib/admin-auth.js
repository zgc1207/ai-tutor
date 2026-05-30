export function requireAdmin(request) {
  const configuredToken = process.env.ADMIN_TOKEN;
  const providedToken = request.headers['x-admin-token'];
  if (!configuredToken || Array.isArray(providedToken) || providedToken !== configuredToken) {
    throw Object.assign(new Error('Admin token required'), { statusCode: 401 });
  }
}
