import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const subjects = [
  { code: 'math', name: '数学' },
  { code: 'physics', name: '物理' },
  { code: 'english', name: '英语' },
  { code: 'chinese', name: '语文' },
];

const knowledgeTree = {
  math: [
    {
      name: '代数',
      children: ['一元一次方程', '分式方程', '一元二次方程', '一元一次不等式'],
    },
    {
      name: '函数',
      children: ['一次函数', '反比例函数', '二次函数'],
    },
    {
      name: '几何',
      children: ['全等三角形', '相似三角形', '圆周角'],
    },
  ],
  physics: [
    {
      name: '力学',
      children: ['机械效率', '功与功率', '压强', '密度'],
    },
    {
      name: '光学',
      children: ['凸透镜成像', '光的反射'],
    },
    {
      name: '电学',
      children: ['欧姆定律', '电功率'],
    },
  ],
  english: [
    {
      name: '语法',
      children: ['一般过去时', '现在完成时', '比较级', '被动语态', '定语从句'],
    },
    {
      name: '词汇',
      children: ['高频短语'],
    },
  ],
  chinese: [
    {
      name: '阅读理解',
      children: ['思想感情', '修辞手法', '说明文阅读'],
    },
    {
      name: '古诗文',
      children: ['文言实词', '诗歌鉴赏'],
    },
  ],
};

async function upsertKnowledgeNode({ subjectId, parentId = null, name, sortOrder }) {
  const existing = await prisma.knowledgeNode.findFirst({
    where: { subjectId, parentId, name },
  });
  if (existing) {
    return prisma.knowledgeNode.update({
      where: { id: existing.id },
      data: { sortOrder },
    });
  }
  return prisma.knowledgeNode.create({
    data: { subjectId, parentId, name, sortOrder },
  });
}

for (const subject of subjects) {
  const savedSubject = await prisma.subject.upsert({
    where: { code: subject.code },
    update: { name: subject.name },
    create: subject,
  });

  const roots = knowledgeTree[subject.code] || [];
  for (const [rootIndex, root] of roots.entries()) {
    const rootNode = await upsertKnowledgeNode({
      subjectId: savedSubject.id,
      name: root.name,
      sortOrder: rootIndex,
    });

    for (const [childIndex, childName] of root.children.entries()) {
      await upsertKnowledgeNode({
        subjectId: savedSubject.id,
        parentId: rootNode.id,
        name: childName,
        sortOrder: childIndex,
      });
    }
  }
}

await prisma.$disconnect();
