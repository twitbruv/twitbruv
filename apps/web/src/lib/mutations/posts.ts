import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type Post } from "../api"
import {
  invalidateFeedCaches,
  removePostEverywhere,
  updatePostEverywhere,
} from "../query-cache"
import { qk } from "../query-keys"

export function useTogglePostLike(innerPost: Post) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      innerPost.viewer?.liked ? api.unlike(innerPost.id) : api.like(innerPost.id),
    onMutate: () => {
      const was = innerPost.viewer?.liked ?? false
      updatePostEverywhere(qc, innerPost.id, (p) => ({
        ...p,
        viewer: {
          liked: !was,
          bookmarked: p.viewer?.bookmarked ?? false,
          reposted: p.viewer?.reposted ?? false,
        },
        counts: {
          ...p.counts,
          likes: p.counts.likes + (was ? -1 : 1),
        },
      }))
    },
  })
}

export function useTogglePostRepost(innerPost: Post) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      innerPost.viewer?.reposted
        ? api.unrepost(innerPost.id)
        : api.repost(innerPost.id),
    onMutate: () => {
      const was = innerPost.viewer?.reposted ?? false
      updatePostEverywhere(qc, innerPost.id, (p) => ({
        ...p,
        viewer: {
          reposted: !was,
          liked: p.viewer?.liked ?? false,
          bookmarked: p.viewer?.bookmarked ?? false,
        },
        counts: {
          ...p.counts,
          reposts: p.counts.reposts + (was ? -1 : 1),
        },
      }))
    },
  })
}

export function useTogglePostBookmark(innerPost: Post) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      innerPost.viewer?.bookmarked
        ? api.unbookmark(innerPost.id)
        : api.bookmark(innerPost.id),
    onMutate: () => {
      const was = innerPost.viewer?.bookmarked ?? false
      updatePostEverywhere(qc, innerPost.id, (p) => ({
        ...p,
        viewer: {
          bookmarked: !was,
          liked: p.viewer?.liked ?? false,
          reposted: p.viewer?.reposted ?? false,
        },
        counts: {
          ...p.counts,
          bookmarks: p.counts.bookmarks + (was ? -1 : 1),
        },
      }))
      qc.invalidateQueries({ queryKey: qk.bookmarks() })
    },
  })
}

export function useVotePollMutation(postId: string, pollId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (optionIds: Array<string>) => api.votePoll(pollId, optionIds),
    onSuccess: () => {
      invalidateFeedCaches(qc, postId)
    },
  })
}

export function useDeletePostMutation(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.deletePost(postId),
    onSuccess: () => {
      removePostEverywhere(qc, postId)
    },
  })
}
