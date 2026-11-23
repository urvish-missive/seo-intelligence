// backend/prisma/seed.js
// Database seed script — seeds system permissions, default roles, super admin, and initial workspace.

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { SYSTEM_PERMISSIONS_CATALOG, ROLE_DEFAULT_PERMISSIONS, ROLE_LABELS } from '../../shared/constants/permissions.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seed for Phase 2...');

  // 1. Seed Permissions Catalog
  console.log('📦 Seeding permissions catalog...');
  const permissionsMap = new Map();
  for (const perm of SYSTEM_PERMISSIONS_CATALOG) {
    const record = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { module: perm.module, description: perm.description },
      create: { key: perm.key, module: perm.module, description: perm.description },
    });
    permissionsMap.set(perm.key, record.id);
  }
  console.log(`✅ Seeded ${permissionsMap.size} system permissions.`);

  // 2. Seed System Roles and RolePermissions (global system roles with workspaceId: null)
  console.log('🛡️  Seeding system roles...');
  const rolesMap = new Map();
  for (const [slug, permissionKeys] of Object.entries(ROLE_DEFAULT_PERMISSIONS)) {
    // Check if role exists
    let role = await prisma.role.findFirst({
      where: { slug, workspaceId: null },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          name: ROLE_LABELS[slug] || slug,
          slug,
          description: `Built-in system role: ${ROLE_LABELS[slug] || slug}`,
          isSystem: true,
          workspaceId: null,
        },
      });
    }

    rolesMap.set(slug, role);

    // Sync role permissions
    for (const key of permissionKeys) {
      const permissionId = permissionsMap.get(key);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId,
          },
        });
      }
    }
  }
  console.log(`✅ Seeded ${rolesMap.size} system roles with full permission mappings.`);

  // 3. Super Admin User
  console.log('👤 Seeding default Super Admin...');
  const passwordHash = await argon2.hash('MissiveSEO2026!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@missivedigital.com' },
    update: {
      name: 'Super Admin',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
    create: {
      name: 'Super Admin',
      email: 'admin@missivedigital.com',
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`✅ Super Admin ready: ${superAdmin.email} (${superAdmin.id})`);

  // 4. Default Workspace
  console.log('🏢 Seeding default workspace...');
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'missive-digital' },
    update: {
      name: 'Missive Digital',
      ownerId: superAdmin.id,
      status: 'ACTIVE',
    },
    create: {
      name: 'Missive Digital',
      slug: 'missive-digital',
      description: 'Primary Missive Digital agency workspace',
      timezone: 'Asia/Kolkata',
      ownerId: superAdmin.id,
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Workspace ready: ${workspace.name} (${workspace.id})`);

  // 5. Super Admin Membership
  const superAdminRole = rolesMap.get('super_admin');
  await prisma.membership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: superAdmin.id,
      },
    },
    update: {
      roleId: superAdminRole.id,
      status: 'ACTIVE',
    },
    create: {
      workspaceId: workspace.id,
      userId: superAdmin.id,
      roleId: superAdminRole.id,
      status: 'ACTIVE',
      joinedAt: new Date(),
    },
  });
  console.log(`✅ Super Admin membership established.`);

  // 6. AI Model Configuration
  await prisma.aIModelConfiguration.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      modelName: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
      temperature: 0.3,
      maxTokens: 4096,
    },
  });

  console.log('\n✨ Database seeding completed successfully!');
  console.log('📋 Login credentials:');
  console.log('   Email:    admin@missivedigital.com');
  console.log('   Password: MissiveSEO2026!');
  console.log('   Role:     Super Admin');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
