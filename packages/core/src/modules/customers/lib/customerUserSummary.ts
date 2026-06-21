import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { User } from '@open-mercato/core/modules/auth/data/entities'

export type CustomerUserSummary = {
  id: string
  name: string | null
  email: string | null
}

export async function loadCustomerUserSummaries(
  em: EntityManager,
  userIds: string[],
  scope?: { tenantId?: string | null; organizationId?: string | null },
): Promise<Map<string, CustomerUserSummary>> {
  if (!userIds.length) return new Map()
  const users = await findWithDecryption(em, User, { id: { $in: userIds } }, undefined, {
    tenantId: scope?.tenantId ?? null,
    organizationId: scope?.organizationId ?? null,
  })
  return new Map(
    users.map((user) => [
      user.id,
      {
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
      },
    ]),
  )
}
