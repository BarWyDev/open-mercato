const findWithDecryptionMock = jest.fn()

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: (...args: unknown[]) => findWithDecryptionMock(...args),
}))

import { loadCustomerUserSummaries } from '../customerUserSummary'

describe('loadCustomerUserSummaries', () => {
  beforeEach(() => {
    findWithDecryptionMock.mockReset()
  })

  it('maps multiple users by id with decrypted name/email', async () => {
    findWithDecryptionMock.mockResolvedValueOnce([
      { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      { id: 'u2', name: 'Bob', email: 'bob@example.com' },
    ])

    const result = await loadCustomerUserSummaries({} as any, ['u1', 'u2'], {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
    })

    expect(findWithDecryptionMock).toHaveBeenCalledTimes(1)
    const [, , where, , scope] = findWithDecryptionMock.mock.calls[0]
    expect(where).toEqual({ id: { $in: ['u1', 'u2'] } })
    expect(scope).toEqual({ tenantId: 'tenant-1', organizationId: 'org-1' })

    expect(result.get('u1')).toEqual({ id: 'u1', name: 'Alice', email: 'alice@example.com' })
    expect(result.get('u2')).toEqual({ id: 'u2', name: 'Bob', email: 'bob@example.com' })
  })

  it('returns an empty map without calling findWithDecryption when userIds is empty', async () => {
    const result = await loadCustomerUserSummaries({} as any, [])

    expect(findWithDecryptionMock).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it('omits a userId with no matching User row', async () => {
    findWithDecryptionMock.mockResolvedValueOnce([
      { id: 'u1', name: 'Alice', email: 'alice@example.com' },
    ])

    const result = await loadCustomerUserSummaries({} as any, ['u1', 'missing'])

    expect(result.has('u1')).toBe(true)
    expect(result.has('missing')).toBe(false)
  })
})
