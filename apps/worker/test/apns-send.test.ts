import { describe, expect, test } from "bun:test"
import { shouldDeleteToken } from "../src/jobs/apns-send.ts"

const cases: Array<[number, string | undefined, boolean]> = [
  [410, undefined, false],
  [400, "BadDeviceToken", true],
  [410, "Unregistered", true],
  [400, "Unregistered", true],
  [400, "DeviceTokenNotForTopic", false],
  [403, "TopicDisallowed", false],
  [500, "InternalServerError", false],
]

describe("shouldDeleteToken", () => {
  test.each(cases)("status %s reason %s returns %s", (status, reason, expected) => {
    expect(shouldDeleteToken(status, reason)).toBe(expected)
  })
})
