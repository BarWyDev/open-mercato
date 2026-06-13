const loadCustomFieldValuesMock = jest.fn()
const resolvePersonCustomFieldRoutingMock = jest.fn()

jest.mock('@open-mercato/shared/lib/crud/custom-fields', () => ({
  loadCustomFieldValues: (...args: unknown[]) => loadCustomFieldValuesMock(...args),
}))

jest.mock('../../../../lib/customFieldRouting', () => {
  const actual = jest.requireActual('../../../../lib/customFieldRouting')
  return {
    ...actual,
    resolvePersonCustomFieldRouting: (...args: unknown[]) => resolvePersonCustomFieldRoutingMock(...args),
  }
})

import { E } from '#generated/entities.ids.generated'
import { loadPersonDetailCustomFields } from '../route'

const PERSON_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const PROFILE_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

const person = { id: PERSON_ID, tenantId: 'tenant-1', organizationId: 'org-1' } as any
const profile = { id: PROFILE_ID, tenantId: 'tenant-1', organizationId: 'org-1' } as any

describe('loadPersonDetailCustomFields', () => {
  beforeEach(() => {
    loadCustomFieldValuesMock.mockReset()
    resolvePersonCustomFieldRoutingMock.mockReset()
    resolvePersonCustomFieldRoutingMock.mockResolvedValue(new Map())
  })

  it('merges entity-only custom field values', async () => {
    loadCustomFieldValuesMock.mockImplementation(async (opts: { entityId: string }) => {
      if (opts.entityId === E.customers.customer_entity) {
        return { [PERSON_ID]: { priority: 3, label: 'vip' } }
      }
      return {}
    })

    const result = await loadPersonDetailCustomFields({} as any, person, null, 'tenant-1')

    expect(loadCustomFieldValuesMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchSnapshot()
  })

  it('merges profile-only custom field values', async () => {
    loadCustomFieldValuesMock.mockImplementation(async (opts: { entityId: string }) => {
      if (opts.entityId === E.customers.customer_person_profile) {
        return { [PROFILE_ID]: { segment: 'enterprise' } }
      }
      return {}
    })

    const result = await loadPersonDetailCustomFields({} as any, person, profile, 'tenant-1')

    expect(loadCustomFieldValuesMock).toHaveBeenCalledTimes(2)
    expect(result).toMatchSnapshot()
  })

  it('merges both entity- and profile-level custom field values', async () => {
    loadCustomFieldValuesMock.mockImplementation(async (opts: { entityId: string }) => {
      if (opts.entityId === E.customers.customer_entity) {
        return { [PERSON_ID]: { priority: 3 } }
      }
      if (opts.entityId === E.customers.customer_person_profile) {
        return { [PROFILE_ID]: { segment: 'enterprise' } }
      }
      return {}
    })

    const result = await loadPersonDetailCustomFields({} as any, person, profile, 'tenant-1')

    expect(loadCustomFieldValuesMock).toHaveBeenCalledTimes(2)
    expect(result).toMatchSnapshot()
  })

  it('returns an empty object when neither entity nor profile have custom field values', async () => {
    loadCustomFieldValuesMock.mockResolvedValue({})

    const result = await loadPersonDetailCustomFields({} as any, person, null, 'tenant-1')

    expect(loadCustomFieldValuesMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchSnapshot()
  })
})
