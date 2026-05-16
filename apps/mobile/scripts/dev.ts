#!/usr/bin/env bun
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const MOBILE_DIR = path.resolve(SCRIPT_DIR, "..")
const REPO_ROOT = path.resolve(MOBILE_DIR, "..", "..")
const DERIVED_DATA = path.join(MOBILE_DIR, "DerivedData")
const PROJECT = "twitbruv.xcodeproj"
const SCHEME = "twitbruv"
const FALLBACK_SIM_NAME = "iPhone 17 Pro Max"

interface SimDevice {
  udid: string
  name: string
  state: string
  runtime: string
}

const COLOR_API = "\x1b[34m"
const COLOR_MOBILE = "\x1b[35m"
const COLOR_ERR = "\x1b[31m"
const COLOR_RESET = "\x1b[0m"

const log = (msg: string) =>
  console.log(`${COLOR_MOBILE}[dev:mobile]${COLOR_RESET} ${msg}`)
const err = (msg: string) =>
  console.error(`${COLOR_ERR}[dev:mobile]${COLOR_RESET} ${msg}`)

function run(
  cmd: string,
  args: ReadonlyArray<string>,
  opts: SpawnOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      ...opts,
    })
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${cmd} terminated by ${signal}`))
      else if (code !== 0)
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`))
      else resolve()
    })
  })
}

function capture(
  cmd: string,
  args: ReadonlyArray<string>,
  opts: SpawnOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (d) => {
      stdout += String(d)
    })
    child.stderr?.on("data", (d) => {
      stderr += String(d)
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout)
      else
        reject(new Error(`${cmd} exited with code ${code}\n${stderr.trim()}`))
    })
  })
}

async function listSimulators(): Promise<SimDevice[]> {
  const stdout = await capture("xcrun", [
    "simctl",
    "list",
    "devices",
    "available",
    "--json",
  ])
  const parsed = JSON.parse(stdout) as {
    devices: Record<
      string,
      Array<{ udid: string; name: string; state: string }>
    >
  }
  const out: SimDevice[] = []
  for (const [runtime, list] of Object.entries(parsed.devices)) {
    if (!runtime.includes("iOS")) continue
    for (const d of list) {
      out.push({
        udid: d.udid,
        name: d.name,
        state: d.state,
        runtime,
      })
    }
  }
  return out
}

async function pickSimulator(): Promise<SimDevice> {
  const all = await listSimulators()
  if (all.length === 0) {
    throw new Error(
      "No iOS simulators are available. Install one via Xcode → Settings → Components."
    )
  }
  const booted = all.find((d) => d.state === "Booted")
  if (booted) {
    log(`Using booted simulator: ${booted.name} (${booted.udid})`)
    return booted
  }
  const fallback = all.find((d) => d.name === FALLBACK_SIM_NAME)
  if (fallback) {
    log(
      `No booted simulator; using fallback: ${fallback.name} (${fallback.udid})`
    )
    return fallback
  }
  throw new Error(
    `No booted simulator and fallback "${FALLBACK_SIM_NAME}" not installed.\n` +
      `Available: ${all.map((d) => d.name).join(", ")}`
  )
}

async function ensureBooted(sim: SimDevice): Promise<void> {
  if (sim.state === "Booted") return
  log(`Booting ${sim.name}…`)
  await run("xcrun", ["simctl", "boot", sim.udid])
  spawn("open", ["-a", "Simulator"], {
    stdio: "ignore",
    detached: true,
  }).unref()
}

interface BuildOutput {
  appPath: string
  bundleId: string
}

async function buildApp(sim: SimDevice): Promise<BuildOutput> {
  log(`Building ${SCHEME} for ${sim.name}…`)
  await run(
    "xcodebuild",
    [
      "-project",
      PROJECT,
      "-scheme",
      SCHEME,
      "-destination",
      `platform=iOS Simulator,id=${sim.udid}`,
      "-derivedDataPath",
      DERIVED_DATA,
      "-quiet",
      "build",
    ],
    { cwd: MOBILE_DIR }
  )

  const settingsJson = await capture(
    "xcodebuild",
    [
      "-project",
      PROJECT,
      "-scheme",
      SCHEME,
      "-destination",
      `platform=iOS Simulator,id=${sim.udid}`,
      "-derivedDataPath",
      DERIVED_DATA,
      "-showBuildSettings",
      "-json",
    ],
    { cwd: MOBILE_DIR }
  )
  const settings = JSON.parse(settingsJson) as Array<{
    target?: string
    buildSettings: {
      BUILT_PRODUCTS_DIR?: string
      FULL_PRODUCT_NAME?: string
      PRODUCT_BUNDLE_IDENTIFIER?: string
      WRAPPER_NAME?: string
    }
  }>
  const appTarget = settings.find(
    (s) =>
      s.buildSettings.PRODUCT_BUNDLE_IDENTIFIER &&
      (
        s.buildSettings.WRAPPER_NAME ?? s.buildSettings.FULL_PRODUCT_NAME
      )?.endsWith(".app")
  )?.buildSettings
  if (
    !appTarget?.BUILT_PRODUCTS_DIR ||
    !(appTarget.FULL_PRODUCT_NAME ?? appTarget.WRAPPER_NAME) ||
    !appTarget.PRODUCT_BUNDLE_IDENTIFIER
  ) {
    throw new Error(
      "Could not resolve built .app path from xcodebuild settings"
    )
  }
  const productName = appTarget.FULL_PRODUCT_NAME ?? appTarget.WRAPPER_NAME!
  return {
    appPath: path.join(appTarget.BUILT_PRODUCTS_DIR, productName),
    bundleId: appTarget.PRODUCT_BUNDLE_IDENTIFIER,
  }
}

async function installAndLaunch(
  sim: SimDevice,
  build: BuildOutput
): Promise<void> {
  log(`Installing ${build.bundleId}…`)
  await run("xcrun", ["simctl", "install", sim.udid, build.appPath])
  log(`Launching ${build.bundleId}…`)
  await run("xcrun", ["simctl", "launch", sim.udid, build.bundleId])
  log("Mobile app launched ✓")
}

function startApiAndWorker(): ChildProcess {
  log("Starting API + worker (turbo dev --filter=api --filter=worker)…")
  return spawn(
    "bun",
    ["x", "turbo", "dev", "--filter=api", "--filter=worker"],
    {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
    }
  )
}

async function main() {
  const turbo = startApiAndWorker()
  let exitingByUs = false

  const stopTurbo = (signal: NodeJS.Signals) => {
    if (turbo.exitCode !== null || turbo.signalCode) return
    log(`Stopping API + worker (${signal})…`)
    turbo.kill(signal)
  }

  process.on("SIGINT", () => {
    exitingByUs = true
    stopTurbo("SIGINT")
  })
  process.on("SIGTERM", () => {
    exitingByUs = true
    stopTurbo("SIGTERM")
  })

  turbo.on("exit", (code, signal) => {
    if (signal) {
      log(`API + worker stopped (${signal})`)
    } else {
      log(`API + worker exited (code ${code ?? 0})`)
    }
    process.exit(exitingByUs ? 0 : (code ?? 0))
  })

  try {
    const sim = await pickSimulator()
    await ensureBooted(sim)
    const build = await buildApp(sim)
    await installAndLaunch(sim, build)
    log(
      `${COLOR_API}API + worker logs continue below.${COLOR_RESET} Press Ctrl+C to stop.`
    )
  } catch (e) {
    err(e instanceof Error ? e.message : String(e))
    exitingByUs = true
    stopTurbo("SIGTERM")
    process.exit(1)
  }
}

main().catch((e) => {
  err(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
