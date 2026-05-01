import { Queue } from "bullmq"

export const BULLMQ_PREFIX = "twotter:queue"

export const QUEUE_NAMES = {
  mediaProcess: "media.process",
  githubUnfurl: "github.unfurl",
  youtubeUnfurl: "youtube.unfurl",
  genericUnfurl: "generic.unfurl",
  xUnfurl: "x.unfurl",
} as const

export type UnfurlJobPayload = {
  unfurlId: string
  url: string
  refKey: string
  provider: "github" | "youtube" | "x" | "generic"
}

function redisConnection(redisUrl: string) {
  return {
    url: redisUrl,
    maxRetriesPerRequest: null as null,
  }
}

export interface AppJobQueues {
  close: () => Promise<void>
  enqueueMediaProcess: (data: { mediaId: string }) => Promise<void>
  enqueueUnfurl: (j: UnfurlJobPayload) => Promise<void>
}

function unfurlQueueFor(
  queues: {
    github: Queue
    youtube: Queue
    generic: Queue
    x: Queue
  },
  provider: UnfurlJobPayload["provider"],
) {
  switch (provider) {
    case "youtube":
      return queues.youtube
    case "generic":
      return queues.generic
    case "x":
      return queues.x
    default:
      return queues.github
  }
}

export function createAppJobQueues(redisUrl: string): AppJobQueues {
  const connection = redisConnection(redisUrl)
  const base = { connection, prefix: BULLMQ_PREFIX }

  const mediaProcess = new Queue(QUEUE_NAMES.mediaProcess, {
    ...base,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  })

  const unfurlDefaults = {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 5000 },
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 500 },
  }

  const githubUnfurl = new Queue(QUEUE_NAMES.githubUnfurl, {
    ...base,
    defaultJobOptions: unfurlDefaults,
  })
  const youtubeUnfurl = new Queue(QUEUE_NAMES.youtubeUnfurl, {
    ...base,
    defaultJobOptions: unfurlDefaults,
  })
  const genericUnfurl = new Queue(QUEUE_NAMES.genericUnfurl, {
    ...base,
    defaultJobOptions: unfurlDefaults,
  })
  const xUnfurl = new Queue(QUEUE_NAMES.xUnfurl, {
    ...base,
    defaultJobOptions: unfurlDefaults,
  })

  const unfurlQueues = {
    github: githubUnfurl,
    youtube: youtubeUnfurl,
    generic: genericUnfurl,
    x: xUnfurl,
  }

  return {
    async close() {
      await Promise.all([
        mediaProcess.close(),
        githubUnfurl.close(),
        youtubeUnfurl.close(),
        genericUnfurl.close(),
        xUnfurl.close(),
      ])
    },
    async enqueueMediaProcess(data: { mediaId: string }) {
      await mediaProcess.add(QUEUE_NAMES.mediaProcess, data)
    },
    async enqueueUnfurl(j: UnfurlJobPayload) {
      const queue = unfurlQueueFor(unfurlQueues, j.provider)
      const name =
        j.provider === "youtube"
          ? QUEUE_NAMES.youtubeUnfurl
          : j.provider === "generic"
            ? QUEUE_NAMES.genericUnfurl
            : j.provider === "x"
              ? QUEUE_NAMES.xUnfurl
              : QUEUE_NAMES.githubUnfurl
      await queue.add(name, {
        unfurlId: j.unfurlId,
        url: j.url,
        refKey: j.refKey,
      })
    },
  }
}
