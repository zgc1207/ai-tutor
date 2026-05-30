import { prisma } from './prisma.js';
import { isLegacyUserIdAuthEnabled } from './config.js';

function getSessionToken(request) {
  const headerToken = request.headers['x-session-token'];
  if (headerToken && !Array.isArray(headerToken)) return headerToken;

  const authorization = request.headers.authorization;
  if (!authorization || Array.isArray(authorization)) return '';
  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
}

export async function getCurrentUserId(request) {
  const token = getSessionToken(request);
  if (token) {
    const session = await prisma.session.findUnique({
      where: { token },
      select: {
        userId: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { id: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user) {
      throw Object.assign(new Error('Invalid or expired session'), { statusCode: 401 });
    }
    return session.userId;
  }

  if (!isLegacyUserIdAuthEnabled()) {
    throw Object.assign(new Error('Missing or invalid session token'), { statusCode: 401 });
  }

  const userId = request.headers['x-user-id'];
  if (!userId || Array.isArray(userId)) {
    throw Object.assign(new Error('Missing session token or x-user-id header'), { statusCode: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  return userId;
}
