import { prisma } from '../src/lib/prisma.js';

async function main() {
  const [subjects, users, sessions] = await Promise.all([
    prisma.subject.count(),
    prisma.user.count(),
    prisma.session.count(),
  ]);

  console.log(JSON.stringify({
    ok: true,
    subjects,
    users,
    sessions,
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
