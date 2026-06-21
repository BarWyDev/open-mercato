import * as React from 'react'
import type { useRouter } from 'next/navigation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { deleteCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import type { useT } from '@open-mercato/shared/lib/i18n/context'
import type { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import type { TagsSectionController } from '@open-mercato/ui/backend/detail'
import {
  buildPersonEditPayload,
  type PersonEditFormValues,
  type PersonOverview,
} from '../../../../../components/formConfig'

type UsePersonGuardedMutationOptions = {
  data: PersonOverview | null
  dataRef: React.RefObject<PersonOverview | null>
  organizationId: string | null | undefined
  loadData: (lockTokenOverride?: string | null) => Promise<void>
  runMutationWithContext: <T>(operation: () => Promise<T>, mutationPayload?: Record<string, unknown>) => Promise<T>
  formWrapperRef: React.RefObject<HTMLDivElement | null>
  tagsSectionControllerRef: React.RefObject<TagsSectionController | null>
  confirm: ReturnType<typeof useConfirmDialog>['confirm']
  router: ReturnType<typeof useRouter>
  t: ReturnType<typeof useT>
}

type UsePersonGuardedMutationResult = {
  isSaving: boolean
  handleFormSubmit: (values: PersonEditFormValues) => Promise<void>
  handleFormDelete: () => Promise<void>
  handleHeaderSave: () => void
}

export function usePersonGuardedMutation({
  data,
  dataRef,
  organizationId,
  loadData,
  runMutationWithContext,
  formWrapperRef,
  tagsSectionControllerRef,
  confirm,
  router,
  t,
}: UsePersonGuardedMutationOptions): UsePersonGuardedMutationResult {
  const [isSaving, setIsSaving] = React.useState(false)

  const handleFormSubmit = React.useCallback(
    async (values: PersonEditFormValues) => {
      setIsSaving(true)
      try {
        await tagsSectionControllerRef.current?.flush()

        let payload: Record<string, unknown>
        try {
          payload = buildPersonEditPayload(values, organizationId)
        } catch (err) {
          if (err instanceof Error && err.message === 'DISPLAY_NAME_REQUIRED') {
            const message = t('customers.people.form.displayName.error')
            throw createCrudFormError(message, { displayName: message })
          }
          throw err
        }

        // Attach the current optimistic-lock token directly on this write path so
        // every header-field edit (displayName/status/…) carries `updatedAt`, not
        // just the fields the embedded CrudForm intercepts. Read from `dataRef` so
        // the token reflects the latest in-page reload rather than a stale closure
        // capture, and let the 409 propagate to CrudForm's surfaceRecordConflict so
        // the unified conflict bar renders (#2055, Alina A7).
        const lockedUpdatedAt = dataRef.current?.person?.updatedAt
          ?? dataRef.current?.person?.updated_at
          ?? null
        const updateResponse = await withScopedApiRequestHeaders(
          buildOptimisticLockHeader(lockedUpdatedAt),
          () => updateCrud<{ updatedAt?: string | null }>('customers/people', payload),
        )
        flash(t('customers.people.form.updateSuccess', 'Person updated.'), 'success')
        // Refresh the view and pin the optimistic-lock token to the write's OWN
        // authoritative `updatedAt` in a single reload (see loadData) so a
        // concurrent third-party bump stays stale on the next save (#2055, Alina A7).
        const savedUpdatedAt = typeof updateResponse.result?.updatedAt === 'string'
          ? updateResponse.result.updatedAt
          : null
        await loadData(savedUpdatedAt)
      } finally {
        setIsSaving(false)
      }
    },
    [loadData, organizationId, t],
  )

  const handleFormDelete = React.useCallback(
    async () => {
      const personId = data?.person?.id ?? ''
      if (!personId) return
      const approved = await confirm({
        title: t('customers.people.detail.deleteConfirmTitle', 'Delete person?'),
        description: t('customers.people.detail.deleteConfirmDescription', 'This action cannot be undone.'),
        confirmText: t('customers.people.detail.actions.delete', 'Delete'),
        cancelText: t('customers.people.detail.actions.cancel', 'Cancel'),
        variant: 'destructive',
      })
      if (!approved) return
      try {
        await runMutationWithContext(
          () => withScopedApiRequestHeaders(
            buildOptimisticLockHeader(data?.person?.updatedAt ?? data?.person?.updated_at ?? null),
            () => deleteCrud('customers/people', { id: personId }),
          ),
          { id: personId, operation: 'deletePerson' },
        )
      } catch (err) {
        // The guarded mutation routes a 409 to the unified conflict bar; surface
        // any other server error (e.g. a linked-records delete guard) as a flash
        // instead of letting it crash the page.
        if (!surfaceRecordConflict(err, t)) {
          flash(
            err instanceof Error && err.message.trim().length > 0
              ? err.message
              : t('customers.people.detail.deleteError', 'Failed to delete person.'),
            'error',
          )
        }
        return
      }
      flash(t('customers.people.list.deleteSuccess', 'Person deleted.'), 'success')
      router.push('/backend/customers/people')
    },
    [confirm, data?.person?.id, router, runMutationWithContext, t],
  )

  const handleHeaderSave = React.useCallback(() => {
    const form = formWrapperRef.current?.querySelector('form')
    if (form) form.requestSubmit()
  }, [formWrapperRef])

  return {
    isSaving,
    handleFormSubmit,
    handleFormDelete,
    handleHeaderSave,
  }
}
