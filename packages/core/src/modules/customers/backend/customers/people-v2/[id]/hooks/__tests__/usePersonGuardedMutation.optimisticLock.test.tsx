/** @jest-environment jsdom */

import { OPTIMISTIC_LOCK_HEADER_NAME } from '@open-mercato/shared/lib/crud/optimistic-lock-headers'

const updateCrudMock = jest.fn()
const deleteCrudMock = jest.fn()
const scopedHeaderCalls: Array<Record<string, string>> = []

jest.mock('@open-mercato/ui/backend/utils/crud', () => ({
  updateCrud: (...args: unknown[]) => updateCrudMock(...args),
  deleteCrud: (...args: unknown[]) => deleteCrudMock(...args),
}))

jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({
  withScopedApiRequestHeaders: <T,>(headers: Record<string, string>, run: () => Promise<T>) => {
    scopedHeaderCalls.push(headers)
    return run()
  },
}))

jest.mock('@open-mercato/ui/backend/FlashMessages', () => ({ flash: jest.fn() }))

jest.mock('@open-mercato/ui/backend/conflicts', () => ({ surfaceRecordConflict: jest.fn(() => false) }))

jest.mock('@open-mercato/ui/backend/utils/serverErrors', () => ({ createCrudFormError: jest.fn() }))

jest.mock('../../../../../../components/formConfig', () => ({
  buildPersonEditPayload: jest.fn(() => ({})),
}))

import { act, renderHook } from '@testing-library/react'
import type { useRouter } from 'next/navigation'
import type { useT } from '@open-mercato/shared/lib/i18n/context'
import type { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { usePersonGuardedMutation } from '../usePersonGuardedMutation'
import type { PersonOverview } from '../../../../../../components/formConfig'

const UPDATED_AT = '2026-05-28T08:42:18.123Z'

const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as ReturnType<typeof useT>

function buildData(): PersonOverview {
  return {
    person: {
      id: 'person-1',
      displayName: 'Jane Doe',
      updatedAt: UPDATED_AT,
    },
    profile: null,
    customFields: {},
    tags: [],
    comments: [],
    activities: [],
    interactions: [],
    deals: [],
    todos: [],
  }
}

describe('usePersonGuardedMutation — optimistic-lock header wiring', () => {
  beforeEach(() => {
    updateCrudMock.mockReset().mockResolvedValue({ result: { updatedAt: UPDATED_AT } })
    deleteCrudMock.mockReset().mockResolvedValue({ ok: true })
    scopedHeaderCalls.length = 0
  })

  it('sends the expected updated_at header on person update', async () => {
    const data = buildData()
    const dataRef = { current: data as PersonOverview | null }
    const { result } = renderHook(() =>
      usePersonGuardedMutation({
        data,
        dataRef,
        organizationId: 'org-1',
        loadData: async () => {},
        runMutationWithContext: (op) => op(),
        formWrapperRef: { current: null },
        tagsSectionControllerRef: { current: null },
        confirm: jest.fn(async () => true) as unknown as ReturnType<typeof useConfirmDialog>['confirm'],
        router: { push: jest.fn() } as unknown as ReturnType<typeof useRouter>,
        t,
      }),
    )

    await act(async () => {
      await result.current.handleFormSubmit({} as never)
    })

    expect(updateCrudMock).toHaveBeenCalledTimes(1)
    expect(scopedHeaderCalls).toContainEqual({ [OPTIMISTIC_LOCK_HEADER_NAME]: UPDATED_AT })
  })

  it('sends the expected updated_at header on person delete', async () => {
    const data = buildData()
    const dataRef = { current: data as PersonOverview | null }
    const { result } = renderHook(() =>
      usePersonGuardedMutation({
        data,
        dataRef,
        organizationId: 'org-1',
        loadData: async () => {},
        runMutationWithContext: (op) => op(),
        formWrapperRef: { current: null },
        tagsSectionControllerRef: { current: null },
        confirm: jest.fn(async () => true) as unknown as ReturnType<typeof useConfirmDialog>['confirm'],
        router: { push: jest.fn() } as unknown as ReturnType<typeof useRouter>,
        t,
      }),
    )

    await act(async () => {
      await result.current.handleFormDelete()
    })

    expect(deleteCrudMock).toHaveBeenCalledTimes(1)
    expect(scopedHeaderCalls).toContainEqual({ [OPTIMISTIC_LOCK_HEADER_NAME]: UPDATED_AT })
  })
})
