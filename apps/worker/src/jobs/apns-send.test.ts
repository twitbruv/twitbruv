import { describe, expect, test } from "bun:test"
import { shouldDeleteToken } from "./apns-send.ts"

describe("shouldDeleteToken", () => {
  test.each([
    [410, undefined, true],
    [400, "BadDeviceToken", true],
    [400, "Unregistered", true],
    [400, "DeviceTokenNotForTopic", false],
    [403, "TopicDisallowed", false],
    [500, "InternalServerError", false],
  ])("status %s reason %s returns %s", (status, reason, expected) => {
    expect(shouldDeleteToken(status, reason)).toBe(expected)
  })
})
