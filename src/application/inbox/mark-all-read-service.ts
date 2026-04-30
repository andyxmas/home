export type MarkAllReadRepository = {
  markAllActiveAsRead(): Promise<number>
}

export type MarkAllReadResult = {
  changedCount: number
}

export function createMarkAllReadService(dependencies: { notificationRepository: MarkAllReadRepository }) {
  return {
    async markAllAsRead(): Promise<MarkAllReadResult> {
      const changedCount = await dependencies.notificationRepository.markAllActiveAsRead()
      return { changedCount }
    },
  }
}
