import { z } from 'zod';
import { getCurrentUserId } from '../lib/current-user.js';
import { prisma } from '../lib/prisma.js';

const querySchema = z.object({
  subject: z.string().optional().default('all'),
});

const STATUS_RANK = {
  gray: 0,
  green: 1,
  yellow: 2,
  red: 3,
};

function recordStatus(record) {
  if (record.status === 'weak') return 'red';
  if (record.status === 'learning') return 'yellow';
  if (record.status === 'mastered') return 'green';
  return 'gray';
}

function matchesKnowledgePoint(record, node) {
  if (record.knowledgeNodeId === node.id) return true;
  const point = record.knowledgePoint || '';
  return point.includes(node.name) || node.name.includes(point);
}

function buildNode(node, records) {
  const directRecords = records.filter(record => matchesKnowledgePoint(record, node));
  const children = node.children
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map(child => buildNode(child, records));
  const childMistakes = children.reduce((sum, child) => sum + child.mistakes, 0);
  const directMistakes = directRecords.length;
  const mistakeStatuses = directRecords.map(recordStatus);
  const childStatuses = children.map(child => child.status);
  const status = [...mistakeStatuses, ...childStatuses].reduce((current, next) => (
    STATUS_RANK[next] > STATUS_RANK[current] ? next : current
  ), 'gray');

  return {
    id: node.id,
    name: node.name,
    status,
    mistakes: directMistakes + childMistakes,
    children,
  };
}

export async function knowledgeTreeRoutes(app) {
  app.get('/', async request => {
    const userId = await getCurrentUserId(request);
    const query = querySchema.parse(request.query || {});
    const where = query.subject === 'all' ? {} : { code: query.subject };

    const subjects = await prisma.subject.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        knowledgeNodes: {
          where: { parentId: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            children: {
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: {
                children: {
                  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                  include: {
                    children: {
                      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const subjectIds = subjects.map(subject => subject.id);
    const records = await prisma.errorRecord.findMany({
      where: {
        userId,
        subjectId: { in: subjectIds },
      },
      select: {
        id: true,
        subjectId: true,
        knowledgeNodeId: true,
        knowledgePoint: true,
        status: true,
      },
    });

    return {
      subjects: subjects.map(subject => ({
        code: subject.code,
        name: subject.name,
        children: subject.knowledgeNodes.map(node => buildNode(
          node,
          records.filter(record => record.subjectId === subject.id),
        )),
      })),
    };
  });
}
